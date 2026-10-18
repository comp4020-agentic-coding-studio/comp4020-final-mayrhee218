import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// People can upload their own 3D avatar (.vrm, or a plain .glb for preview).
// The server checks the file is a self-contained glTF 2.0 model before it
// keeps it, and each avatar belongs to the browser that uploaded it: nobody
// else can list, fetch or delete it. Built-ins are described in
// src/public/models/manifest.json and must be real files.
const baseUrl = inject("baseUrl");
const clip = readFileSync(new URL("./fixtures/tiny.webm", import.meta.url));

// A minimal binary glTF: a 12-byte header and one JSON chunk, padded to 4.
function glb(json: object): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const body = Buffer.from(text, "utf8");
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + body.length, 8);
  header.writeUInt32LE(body.length, 12);
  header.write("JSON", 16, "latin1");
  return new Uint8Array(Buffer.concat([header, body]));
}

const vrm0 = (extra: object = {}) =>
  glb({
    asset: { version: "2.0" },
    extensionsUsed: ["VRM"],
    extensions: {
      VRM: {
        meta: { title: "Spec Avatar" },
        humanoid: { humanBones: [{ bone: "head", node: 0 }] },
        blendShapeMaster: { blendShapeGroups: [{ presetName: "blink" }, { presetName: "a" }] },
      },
    },
    nodes: [{ name: "head" }],
    ...extra,
  });

type Model = { id: string; name: string; url: string; kind: string; faceTracking: boolean };

async function person() {
  const first = await fetch(new URL("/", baseUrl));
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const send = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseUrl), { ...init, headers: { ...init.headers, cookie } });
  const upload = (bytes: Uint8Array, name = "spec avatar") =>
    send(`/avatars?${new URLSearchParams({ name })}`, {
      method: "POST",
      headers: { "content-type": "model/gltf-binary" },
      body: new Blob([new Uint8Array(bytes)]),
    });
  return { send, upload };
}

it("ships the built-in avatars the manifest names, as real VRM files", async () => {
  const manifest = await (await fetch(new URL("/assets/models/manifest.json", baseUrl))).json();
  expect(manifest.models.length).toBeGreaterThanOrEqual(1);
  expect(manifest.models.map((m: { id: string }) => m.id)).toContain(manifest.default);
  for (const m of manifest.models) {
    const res = await fetch(new URL(`/assets/models/${m.file}`, baseUrl), { headers: { range: "bytes=0-3" } });
    expect(res.status, m.file).toBe(206);
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1"), m.file).toBe("glTF");
  }
});

it("keeps an uploaded VRM for its owner only", async () => {
  const owner = await person();
  const other = await person();
  const res = await owner.upload(vrm0());
  expect(res.status).toBe(201);
  const model = (await res.json()) as Model;
  expect(model).toMatchObject({ name: "spec avatar", kind: "vrm0", faceTracking: true });

  expect((await (await owner.send("/avatars")).json()).map((m: Model) => m.id)).toContain(model.id);
  expect((await (await other.send("/avatars")).json()).map((m: Model) => m.id)).not.toContain(model.id);

  const mine = await owner.send(model.url);
  expect(mine.status).toBe(200);
  expect(Buffer.from(await mine.arrayBuffer()).subarray(0, 4).toString("latin1")).toBe("glTF");
  expect((await other.send(model.url)).status).toBe(404);

  expect((await other.send(`/avatars/${model.id}`, { method: "DELETE" })).status).toBe(403);
  expect((await owner.send(`/avatars/${model.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await owner.send(model.url)).status).toBe(404);
});

it("accepts a plain .glb but doesn't claim it can follow a face", async () => {
  const p = await person();
  const res = await p.upload(glb({ asset: { version: "2.0" }, nodes: [{ name: "cube" }] }));
  expect(res.status).toBe(201);
  const model = (await res.json()) as Model;
  expect(model).toMatchObject({ kind: "glb", faceTracking: false });
  await p.send(`/avatars/${model.id}`, { method: "DELETE" });
});

it("refuses files that aren't safe, self-contained glTF models", async () => {
  const p = await person();
  const refused = async (bytes: Uint8Array) => (await p.upload(bytes)).status;

  // not a model at all, whatever it's called
  expect(await refused(new TextEncoder().encode("<script>alert(1)</script>....."))).toBe(415);
  // a glTF header whose length lies
  const short = vrm0();
  new DataView(short.buffer).setUint32(8, short.length + 100, true);
  expect(await refused(short)).toBe(415);
  // fetches its textures from somewhere else
  expect(await refused(vrm0({ images: [{ uri: "https://tracker.example/pixel.png" }] }))).toBe(415);
  // or its geometry
  expect(await refused(vrm0({ buffers: [{ byteLength: 4, uri: "data:application/octet-stream;base64,AAAAAA==" }] }))).toBe(415);
  // far more nodes than any avatar needs
  expect(await refused(vrm0({ nodes: Array.from({ length: 2001 }, (_, i) => ({ name: `n${i}` })) }))).toBe(415);

  expect(await (await p.send("/avatars")).json()).toEqual([]);
});

it("records which 3D avatar a clip used, apart from the emoji, and only one you may use", async () => {
  const owner = await person();
  const other = await person();
  const model = (await (await owner.upload(vrm0())).json()) as Model;

  const post = (who: typeof owner, avatarModelId: string) =>
    who
      .send(`/videos?${new URLSearchParams({ caption: `spec-${Date.now()}`, avatar: "🐧", source: "avatar", avatarModelId })}`, {
        method: "POST",
        headers: { "content-type": "video/webm" },
        body: new Blob([new Uint8Array(clip)]),
      })
      .then((r) => r.json());

  expect(await post(owner, "builtin:hotdog")).toMatchObject({ avatar: "🐧", avatarModelId: "builtin:hotdog" });
  expect(await post(owner, model.id)).toMatchObject({ avatarModelId: model.id });
  expect((await post(other, model.id)).avatarModelId).toBeUndefined();
  expect((await post(other, "builtin:not-a-model")).avatarModelId).toBeUndefined();

  await owner.send(`/avatars/${model.id}`, { method: "DELETE" });
});

// Worlds are the same kind of owned glTF upload, as scenes rather than
// characters: a plain .glb only, bigger limits, the same ownership.
it("keeps an uploaded 3D world for its owner only, and refuses an avatar as a world", async () => {
  const owner = await person();
  const other = await person();
  const scene = glb({ asset: { version: "2.0" }, nodes: [{ name: "floor" }, { name: "wall" }] });
  const upload = (who: typeof owner, bytes: Uint8Array) =>
    who.send("/worlds?name=spec%20world", {
      method: "POST",
      headers: { "content-type": "model/gltf-binary" },
      body: new Blob([new Uint8Array(bytes)]),
    });

  expect((await upload(owner, vrm0())).status).toBe(415);
  expect((await upload(owner, vrm0({ images: [{ uri: "https://tracker.example/x.png" }] }))).status).toBe(415);

  const res = await upload(owner, scene);
  expect(res.status).toBe(201);
  const world = (await res.json()) as Model;
  expect(world).toMatchObject({ name: "spec world", kind: "glb" });

  expect((await (await other.send("/worlds")).json()).map((w: Model) => w.id)).not.toContain(world.id);
  expect((await owner.send(world.url)).status).toBe(200);
  expect((await other.send(world.url)).status).toBe(404);
  expect((await other.send(`/worlds/${world.id}`, { method: "DELETE" })).status).toBe(403);
  expect((await owner.send(`/worlds/${world.id}`, { method: "DELETE" })).status).toBe(204);
});
