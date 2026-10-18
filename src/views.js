export const AVATARS = ["🙂", "🦊", "🐧", "🤖", "👾", "🌙", "🌻", "🐙"];

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SOURCE_LABEL = { avatar: "🎭 virtual human", camera: "📷 camera", upload: "⬆️ upload" };

function layout(title, body, { bodyClass = "", scripts = [], head = "" } = {}) {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#140a24" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/assets/app.css" />
    ${head}
  </head>
  <body class="${bodyClass}">
    ${body}
    ${scripts.map((s) => `<script type="module" src="/assets/${s}"></script>`).join("\n    ")}
  </body>
</html>`;
}

function bottomNav(active) {
  const item = (href, key, icon, label) =>
    `<a href="${href}" class="${active === key ? "active" : ""}"${active === key ? ' aria-current="page"' : ""}>${icon}<span>${label}</span></a>`;
  return `<nav class="bottom-nav" aria-label="main">
    ${item("/", "home", '<span class="icon" aria-hidden="true">⌂</span>', "Home")}
    <a href="/create" class="create" aria-label="create a video"><span aria-hidden="true">＋</span></a>
    ${item("/readme/", "about", '<span class="icon" aria-hidden="true">ⓘ</span>', "About")}
  </nav>`;
}

export function renderClip(v) {
  return `<article class="clip" id="v-${escapeHtml(v.id)}" data-id="${escapeHtml(v.id)}" data-by="${escapeHtml(v.by ?? "")}">
      <video src="${escapeHtml(v.src)}" type="${escapeHtml(v.type)}" loop muted playsinline preload="metadata"></video>
      <div class="rail">
        <span class="creator" title="${escapeHtml(v.name || "someone")}">${escapeHtml(v.avatar)}</span>
        <button class="like" type="button" aria-pressed="false" aria-label="like"><span class="icon" aria-hidden="true">♥</span><span class="count">${v.likes}</span></button>
        <button class="comments-open" type="button" aria-label="comments"><span class="icon" aria-hidden="true">💬</span><span class="count">${v.comments.length}</span></button>
        <button class="share" type="button" aria-label="share"><span class="icon" aria-hidden="true">↗</span><span class="count">Share</span></button>
        <button class="delete" type="button" aria-label="delete this video" hidden><span class="icon" aria-hidden="true">🗑</span><span class="count">Delete</span></button>
      </div>
      <div class="info">
        <strong>@${escapeHtml(v.name || "someone")}</strong>
        ${v.caption ? `<p>${escapeHtml(v.caption)}</p>` : ""}
        <span class="meta">${SOURCE_LABEL[v.source] ?? ""} · ${timeAgo(v.createdAt)}</span>
      </div>
      <script type="application/json" class="comment-data">${JSON.stringify(v.comments).replaceAll("<", "\\u003c")}</script>
    </article>`;
}

export function renderFeed(videos) {
  const clips = videos.length
    ? videos.map(renderClip).join("\n    ")
    : `<article class="clip empty-feed"><div><p class="big">🎭</p><p>No videos yet.</p><p><a href="/create" class="pill">Make the first one</a></p></div></article>`;

  return layout(
    "For You",
    `<header class="top-bar">
      <span class="tab active">For You</span>
      <div class="here" id="here" aria-live="polite" title="here right now"></div>
    </header>
    <main class="feed" id="feed">
    ${clips}
    </main>
    <button class="sound" id="sound" type="button" aria-pressed="false">🔇 Tap for sound</button>
    <dialog class="sheet" id="comments">
      <header><strong><span id="comment-count">0</span> comments</strong><button type="button" class="close" aria-label="close">✕</button></header>
      <ul id="comment-list"></ul>
      <form id="comment-form">
        <input name="text" maxlength="200" placeholder="Add a comment…" autocomplete="off" required />
        <button type="submit">Post</button>
      </form>
    </dialog>
    <div class="toast" id="toast" role="status"></div>
    ${bottomNav("home")}`,
    { bodyClass: "app", scripts: ["feed.js"] },
  );
}

// three-vrm imports "three" by bare name, so the studio maps it to a pinned CDN
// build. Loaded only when the avatar is first drawn (src/public/avatar.js).
const STUDIO_IMPORTS = `<script type="importmap">${JSON.stringify({
  imports: {
    three: "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/",
    "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.5/lib/three-vrm.module.min.js",
  },
})}</script>`;

export function renderCreate() {
  const avatarOptions = AVATARS.map((a) => `<option value="${a}">${a}</option>`).join("");
  return layout(
    "Create",
    `<header class="top-bar studio-bar">
      <a href="/" class="close" aria-label="back to the feed">✕</a>
      <div class="modes" role="tablist">
        <button type="button" role="tab" data-mode="avatar" aria-selected="true">Avatar</button>
        <button type="button" role="tab" data-mode="camera" aria-selected="false">Camera</button>
        <button type="button" role="tab" data-mode="upload" aria-selected="false">Upload</button>
      </div>
    </header>
    <main class="studio">
      <div class="stage">
        <canvas id="canvas" width="540" height="960"></canvas>
        <video id="preview" loop playsinline hidden></video>
        <div class="stage-message" id="stage-message">Allow the camera to start</div>
        <div class="timer" id="timer" hidden>0:00</div>
      </div>

      <div class="controls" id="live-controls">
        <div class="pickers" id="avatar-pickers">
          <label>Avatar <select id="look"></select></label>
          <label>World <select id="world"></select></label>
        </div>
        <div class="avatar-upload" id="avatar-upload">
          <label class="pill ghost small">Upload 3D avatar<input type="file" id="model-file" accept=".vrm,.glb" /></label>
          <button type="button" class="pill ghost small" id="model-delete" hidden>Delete this avatar</button>
        </div>
        <p class="hint" id="model-status" role="status"></p>
        <div class="avatar-upload" id="world-upload">
          <label class="pill ghost small">Upload 3D world (.glb)<input type="file" id="world-file" accept=".glb" /></label>
          <button type="button" class="pill ghost small" id="world-delete" hidden>Delete this world</button>
        </div>
        <p class="hint" id="world-status" role="status"></p>
        <details class="room" id="room">
          <summary>Transform my room <span class="tag">2D photo</span></summary>
          <p class="hint">A still photo of your room, restyled to suit your avatar and shown behind it. It's a flat picture, not a 3D world. Step out of frame first: anyone in the photo ends up in your video.</p>
          <div class="row">
            <button type="button" class="pill ghost small" id="room-snap">Take photo in 5 s</button>
            <label class="pill ghost small">Use a picture<input type="file" id="room-file" accept="image/jpeg,image/png,image/webp" /></label>
          </div>
          <div class="row" id="room-styling" hidden>
            <label>Style <select id="room-style"></select></label>
            <button type="button" class="pill ghost small" id="room-ai" hidden>Restyle with AI…</button>
            <button type="button" class="pill ghost small" id="room-clear">Remove</button>
          </div>
          <div class="consent" id="room-consent" hidden>
            <p id="room-consent-text"></p>
            <div class="row">
              <button type="button" class="pill small" id="room-consent-yes">Send this photo</button>
              <button type="button" class="pill ghost small" id="room-consent-no">Cancel</button>
            </div>
          </div>
          <p class="hint" id="room-status" role="status"></p>
        </details>
        <button type="button" class="record" id="record" aria-label="start recording" disabled><span></span></button>
        <p class="hint" id="privacy-hint">Avatar mode: your face is tracked on this device. Only the avatar is recorded.</p>
      </div>

      <div class="controls" id="upload-controls" hidden>
        <label class="pill file">Choose a video<input type="file" id="file" accept="video/*" /></label>
        <p class="hint">Up to 25 MB.</p>
      </div>

      <form class="post" id="post" hidden>
        <input name="caption" maxlength="150" placeholder="Describe your video…" autocomplete="off" />
        <div class="row">
          <select name="avatar" aria-label="your emoji">${avatarOptions}</select>
          <input name="name" maxlength="40" placeholder="your name" autocomplete="nickname" />
        </div>
        <div class="row">
          <button type="button" class="pill ghost" id="retake">Retake</button>
          <button type="submit" class="pill">Post</button>
        </div>
        <p class="hint" id="post-status" role="status"></p>
      </form>
    </main>`,
    { bodyClass: "app studio-page", scripts: ["create.js"], head: STUDIO_IMPORTS },
  );
}

export function renderReadmePage(html) {
  return layout(
    "About",
    `<main class="readme">
      <nav><a href="/">&larr; back to the feed</a></nav>
      ${html}
    </main>
    ${bottomNav("about")}`,
    { bodyClass: "doc" },
  );
}
