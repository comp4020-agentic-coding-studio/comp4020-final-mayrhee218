import { connectLive, el, me, save } from "./me.js";

const feed = document.getElementById("feed");
const here = document.getElementById("here");
const soundButton = document.getElementById("sound");
const sheet = document.getElementById("comments");
const commentList = document.getElementById("comment-list");
const commentCount = document.getElementById("comment-count");
const commentForm = document.getElementById("comment-form");
const toast = document.getElementById("toast");

const LIKED_KEY = "the-space:liked";
let liked = new Set();
try {
  liked = new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]"));
} catch {}
const rememberLikes = () => {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]));
  } catch {}
};

let muted = true;
let myId = null;
let myBy = null; // this browser's public handle, from the server
let openClip = null;
const comments = new Map(); // video id -> comment[]

const clipFor = (id) => document.querySelector(`.clip[data-id="${CSS.escape(id)}"]`);

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function bump(node, value) {
  node.textContent = value;
  node.classList.remove("bump");
  void node.offsetWidth;
  node.classList.add("bump");
}

// Only the clip on screen plays; the rest stay paused and keep their buffer.
const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const video = entry.target.querySelector("video");
      if (!video) continue;
      if (entry.isIntersecting) {
        video.muted = muted;
        entry.target.classList.remove("paused");
        video.play().catch(() => {});
        // Warm up the next clip so the swipe starts instantly.
        const next = entry.target.nextElementSibling?.querySelector("video");
        if (next && next.preload !== "auto") next.preload = "auto";
      } else {
        video.pause();
      }
    }
  },
  { root: feed, threshold: 0.6 },
);

function wire(clip) {
  const id = clip.dataset.id;
  if (!id) return;
  try {
    comments.set(id, JSON.parse(clip.querySelector(".comment-data")?.textContent ?? "[]"));
  } catch {
    comments.set(id, []);
  }
  const video = clip.querySelector("video");
  video.addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
      clip.classList.remove("paused");
    } else {
      video.pause();
      clip.classList.add("paused");
    }
  });
  let lastTap = 0;
  video.addEventListener("pointerup", () => {
    const now = Date.now();
    if (now - lastTap < 300) setLiked(clip, true);
    lastTap = now;
  });
  const likeButton = clip.querySelector(".like");
  likeButton.setAttribute("aria-pressed", String(liked.has(id)));
  likeButton.addEventListener("click", () => setLiked(clip, !liked.has(id)));
  clip.querySelector(".comments-open").addEventListener("click", () => openComments(clip));
  clip.querySelector(".share").addEventListener("click", () => share(clip));
  const deleteButton = clip.querySelector(".delete");
  deleteButton.hidden = !myBy || clip.dataset.by !== myBy;
  deleteButton.addEventListener("click", () => deleteVideo(clip));
  visibility.observe(clip);
}

async function setLiked(clip, value) {
  const id = clip.dataset.id;
  const button = clip.querySelector(".like");
  if (value) liked.add(id);
  else liked.delete(id);
  rememberLikes();
  button.setAttribute("aria-pressed", String(value));
  button.classList.remove("pop");
  void button.offsetWidth;
  if (value) button.classList.add("pop");
  const res = await fetch(`/videos/${encodeURIComponent(id)}/like`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ liked: value }),
  }).catch(() => null);
  if (!res?.ok) showToast("couldn't save that like");
}

async function deleteVideo(clip) {
  if (!confirm("Delete this video for everyone?")) return;
  const res = await fetch(`/videos/${encodeURIComponent(clip.dataset.id)}`, { method: "DELETE" }).catch(() => null);
  if (!res?.ok) showToast((await res?.json().catch(() => null))?.error ?? "couldn't delete that video");
}

async function deleteComment(c) {
  if (!openClip) return;
  const url = `/videos/${encodeURIComponent(openClip.dataset.id)}/comments/${encodeURIComponent(c.id)}`;
  const res = await fetch(url, { method: "DELETE" }).catch(() => null);
  if (!res?.ok) showToast((await res?.json().catch(() => null))?.error ?? "couldn't delete that comment");
}

async function share(clip) {
  const url = new URL(`/#v-${clip.dataset.id}`, location.href).href;
  try {
    if (navigator.share) await navigator.share({ url });
    else {
      await navigator.clipboard.writeText(url);
      showToast("link copied");
    }
  } catch {}
}

