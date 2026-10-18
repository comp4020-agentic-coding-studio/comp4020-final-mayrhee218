import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

// Who posted a video, for log lines; null if it's gone or predates owners.
export function ownerOf(id) {
  return videos.find((v) => v.id === id)?.by ?? null;
}

// Everyone who has posted or commented, with the name they last used.
export async function knownPeople() {
  await ensureLoaded();
  return videos.flatMap((v) => [v, ...v.comments]).filter((x) => x.by);
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

export async function setLike(id, by, liked) {
  await ensureLoaded();
  const video = videos.find((v) => v.id === id);
  if (!video) return null;
  const has = video.likedBy.includes(by);
  if (liked && !has) video.likedBy.push(by);
  if (!liked && has) video.likedBy.splice(video.likedBy.indexOf(by), 1);
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

// The rules for who may remove what live here, beside the data, so every
// route goes through the same check. See docs/decisions/0002-who-may-change-what.md.
// Each returns "missing", "forbidden" or the removed record.
export async function removeVideo(id, by) {
  await ensureLoaded();
  const index = videos.findIndex((v) => v.id === id);
  if (index === -1) return "missing";
  const video = videos[index];
  if (!video.by || video.by !== by) return "forbidden";
  videos.splice(index, 1);
  await save();
  await rm(path.join(VIDEOS_DIR, video.file), { force: true });
  return video;
}

export async function removeComment(videoId, commentId, by) {
  await ensureLoaded();
  const video = videos.find((v) => v.id === videoId);
  const index = video?.comments.findIndex((c) => c.id === commentId) ?? -1;
  if (index === -1) return "missing";
  const comment = video.comments[index];
  const wroteIt = comment.by && comment.by === by;
  const ownsVideo = video.by && video.by === by;
  if (!wroteIt && !ownsVideo) return "forbidden";
  video.comments.splice(index, 1);
  await save();
  return comment;
}
