import express from "express";
import { fileURLToPath } from "node:url";
import { attachLive, broadcast } from "./live.js";
import { renderReadme } from "./readme.js";
import { VIDEOS_DIR, addComment, addVideo, ensureLoaded, listVideos, setLike, storedBytes } from "./store.js";
import { MAX_BYTES, UploadError, receiveVideo } from "./upload.js";
import { AVATARS, renderCreate, renderFeed, renderReadmePage } from "./views.js";

// The volume is 1 GB; leave headroom for metadata and a clip mid-upload.
const STORAGE_BUDGET = 850 * 1024 * 1024;
const SOURCES = ["avatar", "camera", "upload"];

const app = express();
app.use("/assets", express.static(fileURLToPath(new URL("./public/", import.meta.url))));
// Clip names are random and never reused, so browsers can keep them forever.
app.use("/media", express.static(VIDEOS_DIR, { immutable: true, maxAge: "30d" }));

const person = (body) => ({
  avatar: AVATARS.includes(body?.avatar) ? body.avatar : AVATARS[0],
  name: String(body?.name ?? "").trim().slice(0, 40),
});

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
    const video = await addVideo({
      ...stored,
      ...person(req.query),
      caption: String(req.query.caption ?? "").trim().slice(0, 150),
      source: SOURCES.includes(req.query.source) ? req.query.source : "upload",
    });
    broadcast({ type: "video", video });
    res.status(201).json(video);
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    res.status(err.status).json({ error: err.message });
  }
});

app.post("/videos/:id/like", express.json(), async (req, res) => {
  const clientId = String(req.body?.clientId ?? "").slice(0, 64);
  if (!clientId) return res.status(400).json({ error: "missing clientId" });
  const likes = await setLike(req.params.id, clientId, Boolean(req.body.liked));
  if (likes === null) return res.status(404).json({ error: "no such video" });
  broadcast({ type: "likes", id: req.params.id, likes });
  res.json({ likes });
});

app.post("/videos/:id/comments", express.json(), async (req, res) => {
  const text = String(req.body?.text ?? "").trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: "a comment needs some text" });
  const comment = await addComment(req.params.id, { ...person(req.body), text });
  if (!comment) return res.status(404).json({ error: "no such video" });
  broadcast({ type: "comment", id: req.params.id, comment });
  res.status(201).json(comment);
});

app.get("/readme/", async (_req, res) => {
  res.type("html").send(renderReadmePage(await renderReadme()));
});

await ensureLoaded();
const port = process.env.PORT ?? 8080;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
attachLive(server);
