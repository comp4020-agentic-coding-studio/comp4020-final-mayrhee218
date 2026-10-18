import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store.js";

// AI room restyling: a room photo in, the same room as a stylised game/anime
// background out. It's a 2D picture, not a 3D world. Nothing here runs a model
// on this server: the machine has 256 MB and no GPU. A provider adapter sends
// the photo to an external image-to-image service, as a background job the
// studio polls.
//
// No provider is configured by default (ROOM_AI_PROVIDER unset), and then the
// studio offers only its on-device filter and the standard worlds. API keys
// live in server env vars and never reach the browser.

export const ROOMS_DIR = path.join(DATA_DIR, "rooms");
const JOBS_FILE = path.join(DATA_DIR, "rooms.json");
export const MAX_ROOM_BYTES = 4 * 1024 * 1024;
const PER_PERSON = 6; // finished backgrounds kept per person
const PER_DAY = 10; // jobs per person per day: each one may cost money

// What each built-in style asks for. Kept here, not taken from the browser,
// so a request can't turn the provider into a general image generator.
const STYLE_PROMPTS = {
  mochi: "the same room as a soft pastel anime background, gentle pink and lavender light, clean cel shading, cosy",
  neon: "the same room as a neon cyberpunk game background at night, magenta and cyan glow, bold cel shading",
  sunny: "the same room as a bright sunny cartoon game background, warm daylight, flat colours, cheerful",
};
const NEGATIVE = "people, person, face, text, watermark, blurry";

// --- providers ---------------------------------------------------------------
// Each has: name, costNote (shown to the user before they consent), and
// transform({ image: Buffer, type, prompt }) -> { image: Buffer, type }.

// Stability AI "Control: Structure": keeps the layout of the input image and
// redraws it to the prompt. Written from the published API contract; it has
// not been called from this project, because each call is paid.
// https://platform.stability.ai/docs/api-reference
const stability = (key) => ({
  name: "Stability AI (Control: Structure)",
  costNote: "Uses Stability AI credits on the server's account for each restyle.",
  async transform({ image, type, prompt }) {
    const form = new FormData();
    form.append("image", new Blob([image], { type }), "room.jpg");
    form.append("prompt", prompt);
    form.append("negative_prompt", NEGATIVE);
    form.append("control_strength", "0.75"); // high keeps the room's layout
    form.append("output_format", "jpeg");
    const res = await fetch("https://api.stability.ai/v2beta/stable-image/control/structure", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, accept: "image/*" },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`the provider refused it (${res.status}) ${detail.slice(0, 200)}`);
    }
    return { image: Buffer.from(await res.arrayBuffer()), type: "image/jpeg" };
  },
});

// For tests and local development only: hands the photo straight back after a
// short wait, so the job flow can be exercised without a paid call. The studio
// labels its output as unchanged.
const fake = () => ({
  name: "test provider (returns your photo unchanged)",
  costNote: "Free: this is a local test provider and changes nothing.",
  async transform({ image, type }) {
    await new Promise((r) => setTimeout(r, 300));
    return { image, type };
  },
});

function configured() {
  const which = process.env.ROOM_AI_PROVIDER;
  if (which === "stability" && process.env.STABILITY_API_KEY) return stability(process.env.STABILITY_API_KEY);
  if (which === "fake") return fake();
  return null;
}
const provider = configured();

// What the studio may know: whether AI restyling exists, who does it, and what
// it costs. Never the key.
export const providerInfo = () =>
  provider ? { available: true, name: provider.name, costNote: provider.costNote } : { available: false };

// --- jobs --------------------------------------------------------------------

let jobs = [];
let ready = null;
let writeQueue = Promise.resolve();
async function load() {
  await mkdir(ROOMS_DIR, { recursive: true });
  try {
    jobs = JSON.parse(await readFile(JOBS_FILE, "utf8"));
  } catch {
    jobs = [];
  }
  // A restart loses jobs that were mid-flight; say so rather than hang.
  for (const j of jobs) {
    if (j.status === "queued" || j.status === "working") Object.assign(j, { status: "failed", error: "the server restarted; try again" });
  }
}
const ensureLoaded = () => (ready ??= load());
const save = () => (writeQueue = writeQueue.then(() => writeFile(JOBS_FILE, JSON.stringify(jobs))));

