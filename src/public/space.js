// Keeps the page live: who's here right now, and traces as they're left.
// Everything below is an enhancement; the server-rendered page and plain
// form still work if this never loads.
const here = document.getElementById("here");
const traces = document.getElementById("traces");
const form = document.getElementById("leave");
const nameInput = form.elements.namedItem("name");
const textInput = form.elements.namedItem("text");

const KEY = "the-space:me";
let me = { avatar: form.elements.namedItem("avatar").value, name: "" };
try {
  Object.assign(me, JSON.parse(localStorage.getItem(KEY) ?? "{}"));
} catch {}
nameInput.value = me.name;
const chosen = [...form.querySelectorAll('input[name="avatar"]')].find((r) => r.value === me.avatar);
if (chosen) chosen.checked = true;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPresence(people) {
  here.replaceChildren(
    ...people.map((p) => {
      const person = el("span", p.id === myId ? "person me" : "person");
      person.append(el("span", "", p.avatar), el("span", "", p.id === myId ? "you" : p.name || "someone"));
      return person;
    }),
  );
  if (!people.length) here.append(el("span", "empty", "no one else is here right now"));
}

function renderTrace(t) {
  traces.querySelector(".empty")?.remove();
  const li = el("li", "trace arrived");
  const body = el("span");
  body.append(el("strong", "", t.name || "someone"), el("div", "", t.text), el("div", "meta", "just now"));
  li.append(el("span", "avatar", t.avatar), body);
  traces.prepend(li);
}

let ws;
let myId = null;
let retry = 500;

function hello() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "hello", ...me }));
}

function connect() {
  ws = new WebSocket(new URL("/live", location.href.replace(/^http/, "ws")));
  ws.addEventListener("open", () => {
    retry = 500;
    hello();
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "welcome") myId = msg.id;
    if (msg.type === "presence") renderPresence(msg.people);
    if (msg.type === "trace") renderTrace(msg.trace);
  });
  ws.addEventListener("close", () => {
    here.replaceChildren(el("span", "empty", "reconnecting…"));
    setTimeout(connect, (retry = Math.min(retry * 2, 10_000)));
  });
}
connect();

function remember() {
  me = { avatar: form.elements.namedItem("avatar").value, name: nameInput.value.trim().slice(0, 40) };
  try {
    localStorage.setItem(KEY, JSON.stringify(me));
  } catch {}
  hello();
}
form.addEventListener("change", remember);
let typing;
nameInput.addEventListener("input", () => {
  clearTimeout(typing);
  typing = setTimeout(remember, 400);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  remember();
  const res = await fetch(form.action, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams(new FormData(form)),
  });
  if (res.ok) textInput.value = "";
});
