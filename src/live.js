import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { handleFromCookie } from "./identity.js";
import { act, remember } from "./log.js";
import { AVATARS } from "./views.js";

// Everyone with the app open holds a socket at /live. Presence lives only in
// memory: it's "who is here right now", so a restart rightly forgets it.
const people = new Map(); // ws -> { id, avatar, name }
let wss = null;

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of wss?.clients ?? []) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
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
    ws.send(JSON.stringify({ type: "welcome", id, by }));
    // Late arrivals see who's already here before they introduce themselves.
    ws.send(JSON.stringify({ type: "presence", people: [...people.values()] }));

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type !== "hello") return;
      const first = !people.has(ws);
      const person = {
        id,
        avatar: AVATARS.includes(msg.avatar) ? msg.avatar : AVATARS[0],
        name: String(msg.name ?? "").trim().slice(0, 40),
      };
      people.set(ws, person);
      remember(by, person);
      act(by, first ? `arrived (${people.size} here)` : "changed their name or avatar");
      broadcastPresence();
    });

    ws.on("close", () => {
      if (people.delete(ws)) {
        act(by, `left (${people.size} here)`);
        broadcastPresence();
      }
    });
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
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(interval));
}
