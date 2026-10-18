import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { DATA_DIR } from "./store.js";
import { UploadError } from "./upload.js";

// People's own 3D avatars: binary glTF (.glb), and VRM, which is a .glb with
// avatar extensions. They live on the volume beside the clips, owned by the
// handle that uploaded them, and are only ever served back to their owner.
export const MODELS_DIR = path.join(DATA_DIR, "models");
const MODELS_FILE = path.join(DATA_DIR, "models.json");
export const MAX_MODEL_BYTES = 15 * 1024 * 1024;
const PER_PERSON = 5;
const NAME_MAX = 40;

// Past these a model would stall a phone; real VRM avatars sit well under.
const LIMITS = { nodes: 2000, meshes: 300, materials: 200, textures: 64, images: 64, accessors: 5000, animations: 64 };

let models = [];
let ready = null;
let writeQueue = Promise.resolve();

async function load() {
  await mkdir(MODELS_DIR, { recursive: true });
  try {
    models = JSON.parse(await readFile(MODELS_FILE, "utf8"));
  } catch {
    models = [];
  }
}
const ensureLoaded = () => (ready ??= load());
function save() {
  writeQueue = writeQueue.then(() => writeFile(MODELS_FILE, JSON.stringify(models)));
  return writeQueue;
}

// What its owner sees: never the file on disk, only where to fetch it.
const toPublic = ({ file, by, ...rest }) => ({ ...rest, url: `/avatar-files/${rest.id}` });

// Reads a binary glTF's header and JSON chunk and decides whether it's safe to
// hand to a browser. Returns what the studio needs to know about it, or throws
// an UploadError saying what's wrong. https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
export function inspectGlb(buf) {
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
  for (const [key, max] of Object.entries(LIMITS)) {
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

export async function listModels(by) {
  await ensureLoaded();
  return models.filter((m) => m.by === by).map(toPublic);
}

// The file for /avatar-files/:id, only for its owner. Null otherwise, and the
// route answers 404 either way, so ids can't be probed for.
export async function modelFile(id, by) {
  await ensureLoaded();
  const model = models.find((m) => m.id === id);
  return model && model.by === by ? path.join(MODELS_DIR, model.file) : null;
}

export async function ownsModel(id, by) {
  await ensureLoaded();
  return models.some((m) => m.id === id && m.by === by);
}

export async function receiveModel(req, by, name) {
  await ensureLoaded();
  if (models.filter((m) => m.by === by).length >= PER_PERSON) {
    throw new UploadError(409, `you can keep ${PER_PERSON} avatars; delete one first`);
  }
  const tmp = path.join(MODELS_DIR, `.${randomUUID()}.part`);
  const out = createWriteStream(tmp);
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_MODEL_BYTES) throw new UploadError(413, "that model is too big — keep it under 15 MB");
      if (size === chunk.length && chunk.length >= 4 && chunk.toString("latin1", 0, 4) !== "glTF") {
        throw new UploadError(415, "that isn't a .vrm or .glb file");
      }
      if (!out.write(chunk)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
    // Under 15 MB, so reading it back whole to inspect is affordable.
    const info = inspectGlb(await readFile(tmp));
    const id = randomUUID();
    const file = `${id}.${info.kind === "glb" ? "glb" : "vrm"}`;
    await rename(tmp, path.join(MODELS_DIR, file));
    const model = {
      id,
      by,
      file,
      name: String(name || info.title || "My avatar").trim().slice(0, NAME_MAX),
      kind: info.kind,
      faceTracking: info.faceTracking,
      expressions: info.expressions,
      size: (await stat(path.join(MODELS_DIR, file))).size,
      createdAt: new Date().toISOString(),
    };
    models.push(model);
    await save();
    return toPublic(model);
  } catch (err) {
    out.destroy();
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function removeModel(id, by) {
  await ensureLoaded();
  const index = models.findIndex((m) => m.id === id);
  if (index === -1) return "missing";
  const model = models[index];
  if (model.by !== by) return "forbidden";
  models.splice(index, 1);
  await save();
  await rm(path.join(MODELS_DIR, model.file), { force: true });
  return toPublic(model);
}
