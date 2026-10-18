import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { identify } from "./identity.js";
import { attachLive, broadcast } from "./live.js";
import { act, quote, remember, shortId, who } from "./log.js";
import { renderReadme } from "./readme.js";
import { MAX_ROOM_BYTES, RoomError, getRoom, listRooms, providerInfo, removeRoom, roomFile, startRoom } from "./rooms.js";
import {
  VIDEOS_DIR,
  addComment,
  addVideo,
  ensureLoaded,
  knownPeople,
  listVideos,
  ownerOf,
  removeComment,
  removeVideo,
  setLike,
  storedBytes as storedVideoBytes,
} from "./store.js";
import { avatars, worlds } from "./models.js";
import { MAX_BYTES, UploadError, receiveVideo } from "./upload.js";
import { AVATARS, renderCreate, renderFeed, renderReadmePage } from "./views.js";

// The volume is 1 GB; leave headroom for metadata and a clip mid-upload.
const STORAGE_BUDGET = 850 * 1024 * 1024;
const SOURCES = ["avatar", "camera", "upload"];
// Everything on the volume people put there: clips, avatars and worlds. AI
// room backgrounds are capped per person and small; they aren't counted.
const storedBytes = async () =>
  (await storedVideoBytes()) + (await avatars.totalBytes()) + (await worlds.totalBytes());
const BUILTIN_MODELS = JSON.parse(
  readFileSync(fileURLToPath(new URL("./public/models/manifest.json", import.meta.url)), "utf8"),
).models.map((m) => m.id);

const app = express();
app.set("trust proxy", true);
app.use("/assets", express.static(fileURLToPath(new URL("./public/", import.meta.url))));
// Clip names are random and never reused, so browsers can keep them forever.
app.use("/media", express.static(VIDEOS_DIR, { immutable: true, maxAge: "30d" }));

// Everything below here knows who is asking: req.by is the handle of this
// browser, set from its cookie (src/identity.js), never from the request body.
app.use(identify);

// The name and avatar a request offers. Labels only: who you are is req.by.
// Remembered against your handle so later log lines can name you.
const person = (req, body) => {
  const p = {
    avatar: AVATARS.includes(body?.avatar) ? body.avatar : AVATARS[0],
    name: String(body?.name ?? "").trim().slice(0, 40),
  };
  remember(req.by, p);
  return p;
};
const whose = (videoId) => `(${who(ownerOf(videoId))}'s)`;

app.get("/", async (_req, res) => {
  res.type("html").send(renderFeed(await listVideos()));
});

app.get("/create", (_req, res) => {
  res.type("html").send(renderCreate());
});

app.post("/videos", async (req, res) => {
  if (Number(req.get("content-length") ?? 0) > MAX_BYTES) {
    return res.status(413).json({ error: "that clip is too big — keep it under 25 MB" });
  }
  if ((await storedBytes()) > STORAGE_BUDGET) {
    return res.status(507).json({ error: "the space is full for now" });
  }
  try {
    const stored = await receiveVideo(req, VIDEOS_DIR);
    // Which 3D avatar was in the clip: kept apart from the emoji `avatar`, and
    // only if it's a built-in or one of the poster's own uploads.
    const modelId = String(req.query.avatarModelId ?? "");
    const avatarModelId =
      BUILTIN_MODELS.includes(modelId) || (modelId && (await avatars.owns(modelId, req.by))) ? modelId : undefined;
    const video = await addVideo({
      ...(avatarModelId && { avatarModelId }),
      ...stored,
      ...person(req, req.query),
      by: req.by,
      caption: String(req.query.caption ?? "").trim().slice(0, 150),
      source: SOURCES.includes(req.query.source) ? req.query.source : "upload",
    });
    act(req.by, `posted video ${shortId(video.id)} ${quote(video.caption)} [${video.source}, ${Math.round(stored.size / 1024)} KB]`);
    broadcast({ type: "video", video });
    res.status(201).json(video);
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    act(req.by, `FAILED upload: ${err.message}`);
    res.status(err.status).json({ error: err.message });
  }
});

app.post("/videos/:id/like", express.json(), async (req, res) => {
  const liked = Boolean(req.body?.liked);
  const likes = await setLike(req.params.id, req.by, liked);
  if (likes === null) return res.status(404).json({ error: "no such video" });
  act(req.by, `${liked ? "liked" : "unliked"} video ${shortId(req.params.id)} ${whose(req.params.id)} → ${likes} like${likes === 1 ? "" : "s"}`);
  broadcast({ type: "likes", id: req.params.id, likes });
  res.json({ likes });
});

app.post("/videos/:id/comments", express.json(), async (req, res) => {
  const text = String(req.body?.text ?? "").trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: "a comment needs some text" });
  const comment = await addComment(req.params.id, { ...person(req, req.body), by: req.by, text });
  if (!comment) return res.status(404).json({ error: "no such video" });
  act(req.by, `commented on video ${shortId(req.params.id)} ${whose(req.params.id)}: ${quote(text)}`);
  broadcast({ type: "comment", id: req.params.id, comment });
  res.status(201).json(comment);
});

// AI room restyling (src/rooms.js). Like avatars, everything here answers only
// for the browser that made it.
app.get("/rooms/provider", (_req, res) => {
  res.json(providerInfo());
});

app.get("/rooms", async (req, res) => {
  res.json(await listRooms(req.by));
});