function commentItem(c, arrived = false) {
  const li = el("li", arrived ? "arrived" : "");
  const body = el("div");
  body.append(el("div", "name", c.name || "someone"), el("p", "", c.text));
  li.append(el("span", "who", c.avatar), body);
  // Mirrors the server's rule: the writer, or the video's poster.
  if (myBy && (c.by === myBy || openClip?.dataset.by === myBy)) {
    const remove = el("button", "remove", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", "delete this comment");
    remove.addEventListener("click", () => deleteComment(c));
    li.append(remove);
  }
  return li;
}

function renderComments() {
  const list = comments.get(openClip.dataset.id) ?? [];
  commentCount.textContent = list.length;
  commentList.replaceChildren(...list.map((c) => commentItem(c)));
  if (!list.length) commentList.append(el("li", "empty", "No comments yet. Say something."));
}

function openComments(clip) {
  openClip = clip;
  renderComments();
  sheet.showModal();
  commentList.scrollTop = commentList.scrollHeight;
}
sheet.querySelector(".close").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (event) => {
  if (event.target === sheet) sheet.close();
});
sheet.addEventListener("close", () => (openClip = null));

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!openClip) return;
  const input = commentForm.elements.namedItem("text");
  if (!me.name) save({ name: prompt("What should people call you?")?.trim().slice(0, 40) ?? "" });
  const res = await fetch(`/videos/${encodeURIComponent(openClip.dataset.id)}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: me.name, avatar: me.avatar, text: input.value }),
  }).catch(() => null);
  if (res?.ok) input.value = "";
  else showToast("couldn't post that comment");
});

soundButton.addEventListener("click", () => {
  muted = false;
  soundButton.setAttribute("aria-pressed", "true");
  for (const video of feed.querySelectorAll("video")) video.muted = false;
});

function renderPresence(people) {
  const faces = el("span", "faces");
  for (const p of people.slice(0, 5)) {
    const face = el("span", p.id === myId ? "me" : "", p.avatar);
    face.title = p.id === myId ? "you" : p.name || "someone";
    faces.append(face);
  }
  here.replaceChildren(el("span", "live-dot"), faces, el("span", "", `${people.length} here`));
  here.title = people.map((p) => (p.id === myId ? "you" : p.name || "someone")).join(", ");
}

// New clips arrive at the top. If you're mid-scroll they slot in above you
// without moving what you're watching.
function addVideo(video) {
  if (clipFor(video.id)) return;
  document.querySelector(".empty-feed")?.remove();
  const template = document.createElement("template");
  template.innerHTML = clipMarkup(video);
  const clip = template.content.firstElementChild;
  const atTop = feed.scrollTop < 10;
  feed.prepend(clip);
  wire(clip);
  if (!atTop) {
    feed.scrollTop += clip.offsetHeight;
    showToast(`new video from @${video.name || "someone"} — scroll up`);
  } else clip.classList.add("arrived");
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SOURCE_LABEL = { avatar: "🎭 virtual human", camera: "📷 camera", upload: "⬆️ upload" };

// Mirrors renderClip in src/views.js, for clips that arrive live.
function clipMarkup(v) {
  return `<article class="clip" id="v-${esc(v.id)}" data-id="${esc(v.id)}" data-by="${esc(v.by ?? "")}">
    <video src="${esc(v.src)}" loop muted playsinline preload="auto"></video>
    <div class="rail">
      <span class="creator" title="${esc(v.name || "someone")}">${esc(v.avatar)}</span>
      <button class="like" type="button" aria-pressed="false" aria-label="like"><span class="icon" aria-hidden="true">♥</span><span class="count">${Number(v.likes)}</span></button>
      <button class="comments-open" type="button" aria-label="comments"><span class="icon" aria-hidden="true">💬</span><span class="count">${v.comments.length}</span></button>
      <button class="share" type="button" aria-label="share"><span class="icon" aria-hidden="true">↗</span><span class="count">Share</span></button>
      <button class="delete" type="button" aria-label="delete this video" hidden><span class="icon" aria-hidden="true">🗑</span><span class="count">Delete</span></button>
    </div>
    <div class="info">
      <strong>@${esc(v.name || "someone")}</strong>
      ${v.caption ? `<p>${esc(v.caption)}</p>` : ""}
      <span class="meta">${SOURCE_LABEL[v.source] ?? ""} · just now</span>
    </div>
    <script type="application/json" class="comment-data">${JSON.stringify(v.comments).replaceAll("<", "\\u003c")}</script>
  </article>`;
}

connectLive(
  (msg) => {
    if (msg.type === "welcome") {
      myId = msg.id;
      myBy = msg.by;
      for (const button of feed.querySelectorAll(".clip .delete")) {
        button.hidden = button.closest(".clip").dataset.by !== myBy;
      }
    }
    if (msg.type === "video-removed") {
      const clip = clipFor(msg.id);
      if (clip) {
        visibility.unobserve(clip);
        clip.remove();
        comments.delete(msg.id);
        if (openClip === clip) sheet.close();
        if (!msg.by || msg.by !== myBy) showToast("a video was removed by its poster");
      }
    }
    if (msg.type === "comment-removed") {
      const list = (comments.get(msg.id) ?? []).filter((c) => c.id !== msg.commentId);
      comments.set(msg.id, list);
      const count = clipFor(msg.id)?.querySelector(".comments-open .count");
      if (count) bump(count, list.length);
      if (openClip?.dataset.id === msg.id) renderComments();
    }
    if (msg.type === "presence") renderPresence(msg.people);
    if (msg.type === "video") addVideo(msg.video);
    if (msg.type === "likes") {
      const count = clipFor(msg.id)?.querySelector(".like .count");
      if (count && count.textContent !== String(msg.likes)) bump(count, msg.likes);
    }
    if (msg.type === "comment") {
      const list = comments.get(msg.id) ?? [];
      list.push(msg.comment);
      comments.set(msg.id, list);
      const count = clipFor(msg.id)?.querySelector(".comments-open .count");
      if (count) bump(count, list.length);
      if (openClip?.dataset.id === msg.id) {
        commentList.querySelector(".empty")?.remove();
        commentCount.textContent = list.length;
        commentList.append(commentItem(msg.comment, true));
        commentList.scrollTop = commentList.scrollHeight;
      }
    }
  },
  (state) => {
    if (state === "reconnecting") here.replaceChildren(el("span", "", "reconnecting…"));
  },
);

for (const clip of feed.querySelectorAll(".clip")) wire(clip);
if (location.hash.startsWith("#v-")) document.getElementById(location.hash.slice(1))?.scrollIntoView();
