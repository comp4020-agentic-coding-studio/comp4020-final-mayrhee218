// Who this device is, and its line to everyone else. No accounts yet: a name,
// an emoji and a random id live in this browser only.
const KEY = "the-space:me";
const AVATARS = ["🙂", "🦊", "🐧", "🤖", "👾", "🌙", "🌻", "🐙"];

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {}
  return {
    avatar: AVATARS.includes(saved.avatar) ? saved.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)],
    name: typeof saved.name === "string" ? saved.name : "",
    clientId: saved.clientId ?? crypto.randomUUID(),
  };
}

let socket = null;

export const me = load();
save();

export function save(changes = {}) {
  Object.assign(me, changes);
  try {
    localStorage.setItem(KEY, JSON.stringify(me));
  } catch {}
  hello();
}

function hello() {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "hello", avatar: me.avatar, name: me.name }));
  }
}

// Calls onMessage for every live update; reconnects with backoff, and calls
// onState("live" | "reconnecting") so the page can say which it is.
export function connectLive(onMessage, onState = () => {}) {
  let retry = 500;
  const open = () => {
    socket = new WebSocket(new URL("/live", location.href.replace(/^http/, "ws")));
    socket.addEventListener("open", () => {
      retry = 500;
      hello();
      onState("live");
    });
    socket.addEventListener("message", (event) => onMessage(JSON.parse(event.data)));
    socket.addEventListener("close", () => {
      onState("reconnecting");
      setTimeout(open, (retry = Math.min(retry * 2, 10_000)));
    });
  };
  open();
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