app.post("/rooms", express.raw({ type: () => true, limit: MAX_ROOM_BYTES }), async (req, res) => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const job = await startRoom(req.by, body, req.query, (j) => {
      const what = { queued: "asked for", working: "is waiting on", done: "got", failed: "FAILED" }[j.status];
      act(req.by, `${what} an AI room restyle ${shortId(j.id)} [${j.style}${j.error ? `: ${j.error}` : ""}]`);
    });
    res.status(202).json(job);
  } catch (err) {
    if (!(err instanceof RoomError)) throw err;
    act(req.by, `REFUSED AI room restyle: ${err.message}`);
    res.status(err.status).json({ error: err.message });
  }
});

app.get("/rooms/:id", async (req, res) => {
  const job = await getRoom(req.params.id, req.by);
  if (!job) return res.status(404).json({ error: "no such room" });
  res.json(job);
});

app.get("/room-files/:id", async (req, res) => {
  const found = await roomFile(req.params.id, req.by);
  if (!found) return res.status(404).json({ error: "no such room" });
  res.set("cache-control", "private, max-age=86400");
  res.type(found.type).sendFile(found.file, { dotfiles: "allow" });
});

app.delete("/rooms/:id", async (req, res) => {
  const result = await removeRoom(req.params.id, req.by);
  if (result === "busy") return res.status(409).json({ error: "that restyle is still running" });
  if (typeof result === "string") return refuse(res, result, "room");
  act(req.by, `deleted AI room ${shortId(req.params.id)}`);
  res.status(204).end();
});

const refuse = (res, result, what) =>
  result === "missing"
    ? res.status(404).json({ error: `no such ${what}` })
    : res.status(403).json({ error: `that ${what} isn't yours to delete` });

app.delete("/videos/:id", async (req, res) => {
  const owner = whose(req.params.id);
  const result = await removeVideo(req.params.id, req.by);
  if (result === "forbidden") act(req.by, `REFUSED delete video ${shortId(req.params.id)} ${owner}`);
  if (typeof result === "string") return refuse(res, result, "video");
  act(req.by, `deleted video ${shortId(req.params.id)} ${quote(result.caption)}`);
  broadcast({ type: "video-removed", id: req.params.id, by: req.by });
  res.status(204).end();
});

app.delete("/videos/:id/comments/:commentId", async (req, res) => {
  const result = await removeComment(req.params.id, req.params.commentId, req.by);
  if (result === "forbidden") {
    act(req.by, `REFUSED delete comment ${shortId(req.params.commentId)} on video ${shortId(req.params.id)} ${whose(req.params.id)}`);
  }
  if (typeof result === "string") return refuse(res, result, "comment");
  const theirs = result.by === req.by ? "their own" : `${who(result.by)}'s`;
  act(req.by, `deleted ${theirs} comment on video ${shortId(req.params.id)}: ${quote(result.text)}`);
  broadcast({ type: "comment-removed", id: req.params.id, commentId: req.params.commentId });
  res.status(204).end();
});

// Your own 3D avatars and worlds. Every route answers only for the browser
// that uploaded them: there is no way to list, fetch or delete someone else's.
function ownedRoutes(collection, { list, files, noun, describe }) {
  app.get(list, async (req, res) => {
    res.json(await collection.list(req.by));
  });

  app.post(list, async (req, res) => {
    if (Number(req.get("content-length") ?? 0) > collection.maxBytes) {
      return res.status(413).json({ error: `that ${noun} is too big — keep it under ${collection.maxBytes / 1024 / 1024} MB` });
    }
    if ((await storedBytes()) > STORAGE_BUDGET) {
      return res.status(507).json({ error: "the space is full for now" });
    }
    try {
      const item = await collection.receive(req, req.by, req.query.name);
      act(req.by, `uploaded ${noun} ${shortId(item.id)} ${quote(item.name)} [${describe(item)}]`);
      res.status(201).json(item);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      act(req.by, `FAILED ${noun} upload: ${err.message}`);
      res.status(err.status).json({ error: err.message });
    }
  });

  app.get(`${files}/:id`, async (req, res) => {
    const file = await collection.file(req.params.id, req.by);
    if (!file) return res.status(404).json({ error: `no such ${noun}` });
    res.set("cache-control", "private, max-age=86400");
    // The path is built from the stored record, never the request, so the dev
    // data dir (./.data) being a dot-directory is no reason to refuse it.
    res.type("model/gltf-binary").sendFile(file, { dotfiles: "allow" });
  });

  app.delete(`${list}/:id`, async (req, res) => {
    const result = await collection.remove(req.params.id, req.by);
    if (result === "forbidden") act(req.by, `REFUSED delete ${noun} ${shortId(req.params.id)}`);
    if (typeof result === "string") return refuse(res, result, noun);
    act(req.by, `deleted ${noun} ${shortId(req.params.id)} ${quote(result.name)}`);
    res.status(204).end();
  });
}

const kb = (item) => `${Math.round(item.size / 1024)} KB`;
ownedRoutes(avatars, {
  list: "/avatars",
  files: "/avatar-files",
  noun: "avatar",
  describe: (m) => `${m.kind}, ${kb(m)}, face tracking ${m.faceTracking ? "yes" : "no"}`,
});
ownedRoutes(worlds, { list: "/worlds", files: "/world-files", noun: "world", describe: kb });

app.get("/readme/", async (_req, res) => {
  res.type("html").send(renderReadmePage(await renderReadme()));
});

// A body over a route's limit (express.raw) answers as JSON, like the rest.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "that picture is too big" });
  next(err);
});

await ensureLoaded();
for (const p of await knownPeople()) remember(p.by, p);
const port = process.env.PORT ?? 8080;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
attachLive(server);
