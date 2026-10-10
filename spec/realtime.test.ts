import { readFileSync } from "node:fs";
import { afterEach, expect, inject, it } from "vitest";

// Crit 9: a change one person makes appears in every other open session
// within about a second, with no reload. Each open page holds a WebSocket at
// /live; these tests stand in for several people with the app open at once.
const baseUrl = inject("baseUrl");
const liveUrl = new URL("/live", baseUrl.replace(/^http/, "ws"));
const WITHIN_MS = 1000;
const clip = readFileSync(new URL("./fixtures/tiny.webm", import.meta.url));

type Message = { type: string; [key: string]: unknown };
type Video = { id: string; caption: string; src: string; likes: number; comments: { text: string }[] };

const open: WebSocket[] = [];
afterEach(() => {
  for (const ws of open.splice(0)) ws.close();
});

async function join(avatar: string, name: string) {
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

async function post(caption: string, body: Uint8Array = clip, type = "video/webm"): Promise<Response> {
  const query = new URLSearchParams({ caption, name: "poster", avatar: "🐧", source: "upload" });
  return fetch(new URL(`/videos?${query}`, baseUrl), { method: "POST", headers: { "content-type": type }, body });
}

it("a video posted by one person reaches another open session without a reload, and plays", async () => {
  const watcher = await join("🦊", "watcher");
  const caption = unique();

  const res = await post(caption);
  expect(res.status).toBe(201);

  const msg = await watcher.next((m) => m.type === "video" && (m.video as Video).caption === caption);
  const video = msg.video as Video;
  expect(video).toMatchObject({ caption, likes: 0 });

  const media = await fetch(new URL(video.src, baseUrl), { headers: { range: "bytes=0-3" } });
  expect(media.status).toBe(206);
  expect(new Uint8Array(await media.arrayBuffer())).toEqual(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
});

it("a like and a comment reach everyone watching within a second", async () => {
  const video = (await (await post(unique())).json()) as Video;
  const watcher = await join("🌙", "watcher");

  await fetch(new URL(`/videos/${video.id}/like`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: unique(), liked: true }),
  });
  await watcher.next((m) => m.type === "likes" && m.id === video.id && m.likes === 1);

  const text = unique();
  await fetch(new URL(`/videos/${video.id}/comments`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "commenter", avatar: "🐙", text }),
  });
  await watcher.next((m) => m.type === "comment" && m.id === video.id && (m.comment as { text: string }).text === text);
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

// Uploads are untrusted: a file has to look like a video, not just claim to.
it("refuses a file that only claims to be a video", async () => {
  const res = await post(unique(), new TextEncoder().encode("<script>alert(1)</script>"), "video/webm");
  expect(res.status).toBe(415);
});
