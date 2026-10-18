import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { DATA_DIR } from "./store.js";
import { UploadError } from "./upload.js";

// People's own 3D files: avatars (.vrm, or .glb for preview) and worlds
// (.glb scenes). Both are binary glTF, checked the same way, stored on the
// volume beside the clips, owned by the handle that uploaded them, and only
// ever served back to their owner. Each kind is one `ownedModels` collection.

// Reads a binary glTF's header and JSON chunk and decides whether it's safe to
// hand to a browser. Returns what the studio needs to know about it, or throws
// an UploadError saying what's wrong. https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
export function inspectGlb(buf, limits) {
  const bad = (msg) => new UploadError(415, msg);
  if (buf.length < 20 || buf.toString("latin1", 0, 4) !== "glTF") throw bad("that isn't a .vrm or .glb file");
  if (buf.readUInt32LE(4) !== 2) throw bad("only glTF 2.0 models are supported");
  if (buf.readUInt32LE(8) !== buf.length) throw bad("that model file is cut short or padded");
  const jsonLength = buf.readUInt32LE(12);
  if (buf.toString("latin1", 16, 20) !== "JSON" || 20 + jsonLength > buf.length) throw bad("that model is malformed");
  let gltf;
  try {
    gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLength));
  } catch {
    throw bad("that model is malformed");
  }
  if (typeof gltf !== "object" || gltf === null || gltf.asset?.version !== "2.0") throw bad("only glTF 2.0 models are supported");

  // Everything has to be inside the file: a model that fetches from elsewhere
  // could track who opens it, or break when that place goes away.
  for (const kind of ["buffers", "images"]) {
    for (const item of gltf[kind] ?? []) {
      if (item?.uri !== undefined) throw bad("that model points to files outside itself; export it as a single .vrm or .glb");
    }
  }
  if (gltf.extensionsRequired?.length) {
    const known = new Set(["KHR_texture_transform", "KHR_materials_unlit", "KHR_mesh_quantization"]);
    const unknown = gltf.extensionsRequired.filter((e) => !known.has(e));
    if (unknown.length) throw bad(`that model needs ${unknown.join(", ")}, which isn't supported`);
  }
  for (const [key, max] of Object.entries(limits)) {
    if ((gltf[key]?.length ?? 0) > max) throw bad(`that model is too complex: more than ${max} ${key}`);
  }

  const vrm1 = gltf.extensions?.VRMC_vrm;
  const vrm0 = gltf.extensions?.VRM;
  const kind = vrm1 ? "vrm1" : vrm0 ? "vrm0" : "glb";
  const head = vrm1
    ? Boolean(vrm1.humanoid?.humanBones?.head)
    : Boolean(vrm0?.humanoid?.humanBones?.some?.((b) => b?.bone === "head"));
  const expressions = vrm1
    ? Object.keys({ ...vrm1.expressions?.preset, ...vrm1.expressions?.custom })
    : (vrm0?.blendShapeMaster?.blendShapeGroups ?? []).map((g) => g?.presetName || g?.name).filter(Boolean);
  const title = String((vrm1 ? vrm1.meta?.name : vrm0?.meta?.title) ?? "").trim();
  return {
    kind,
    title,
    // Full face tracking needs a humanoid head; a plain .glb is preview only.
    faceTracking: kind !== "glb" && head,
    expressions: expressions.slice(0, 64).map(String),
  };
}

