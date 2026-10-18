import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Crit 10: the server tells people apart and decides what each may change.
// A person is one browser: the server hands it an identity cookie on its
// first visit. Each `person()` here is a separate browser with its own cookie
// jar, the same as two Chrome profiles. The rules are written down in
// docs/decisions/0002-who-may-change-what.md.
const baseUrl = inject("baseUrl");
const clip = readFileSync(new URL("./fixtures/tiny.webm", import.meta.url));

type Comment = { id: string; text: string; by: string };
type Video = { id: string; caption: string; by: string; likes: number; comments: Comment[] };

async function person() {
  const first = await fetch(new URL("/", baseUrl));
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie, "the first visit should hand the browser an identity cookie").not.toBe("");
  const send = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseUrl), { ...init, headers: { ...init.headers, cookie } });
  return {
    cookie,
    send,
    async post(caption: string) {
      const query = new URLSearchParams({ caption, name: "poster", avatar: "🐧", source: "upload" });
      const res = await send(`/videos?${query}`, {
        method: "POST",
        headers: { "content-type": "video/webm" },
        body: new Blob([new Uint8Array(clip)]),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as Video;
    },
    async comment(videoId: string, text: string) {
      const res = await send(`/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "commenter", avatar: "🦊", text }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as Comment;
    },
    like: (videoId: string, liked: boolean, extra: object = {}) =>
      send(`/videos/${videoId}/like`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ liked, ...extra }),
      }),
  };
}

const unique = () => `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

it("two browsers get different identities, and what they make is told apart", async () => {
  const alice = await person();
  const bob = await person();
  expect(alice.cookie).not.toBe(bob.cookie);

  const a = await alice.post(unique());
  const b = await bob.post(unique());
  expect(a.by).toBeTruthy();
  expect(b.by).toBeTruthy();
  expect(a.by).not.toBe(b.by);
  // The public handle is not the cookie: seeing someone's handle mustn't let
  // you act as them.
  expect(alice.cookie).not.toContain(a.by);
  expect(JSON.stringify(a)).not.toContain(alice.cookie.split("=")[1]);
});

it("only the poster can delete their video", async () => {
  const alice = await person();
  const bob = await person();
  const video = await alice.post(unique());

  expect((await bob.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(403);
  expect((await alice.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await alice.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(404);
});

it("a comment can be deleted by whoever wrote it or by the video's poster, and no one else", async () => {
  const poster = await person();
  const writer = await person();
  const stranger = await person();
  const video = await poster.post(unique());

  const first = await writer.comment(video.id, "first");
  const second = await writer.comment(video.id, "second");
  expect(first.by).toBeTruthy();

  const del = (who: Awaited<ReturnType<typeof person>>, c: Comment) =>
    who.send(`/videos/${video.id}/comments/${c.id}`, { method: "DELETE" });
  expect((await del(stranger, first)).status).toBe(403);
  expect((await del(writer, first)).status).toBe(204);
  expect((await del(poster, second)).status).toBe(204);
});

it("a browser's like counts once, whatever id it claims to be", async () => {
  const alice = await person();
  const bob = await person();
  const video = await alice.post(unique());

  await bob.like(video.id, true, { clientId: "one" });
  const res = await bob.like(video.id, true, { clientId: "two" });
  expect(await res.json()).toEqual({ likes: 1 });
  const both = await alice.like(video.id, true);
  expect(await both.json()).toEqual({ likes: 2 });
});
