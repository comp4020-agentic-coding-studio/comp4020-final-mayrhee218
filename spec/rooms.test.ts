import { expect, inject, it } from "vitest";

// AI room restyling (src/rooms.js). With no provider configured, which is the
// default and what CI runs, the server must say so and refuse jobs, rather
// than pretend. With ROOM_AI_PROVIDER=fake (a free local stand-in that returns
// the photo unchanged), the job flow runs end to end: consent required, the
// photo checked, the result owned by the browser that asked.
const baseUrl = inject("baseUrl");

// A 1x1 white JPEG: enough for the server's first-bytes check.
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

async function person() {
  const first = await fetch(new URL("/", baseUrl));
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const send = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseUrl), { ...init, headers: { ...init.headers, cookie } });
  const start = (body: Uint8Array, query: Record<string, string>) =>
    send(`/rooms?${new URLSearchParams(query)}`, {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new Blob([new Uint8Array(body)]),
    });
  return { send, start };
}

const provider = async () => (await (await fetch(new URL("/rooms/provider", baseUrl))).json()) as {
  available: boolean;
  name?: string;
  costNote?: string;
};

it("says whether AI restyling exists, and never leaks a key", async () => {
  const info = await provider();
  expect(typeof info.available).toBe("boolean");
  if (info.available) expect(info.costNote).toBeTruthy();
  expect(JSON.stringify(info)).not.toMatch(/sk-|key|token|secret/i);
});

it("refuses a restyle when no provider is set up, instead of faking one", async (ctx) => {
  if ((await provider()).available) return ctx.skip();
  const p = await person();
  const res = await p.start(jpeg, { style: "neon", consent: "yes" });
  expect(res.status).toBe(503);
});

it("restyles only with consent, only real pictures, and keeps the result for its owner", async (ctx) => {
  if (!(await provider()).available) return ctx.skip();
  const owner = await person();
  const other = await person();

  expect((await owner.start(jpeg, { style: "neon" })).status).toBe(400);
  expect((await owner.start(jpeg, { style: "anything", consent: "yes" })).status).toBe(400);
  expect((await owner.start(new TextEncoder().encode("<svg onload=alert(1)>"), { style: "neon", consent: "yes" })).status).toBe(415);

  const res = await owner.start(jpeg, { style: "neon", consent: "yes" });
  expect(res.status).toBe(202);
  let job = await res.json();
  expect(job).toMatchObject({ style: "neon", status: "queued" });
  expect(job.by).toBeUndefined();

  for (let i = 0; i < 40 && (job.status === "queued" || job.status === "working"); i++) {
    await new Promise((r) => setTimeout(r, 100));
    job = await (await owner.send(`/rooms/${job.id}`)).json();
  }
  expect(job.status).toBe("done");

  expect((await owner.send(job.url)).status).toBe(200);
  expect((await other.send(job.url)).status).toBe(404);
  expect((await other.send(`/rooms/${job.id}`)).status).toBe(404);
  expect((await other.send(`/rooms/${job.id}`, { method: "DELETE" })).status).toBe(403);
  expect((await owner.send(`/rooms/${job.id}`, { method: "DELETE" })).status).toBe(204);
});
