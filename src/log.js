import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

// One line per event, on stdout, so `flyctl logs` reads as a running account
// of who did what. Every line starts with its kind, so it can be filtered
// (`flyctl logs | grep REJECT`), then the person, by name and handle, so two
// people who both call themselves "mia" still read apart:
//
//   [JOIN]     kai🐧#vOec7_3aaZ connected to /live (2 open)
//   [SNAPSHOT] → kai🐧#vOec7_3aaZ welcome + presence: 2 here
//   [RECV]     kai🐧#vOec7_3aaZ DELETE /videos/67ec4838 (r:3fa1)
//   [REJECT]   kai🐧#vOec7_3aaZ DELETE /videos/67ec4838: 403 that video isn't yours to delete (r:3fa1)
//   [DONE]     mia🦊#gP1ibn5deQ deleted video 67ec4838 "hi" (r:9c02)
//   [BCAST]    video-removed 67ec4838 → 2 sockets (r:9c02)
//   [LEAVE]    kai🐧#vOec7_3aaZ left the room (1 here)
//
// The kinds:
//   JOIN      a socket connects to /live, then says who it is (joins the room)
//   LEAVE     someone leaves the room, or their socket closes or times out
//   RECV      the server receives an action: an HTTP change, or a socket message
//   DONE      the action changed shared state
//   REJECT    the action was refused, and why
//   BCAST     an update sent to every open socket, and how many got it
//   SNAPSHOT  the current state sent to one person: the feed, or presence
//
// (r:xxxx) ties together the lines one request caused: its RECV, then its
// DONE or REJECT, then any BCAST it set off.
//
// The handle is the public one (src/identity.js), never the cookie token, so
// the logs are safe to paste into an issue or show at a crit.

// The last name and avatar each handle used. Deletes and likes don't carry a
// name, so this is what lets their log lines say who. Seeded at boot from
// what's stored, so a restart doesn't turn everyone into bare handles.
const known = new Map(); // handle -> { name, avatar }

export function remember(by, { name, avatar }) {
  if (by) known.set(by, { name, avatar });
}

export function who(by) {
  if (!by) return "(no cookie)";
  const p = known.get(by);
  return p ? `${p.name || "someone"}${p.avatar}#${by}` : `#${by}`;
}

export const quote = (text, max = 40) => {
  const s = String(text).replace(/\s+/g, " ");
  return JSON.stringify(s.length > max ? `${s.slice(0, max)}…` : s);
};

export const shortId = (id) => String(id).slice(0, 8);

// The request (or socket message) being handled right now, so a line logged
// anywhere inside it, a broadcast included, carries its id without passing it.
const context = new AsyncLocalStorage();
export const newRequestId = () => randomBytes(2).toString("hex");
export const withRequest = (rid, fn) => context.run({ rid }, fn);

function line(kind, text) {
  const rid = context.getStore()?.rid;
  console.log(`${`[${kind}]`.padEnd(10)} ${text}${rid ? ` (r:${rid})` : ""}`);
}

export const joined = (by, what) => line("JOIN", `${who(by)} ${what}`);
export const left = (by, what) => line("LEAVE", `${who(by)} ${what}`);
export const received = (by, what) => line("RECV", `${who(by)} ${what}`);
export const act = (by, what) => line("DONE", `${who(by)} ${what}`);
export const rejected = (by, what) => line("REJECT", `${who(by)} ${what}`);
export const broadcasted = (what, sockets) => line("BCAST", `${what} → ${sockets} socket${sockets === 1 ? "" : "s"}`);
export const snapshot = (by, what) => line("SNAPSHOT", `→ ${who(by)} ${what}`);