const toPublic = ({ by, input, output, ...rest }) => ({
  ...rest,
  ...(rest.status === "done" && { url: `/room-files/${rest.id}` }),
});

export class RoomError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// JPEG, PNG or WebP by their first bytes, whatever the request claims.
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function listRooms(by) {
  await ensureLoaded();
  return jobs.filter((j) => j.by === by).map(toPublic);
}

export async function getRoom(id, by) {
  await ensureLoaded();
  const job = jobs.find((j) => j.id === id);
  return job && job.by === by ? toPublic(job) : null;
}

export async function roomFile(id, by) {
  await ensureLoaded();
  const job = jobs.find((j) => j.id === id);
  return job && job.by === by && job.status === "done" ? { file: path.join(ROOMS_DIR, job.output), type: job.type } : null;
}

// Takes the photo, answers at once with a queued job, and does the provider
// call in the background. `onChange` hears each status change, for logging.
export async function startRoom(by, body, { style, consent }, onChange = () => {}) {
  await ensureLoaded();
  if (!provider) throw new RoomError(503, "AI restyling isn't set up on this server");
  if (consent !== "yes") throw new RoomError(400, "sending your photo needs your explicit consent");
  const prompt = STYLE_PROMPTS[style];
  if (!prompt) throw new RoomError(400, "unknown style");
  const type = sniffImage(body);
  if (!type) throw new RoomError(415, "that isn't a JPEG, PNG or WebP picture");
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (jobs.filter((j) => j.by === by && Date.parse(j.createdAt) > since).length >= PER_DAY) {
    throw new RoomError(429, `that's ${PER_DAY} restyles today; try again tomorrow`);
  }
  if (jobs.some((j) => j.by === by && (j.status === "queued" || j.status === "working"))) {
    throw new RoomError(409, "one restyle at a time");
  }

  const id = randomUUID();
  const input = `${id}.in`;
  await writeFile(path.join(ROOMS_DIR, input), body);
  const job = { id, by, style, status: "queued", provider: provider.name, input, createdAt: new Date().toISOString() };
  jobs.push(job);
  await save();
  onChange(job);
  const accepted = toPublic(job); // as it stood when accepted, before work starts

  (async () => {
    job.status = "working";
    onChange(job);
    try {
      const result = await provider.transform({ image: body, type, prompt });
      if (!sniffImage(result.image)) throw new Error("the provider sent back something that isn't a picture");
      job.output = `${id}.out`;
      job.type = sniffImage(result.image);
      await writeFile(path.join(ROOMS_DIR, job.output), result.image);
      job.status = "done";
    } catch (err) {
      Object.assign(job, { status: "failed", error: String(err?.message ?? err).slice(0, 300) });
    }
    // The original photo is only needed for the call: don't keep it.
    await rm(path.join(ROOMS_DIR, input), { force: true });
    delete job.input;
    // Keep the newest few finished backgrounds per person.
    const mine = jobs.filter((j) => j.by === by && j.status === "done");
    for (const old of mine.slice(0, Math.max(0, mine.length - PER_PERSON))) {
      await rm(path.join(ROOMS_DIR, old.output), { force: true });
      jobs.splice(jobs.indexOf(old), 1);
    }
    await save();
    onChange(job);
  })();

  return accepted;
}

export async function removeRoom(id, by) {
  await ensureLoaded();
  const index = jobs.findIndex((j) => j.id === id);
  if (index === -1) return "missing";
  const job = jobs[index];
  if (job.by !== by) return "forbidden";
  if (job.status === "queued" || job.status === "working") return "busy";
  jobs.splice(index, 1);
  await save();
  if (job.output) await rm(path.join(ROOMS_DIR, job.output), { force: true });
  return toPublic(job);
}
