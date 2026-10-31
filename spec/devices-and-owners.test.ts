import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// One person on two devices, and an owner who can remove anything. The rules
// are written down in docs/decisions/0005-devices-and-owners.md. As in
// permissions.test.ts, each `person()` is a separate browser with its own
// cookie jar.
const baseUrl = inject("baseUrl");
const clip = readFileSync(new URL("./fixtures/tiny.webm", import.meta.url));

type Video = { id: string; by: string };
type Comment = { id: string; by: string };

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function person(cookie?: string) {
  let jar = cookie ?? cookieFrom(await fetch(new URL("/", baseUrl)));
  const send = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(new URL(path, baseUrl), { ...init, headers: { ...init.headers, cookie: jar } });
    // Linking replaces this browser's cookie, as a real browser would take it.
    jar = cookieFrom(res) || jar;
    return res;
  };
  return {
    send,
    async post() {
      const query = new URLSearchParams({ caption: `spec-${Date.now()}`, name: "poster", avatar: "🐧", source: "upload" });
      const res = await send(`/videos?${query}`, {
        method: "POST",
        headers: { "content-type": "video/webm" },
        body: new Blob([new Uint8Array(clip)]),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as Video;
    },
    async comment(videoId: string) {
      const res = await send(`/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "commenter", avatar: "🦊", text: "hello" }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as Comment;
    },
    async code() {
      const res = await send("/link", { method: "POST" });
      expect(res.status).toBe(201);
      return ((await res.json()) as { code: string }).code;
    },
    claim: (code: unknown) =>
      send("/link/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      }),
  };
}

it("a link code makes a second browser the same person, so it can delete what the first posted", async () => {
  const laptop = await person();
  const phone = await person();
  const video = await laptop.post();

  expect((await phone.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(403);

  const code = await laptop.code();
  const res = await phone.claim(code.toLowerCase().replace("-", " "));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { by: string }).by).toBe(video.by);

  expect((await phone.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(204);
});

it("a link code works once, and a made-up one doesn't work at all", async () => {
  const laptop = await person();
  const phone = await person();
  const stranger = await person();

  expect((await stranger.claim("ABCD-2345")).status).toBe(404);
  expect((await stranger.claim(undefined)).status).toBe(404);

  const code = await laptop.code();
  expect((await phone.claim(code)).status).toBe(200);
  expect((await stranger.claim(code)).status).toBe(404);
});

it("asking for a new code retires the old one", async () => {
  const laptop = await person();
  const phone = await person();
  const first = await laptop.code();
  const second = await laptop.code();
  expect((await phone.claim(first)).status).toBe(404);
  expect((await phone.claim(second)).status).toBe(200);
});

it("a code can only be claimed as JSON, so another site's form can't swap your identity", async () => {
  const laptop = await person();
  const phone = await person();
  const code = await laptop.code();
  const res = await phone.send("/link/claim", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code }),
  });
  expect(res.status).toBe(415);
  // Refused without using it up.
  expect((await phone.claim(code)).status).toBe(200);
});

it("the code never comes back in the response that uses it, nor the identity token", async () => {
  const laptop = await person();
  const phone = await person();
  const code = await laptop.code();
  const body = await (await phone.claim(code)).text();
  expect(body).not.toContain(code.replace("-", ""));
  expect(Object.keys(JSON.parse(body))).toEqual(["by"]);
});

// The owner tests need an app started with OWNER_HANDLES set to the handle of
// OWNER_TOKEN, and that token passed to the test run. CI starts the app with
// no owners, so there they're skipped. To run them locally:
//   OWNER_HANDLES=$(node -e 'import("./src/identity.js").then(m => console.log(m.handleOf(process.argv[1])))' $TOKEN) pnpm dev
//   OWNER_TOKEN=$TOKEN pnpm check
const ownerToken = process.env.OWNER_TOKEN;

it("someone who isn't an owner still can't delete a stranger's video or comment", async () => {
  const poster = await person();
  const stranger = await person();
  const video = await poster.post();
  const comment = await poster.comment(video.id);
  expect((await stranger.send(`/videos/${video.id}/comments/${comment.id}`, { method: "DELETE" })).status).toBe(403);
  expect((await stranger.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(403);
});

it("an owner can delete anyone's comment and anyone's video", async (ctx) => {
  if (!ownerToken) return ctx.skip();
  const owner = await person(`who=${ownerToken}`);
  const poster = await person();
  const writer = await person();
  const video = await poster.post();
  const comment = await writer.comment(video.id);

  expect((await owner.send(`/videos/${video.id}/comments/${comment.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await owner.send(`/videos/${video.id}`, { method: "DELETE" })).status).toBe(204);
});
