import express from "express";
import { addTrace, listTraces } from "./store.js";
import { renderReadme } from "./readme.js";
import { AVATARS, renderHome, renderReadmePage } from "./views.js";

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get("/", async (_req, res) => {
  res.type("html").send(renderHome(await listTraces()));
});

app.post("/traces", async (req, res) => {
  const avatar = AVATARS.includes(req.body.avatar) ? req.body.avatar : AVATARS[0];
  const name = String(req.body.name ?? "").trim().slice(0, 40);
  const text = String(req.body.text ?? "").trim().slice(0, 280);

  if (text) {
    await addTrace({ avatar, name, text, createdAt: new Date().toISOString() });
  }
  res.redirect("/");
});

app.get("/readme/", async (_req, res) => {
  res.type("html").send(renderReadmePage(await renderReadme()));
});

const port = process.env.PORT ?? 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
