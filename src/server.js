import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { identify } from "./identity.js";
import { attachLive, broadcast } from "./live.js";
import { act, quote, remember, shortId, who } from "./log.js";
import { renderReadme } from "./readme.js";
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
  storedBytes,
} from "./store.js";
import { MAX_MODEL_BYTES, listModels, modelFile, ownsModel, receiveModel, removeModel } from "./models.js";
import { MAX_BYTES, UploadError, receiveVideo } from "./upload.js";
import { AVATARS, renderCreate, renderFeed, renderReadmePage } from "./views.js";

// The volume is 1 GB; leave headroom for metadata and a clip mid-upload.
const STORAGE_BUDGET = 850 * 1024 * 1024;
const SOURCES = ["avatar", "camera", "upload"];
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
      BUILTIN_MODELS.includes(modelId) || (modelId && (await ownsModel(modelId, req.by))) ? modelId : undefined;
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

// Your own 3D avatars. Every route answers only for the browser that uploaded
// them: there is no way to list, fetch or delete someone else's.
app.get("/avatars", async (req, res) => {
  res.json(await listModels(req.by));
});

app.post("/avatars", async (req, res) => {
  if (Number(req.get("content-length") ?? 0) > MAX_MODEL_BYTES) {
    return res.status(413).json({ error: "that model is too big — keep it under 15 MB" });
  }
  if ((await storedBytes()) > STORAGE_BUDGET) {
    return res.status(507).json({ error: "the space is full for now" });
  }
  try {
    const model = await receiveModel(req, req.by, req.query.name);
    act(req.by, `uploaded avatar ${shortId(model.id)} ${quote(model.name)} [${model.kind}, ${Math.round(model.size / 1024)} KB, face tracking ${model.faceTracking ? "yes" : "no"}]`);
    res.status(201).json(model);
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    act(req.by, `FAILED avatar upload: ${err.message}`);
    res.status(err.status).json({ error: err.message });
  }
});

app.get("/avatar-files/:id", async (req, res) => {
  const file = await modelFile(req.params.id, req.by);
  if (!file) return res.status(404).json({ error: "no such avatar" });
  res.set("cache-control", "private, max-age=86400");
  // The path is built from the stored record, never the request, so the dev
  // data dir (./.data) being a dot-directory is no reason to refuse it.
  res.type("model/gltf-binary").sendFile(file, { dotfiles: "allow" });
});

app.delete("/avatars/:id", async (req, res) => {
  const result = await removeModel(req.params.id, req.by);
  if (result === "forbidden") act(req.by, `REFUSED delete avatar ${shortId(req.params.id)}`);
  if (typeof result === "string") return refuse(res, result, "avatar");
  act(req.by, `deleted avatar ${shortId(req.params.id)} ${quote(result.name)}`);
  res.status(204).end();
});

app.get("/readme/", async (_req, res) => {
  res.type("html").send(renderReadmePage(await renderReadme()));
});

await ensureLoaded();
for (const p of await knownPeople()) remember(p.by, p);
const port = process.env.PORT ?? 8080;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
attachLive(server);
