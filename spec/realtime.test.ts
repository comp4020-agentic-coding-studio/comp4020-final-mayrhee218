import { afterEach, expect, inject, it } from "vitest";

// Crit 9: a change one person makes appears in every other open session
// within about a second, with no reload. Each open page holds a WebSocket at
// /live; these tests stand in for two people with the space open at once.
const baseUrl = inject("baseUrl");
const liveUrl = new URL("/live", baseUrl.replace(/^http/, "ws"));
const WITHIN_MS = 1000;

type Message = { type: string; [key: string]: unknown };

const open: WebSocket[] = [];
afterEach(() => {
  for (const ws of open.splice(0)) ws.close();
});

async function join(avatar: string, name: string): Promise<{ ws: WebSocket; next: (match: (m: Message) => boolean) => Promise<Message> }> {
  const ws = new WebSocket(liveUrl);
  open.push(ws);
  const seen: Message[] = [];
  const waiters: { match: (m: Message) => boolean; resolve: (m: Message) => void }[] = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as Message;
    seen.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`could not open ${liveUrl}`)), { once: true });
  });
  ws.send(JSON.stringify({ type: "hello", avatar, name }));

  const next = (match: (m: Message) => boolean) =>
    new Promise<Message>((resolve, reject) => {
      const already = seen.find(match);
      if (already) return resolve(already);
      const timer = setTimeout(() => reject(new Error(`nothing matching arrived within ${WITHIN_MS}ms`)), WITHIN_MS);
      waiters.push({ match, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  return { ws, next };
}

const unique = () => `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

it("a trace left by one person reaches another open session without a reload", async () => {
  const watcher = await join("🦊", "watcher");
  const text = unique();

  const res = await fetch(new URL("/traces", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ avatar: "🐧", name: "leaver", text }),
    redirect: "manual",
  });
  expect(res.status).toBeLessThan(400);

  const msg = await watcher.next((m) => m.type === "trace" && (m.trace as { text?: string })?.text === text);
  expect(msg.trace).toMatchObject({ avatar: "🐧", name: "leaver", text });
});

it("someone arriving shows up for everyone already here, and leaving removes them", async () => {
  const here = await join("🌙", unique());
  const name = unique();
  const arriving = await join("🐙", name);

  const isPresent = (m: Message) =>
    m.type === "presence" && (m.people as { name: string }[]).some((p) => p.name === name);
  const present = await here.next(isPresent);
  expect((present.people as { name: string; avatar: string }[]).find((p) => p.name === name)).toMatchObject({ avatar: "🐙" });

  arriving.ws.close();
  await here.next((m) => m.type === "presence" && !isPresent(m));
});
