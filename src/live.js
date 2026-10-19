import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { handleFromCookie } from "./identity.js";
import { broadcasted, joined, left, newRequestId, received, rejected, remember, snapshot, withRequest } from "./log.js";
import { AVATARS } from "./views.js";

// Everyone with the app open holds a socket at /live. Presence lives only in
// memory: it's "who is here right now", so a restart rightly forgets it.
const people = new Map(); // ws -> { id, avatar, name }
let wss = null;

// What a broadcast was about, for its BCAST line: the type and its subject.
const subject = (m) => {
  const id = m.video?.id ?? m.id;
  if (m.type === "presence") return `presence: ${m.people.length} here`;
  if (m.type === "likes") return `likes ${String(id).slice(0, 8)} = ${m.likes}`;
  return `${m.type}${id ? ` ${String(id).slice(0, 8)}` : ""}`;
};

function broadcast(message) {
  const data = JSON.stringify(message);
  let sent = 0;
  for (const ws of wss?.clients ?? []) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
      sent++;
    }
  }
  broadcasted(subject(message), sent);
}

function broadcastPresence() {
  broadcast({ type: "presence", people: [...people.values()] });
}

export { broadcast };

export function attachLive(server) {
  wss = new WebSocketServer({ server, path: "/live", maxPayload: 4 * 1024 });

  wss.on("connection", (ws, req) => {
    const id = randomUUID();
    // The upgrade carries the page's cookie, so the page learns its own handle
    // here and can offer delete on what it owns. The server still decides.
    const by = handleFromCookie(req.headers.cookie);
    joined(by, `connected to /live (${wss.clients.size} open)`);
    ws.send(JSON.stringify({ type: "welcome", id, by }));
    // Late arrivals see who's already here before they introduce themselves.
    ws.send(JSON.stringify({ type: "presence", people: [...people.values()] }));
    snapshot(by, `welcome + presence: ${people.size} here`);

    ws.on("message", (raw) =>
      withRequest(newRequestId(), () => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          received(by, "socket message");
          rejected(by, "socket message: not JSON");
          return;
        }
        received(by, `socket ${String(msg?.type ?? "?").slice(0, 20)}`);
        if (msg?.type !== "hello") {
          rejected(by, `socket ${String(msg?.type ?? "?").slice(0, 20)}: not a message this server takes`);
          return;
        }
        const first = !people.has(ws);
        const person = {
          id,
          avatar: AVATARS.includes(msg.avatar) ? msg.avatar : AVATARS[0],
          name: String(msg.name ?? "").trim().slice(0, 40),
        };
        people.set(ws, person);
        remember(by, person);
        if (first) joined(by, `joined the room (${people.size} here)`);
        else joined(by, "changed their name or avatar");
        broadcastPresence();
      }),
    );

    // A socket that never said hello was never in the room: its close is a
    // disconnect, not a leave.
    ws.on("close", (code) =>
      withRequest(newRequestId(), () => {
        if (people.delete(ws)) {
          left(by, `left the room (${people.size} here)${code === 1006 ? ", connection lost" : ""}`);
          broadcastPresence();
        } else left(by, `disconnected from /live before joining (${wss.clients.size} open)`);
      }),
    );
  });

  // Phones that sleep or lose signal never send a close; ping so their
  // avatar doesn't linger as "here" long after they've gone.
  const alive = new WeakSet();
  wss.on("connection", (ws) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
  });
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        // No pong for 30 s: a sleeping phone or a dropped network. Its close
        // handler logs the leave.
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(interval));
}