// One kind of owned 3D file. `route` is where its files are served
// (`/${route}/:id`), `noun` names it in messages, and `accept(info)` may
// refuse a file that's valid glTF but the wrong kind of thing.
export function ownedModels({ name, route, noun, maxBytes, perPerson, limits, accept = () => null }) {
  const dir = path.join(DATA_DIR, name);
  const indexFile = path.join(DATA_DIR, `${name}.json`);
  const nameMax = 40;
  let items = [];
  let ready = null;
  let writeQueue = Promise.resolve();

  async function load() {
    await mkdir(dir, { recursive: true });
    try {
      items = JSON.parse(await readFile(indexFile, "utf8"));
    } catch {
      items = [];
    }
  }
  const ensureLoaded = () => (ready ??= load());
  const save = () => (writeQueue = writeQueue.then(() => writeFile(indexFile, JSON.stringify(items))));

  // What its owner sees: never the file on disk, only where to fetch it.
  const toPublic = ({ file, by, ...rest }) => ({ ...rest, url: `/${route}/${rest.id}` });

  return {
    maxBytes,
    async list(by) {
      await ensureLoaded();
      return items.filter((m) => m.by === by).map(toPublic);
    },

    // The file for /${route}/:id, only for its owner. Null otherwise, and the
    // route answers 404 either way, so ids can't be probed for.
    async file(id, by) {
      await ensureLoaded();
      const item = items.find((m) => m.id === id);
      return item && item.by === by ? path.join(dir, item.file) : null;
    },

    async owns(id, by) {
      await ensureLoaded();
      return items.some((m) => m.id === id && m.by === by);
    },

    async totalBytes() {
      await ensureLoaded();
      return items.reduce((sum, m) => sum + (m.size ?? 0), 0);
    },

    async receive(req, by, requestedName) {
      await ensureLoaded();
      if (items.filter((m) => m.by === by).length >= perPerson) {
        throw new UploadError(409, `you can keep ${perPerson} ${noun}s; delete one first`);
      }
      const tmp = path.join(dir, `.${randomUUID()}.part`);
      const out = createWriteStream(tmp);
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBytes) throw new UploadError(413, `that ${noun} is too big — keep it under ${maxBytes / 1024 / 1024} MB`);
          if (size === chunk.length && chunk.length >= 4 && chunk.toString("latin1", 0, 4) !== "glTF") {
            throw new UploadError(415, "that isn't a .vrm or .glb file");
          }
          if (!out.write(chunk)) await once(out, "drain");
        }
        out.end();
        await once(out, "finish");
        // Under the size cap, so reading it back whole to inspect is affordable.
        const info = inspectGlb(await readFile(tmp), limits);
        const refusal = accept(info);
        if (refusal) throw new UploadError(415, refusal);
        const id = randomUUID();
        const file = `${id}.${info.kind === "glb" ? "glb" : "vrm"}`;
        await rename(tmp, path.join(dir, file));
        const item = {
          id,
          by,
          file,
          name: String(requestedName || info.title || `My ${noun}`).trim().slice(0, nameMax),
          kind: info.kind,
          faceTracking: info.faceTracking,
          expressions: info.expressions,
          size: (await stat(path.join(dir, file))).size,
          createdAt: new Date().toISOString(),
        };
        items.push(item);
        await save();
        return toPublic(item);
      } catch (err) {
        out.destroy();
        await rm(tmp, { force: true });
        throw err;
      }
    },

    async remove(id, by) {
      await ensureLoaded();
      const index = items.findIndex((m) => m.id === id);
      if (index === -1) return "missing";
      const item = items[index];
      if (item.by !== by) return "forbidden";
      items.splice(index, 1);
      await save();
      await rm(path.join(dir, item.file), { force: true });
      return toPublic(item);
    },
  };
}

// Avatars: past these limits a model would stall a phone; real VRM avatars
// sit well under.
export const avatars = ownedModels({
  name: "models",
  route: "avatar-files",
  noun: "avatar",
  maxBytes: 15 * 1024 * 1024,
  perPerson: 5,
  limits: { nodes: 2000, meshes: 300, materials: 200, textures: 64, images: 64, accessors: 5000, animations: 64 },
});

// Worlds: a scene the avatar stands in. Bigger than an avatar, but still
// drawn every frame on a phone while it records. A world that is itself an
// avatar (VRM) is refused: it would be the wrong thing in the wrong place.
export const worlds = ownedModels({
  name: "worlds",
  route: "world-files",
  noun: "world",
  maxBytes: 20 * 1024 * 1024,
  perPerson: 3,
  limits: { nodes: 5000, meshes: 1000, materials: 300, textures: 64, images: 64, accessors: 12000, animations: 16 },
  accept: (info) => (info.kind === "glb" ? null : "that's an avatar; upload a world as a plain .glb"),
});
