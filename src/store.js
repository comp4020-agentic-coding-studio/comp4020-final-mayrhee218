import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "/data";
export const VIDEOS_DIR = path.join(DATA_DIR, "videos");
const VIDEOS_FILE = path.join(DATA_DIR, "videos.json");

// Metadata lives in one JSON file beside the clips. The whole app fits on one
// small machine, so a file read once at boot is all the database it needs.
let videos = [];
let ready = null;
let writeQueue = Promise.resolve();

async function load() {
  await mkdir(VIDEOS_DIR, { recursive: true });
  try {
    videos = JSON.parse(await readFile(VIDEOS_FILE, "utf8"));
  } catch {
    videos = [];
  }
}

export function ensureLoaded() {
  ready ??= load();
  return ready;
}

// Serialized through one promise chain so two near-simultaneous writes
// can't interleave and corrupt the file.
function save() {
  writeQueue = writeQueue.then(() => writeFile(VIDEOS_FILE, JSON.stringify(videos)));
  return writeQueue;
}

// What anyone may see: who liked a video stays private, only the count goes out.
export function toPublic(v) {
  const { likedBy, file, size, ...rest } = v;
  return { ...rest, src: `/media/${file}`, likes: likedBy.length };
}

export async function listVideos() {
  await ensureLoaded();
  return [...videos].reverse().map(toPublic);
}

export async function storedBytes() {
  await ensureLoaded();
  return videos.reduce((sum, v) => sum + v.size, 0);
}

export async function addVideo(video) {
  await ensureLoaded();
  const stored = { id: randomUUID(), createdAt: new Date().toISOString(), likedBy: [], comments: [], ...video };
  videos.push(stored);
  await save();
  return toPublic(stored);
}

export async function setLike(id, clientId, liked) {
  await ensureLoaded();
  const video = videos.find((v) => v.id === id);
  if (!video) return null;
  const has = video.likedBy.includes(clientId);
  if (liked && !has) video.likedBy.push(clientId);
  if (!liked && has) video.likedBy.splice(video.likedBy.indexOf(clientId), 1);
  if (liked !== has) await save();
  return video.likedBy.length;
}

export async function addComment(id, comment) {
  await ensureLoaded();
  const video = videos.find((v) => v.id === id);
  if (!video) return null;
  const stored = { id: randomUUID(), createdAt: new Date().toISOString(), ...comment };
  video.comments.push(stored);
  await save();
  return stored;
}
