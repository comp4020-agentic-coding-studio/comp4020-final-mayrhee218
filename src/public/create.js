import { LIVE_CAMERA, WORLDS, drawAvatarScene, drawCameraScene, faceIn, loadAvatar, loadTracker, track, webglAvailable } from "./avatar.js";
import { DEFAULT_STYLE, STYLES, portrait, stylise } from "./room.js";
import { me, save } from "./me.js";

const MAX_SECONDS = 30;
const MAX_BYTES = 25 * 1024 * 1024;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const preview = document.getElementById("preview");
const message = document.getElementById("stage-message");
const timer = document.getElementById("timer");
const recordButton = document.getElementById("record");
const liveControls = document.getElementById("live-controls");
const uploadControls = document.getElementById("upload-controls");
const avatarPickers = document.getElementById("avatar-pickers");
const privacyHint = document.getElementById("privacy-hint");
const fileInput = document.getElementById("file");
const postForm = document.getElementById("post");
const postStatus = document.getElementById("post-status");
const lookSelect = document.getElementById("look");
const worldSelect = document.getElementById("world");

const modelFile = document.getElementById("model-file");
const modelDelete = document.getElementById("model-delete");
const modelStatus = document.getElementById("model-status");
const MAX_MODEL_BYTES = 15 * 1024 * 1024;
const MODEL_KEY = "the-space:model";

// Every avatar on offer, by id: the built-ins from the manifest, then this
// browser's own uploads, which the server only ever shows to their owner.
const models = new Map(); // id -> { id, name, url, faceTracking, mine }
async function loadModels() {
  const manifest = await fetch("/assets/models/manifest.json")
    .then((r) => r.json())
    .catch(() => ({ models: [] }));
  for (const m of manifest.models) {
    models.set(m.id, { id: m.id, name: m.name, url: `/assets/models/${m.file}`, faceTracking: true, mine: false, roomStyle: m.roomStyle });
  }
  const mine = await fetch("/avatars")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  for (const m of mine) models.set(m.id, { ...m, mine: true });
  let saved = null;
  try {
    saved = localStorage.getItem(MODEL_KEY);
  } catch {}
  renderModelOptions(saved ?? manifest.default);
}

function renderModelOptions(selected) {
  lookSelect.replaceChildren(
    ...[...models.values()].map((m) => new Option(m.mine ? `${m.name} (yours)` : m.name, m.id)),
  );
  lookSelect.value = models.has(selected) ? selected : (lookSelect.options[0]?.value ?? "");
  selectModel();
}

const currentModel = () => models.get(lookSelect.value);

function selectModel() {
  const model = currentModel();
  modelDelete.hidden = !model?.mine;
  try {
    localStorage.setItem(MODEL_KEY, lookSelect.value);
  } catch {}
  if (!model) return;
  if (room.photo && !room.styleTouched && STYLES[model.roomStyle]) {
    roomStyle.value = model.roomStyle;
    restyleRoom();
  }
  modelStatus.textContent = model.faceTracking
    ? ""
    : "Preview only: this model has no humanoid head, so it can't follow your face.";
  loadAvatar(model.url).catch((err) => {
    if (lookSelect.value === model.id) modelStatus.textContent = `${model.name} couldn't load: ${err.message}`;
  });
}
lookSelect.addEventListener("change", selectModel);

modelFile.addEventListener("change", async () => {
  const file = modelFile.files?.[0];
  modelFile.value = "";
  if (!file) return;
  if (!/\.(vrm|glb)$/i.test(file.name)) {
    modelStatus.textContent = "Pick a .vrm (or .glb) file.";
    return;
  }
  if (file.size > MAX_MODEL_BYTES) {
    modelStatus.textContent = "That model is over 15 MB.";
    return;
  }
  modelStatus.textContent = `Uploading ${file.name}…`;
  const name = file.name.replace(/\.(vrm|glb)$/i, "").slice(0, 40);
  const res = await fetch(`/avatars?${new URLSearchParams({ name })}`, {
    method: "POST",
    headers: { "content-type": "model/gltf-binary" },
    body: file,
  }).catch(() => null);
  const body = await res?.json().catch(() => ({}));
  if (!res?.ok) {
    modelStatus.textContent = body?.error ?? "Upload failed. Try again.";
    return;
  }
  models.set(body.id, { ...body, mine: true });
  renderModelOptions(body.id);
  if (body.faceTracking) modelStatus.textContent = `${body.name} is ready.`;
});

modelDelete.addEventListener("click", async () => {
  const model = currentModel();
  if (!model?.mine || !confirm(`Delete ${model.name}?`)) return;
  const res = await fetch(`/avatars/${encodeURIComponent(model.id)}`, { method: "DELETE" }).catch(() => null);
  if (!res?.ok) {
    modelStatus.textContent = "Couldn't delete that avatar.";
    return;
  }
  models.delete(model.id);
  renderModelOptions("");
});

if (!webglAvailable) modelStatus.textContent = "This browser can't draw 3D avatars. Camera and Upload still work.";
loadModels();
worldSelect.append(...WORLDS.map((w) => new Option(w, w)));

// --- Transform my room (a 2D photo background; see room.js) -------------
const roomEl = {
  snap: document.getElementById("room-snap"),
  file: document.getElementById("room-file"),
  styling: document.getElementById("room-styling"),
  ai: document.getElementById("room-ai"),
  clear: document.getElementById("room-clear"),
  consent: document.getElementById("room-consent"),
  consentText: document.getElementById("room-consent-text"),
  consentYes: document.getElementById("room-consent-yes"),
  consentNo: document.getElementById("room-consent-no"),
  status: document.getElementById("room-status"),
};
const roomStyle = document.getElementById("room-style");
roomStyle.append(...Object.entries(STYLES).map(([key, st]) => new Option(st.name, key)));
roomStyle.value = DEFAULT_STYLE;
const ROOM_PHOTO = "room";
const room = { photo: null, filtered: null, ai: null, styleTouched: false };

// The picture behind the avatar right now: an AI result if there is one for
// this style, otherwise the on-device filter.
const roomBackdrop = () => (room.ai?.style === roomStyle.value ? room.ai.image : room.filtered);

function restyleRoom() {
  if (!room.photo) return;
  room.filtered = stylise(room.photo, roomStyle.value);
  roomEl.status.textContent =
    room.ai?.style === roomStyle.value
      ? `Showing the AI-restyled room (${room.ai.provider}).`
      : "Showing your room with an on-device colour filter (not AI). The photo hasn't left this device.";
}

function useRoomPhoto(source) {
  room.photo = portrait(source);
  room.ai = null;
  const face = faceIn(room.photo);
  restyleRoom();
  if (face) roomEl.status.textContent = "There's a face in this photo. Anyone in it will be in your video: retake it with the room empty.";
  roomEl.styling.hidden = false;
  if (![...worldSelect.options].some((o) => o.value === ROOM_PHOTO)) {
    worldSelect.append(new Option("My room (photo)", ROOM_PHOTO));
  }
  worldSelect.value = ROOM_PHOTO;
  updateHint();
}

roomStyle.addEventListener("change", () => {
  room.styleTouched = true;
  restyleRoom();
});

roomEl.snap.addEventListener("click", async () => {
  if (!(await startCamera())) return;
  roomEl.snap.disabled = true;
  for (let n = 5; n > 0; n--) {
    roomEl.status.textContent = `Step out of frame… ${n}`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  roomEl.snap.disabled = false;
  if (camera.readyState < 2) {
    roomEl.status.textContent = "The camera isn't ready. Try again.";
    return;
  }
  // Mirrored like the selfie view, so it matches what you saw.
  const c = document.createElement("canvas");
  c.width = camera.videoWidth;
  c.height = camera.videoHeight;
  const cctx = c.getContext("2d");
  cctx.translate(c.width, 0);
  cctx.scale(-1, 1);
  cctx.drawImage(camera, 0, 0);
  useRoomPhoto(c);
});

roomEl.file.addEventListener("change", async () => {
  const file = roomEl.file.files?.[0];
  roomEl.file.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    roomEl.status.textContent = "That picture is over 10 MB.";
    return;
  }
  try {
    useRoomPhoto(await createImageBitmap(file));
  } catch {
    roomEl.status.textContent = "That file isn't a picture this browser can open.";
  }
});

roomEl.clear.addEventListener("click", () => {
  Object.assign(room, { photo: null, filtered: null, ai: null, styleTouched: false });
  roomEl.styling.hidden = true;
  roomEl.consent.hidden = true;
  roomEl.status.textContent = "";
  worldSelect.querySelector(`option[value="${ROOM_PHOTO}"]`)?.remove();
  updateHint();
});
postForm.elements.namedItem("avatar").value = me.avatar;
postForm.elements.namedItem("name").value = me.name;

const camera = document.createElement("video");
camera.muted = true;
camera.playsInline = true;

let mode = "avatar";
let stream = null;
let recorder = null;
let clip = null; // { blob, source }
let trackerReady = false;

const can = {
  camera: Boolean(navigator.mediaDevices?.getUserMedia),
  record: typeof MediaRecorder !== "undefined" && typeof canvas.captureStream === "function",
};

function say(text) {
  message.textContent = text;
}

async function startCamera() {
  if (stream) return true;
  if (!can.camera) {
    say("This browser can't open the camera. Try Upload instead.");
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
  } catch (err) {
    try {
      // No microphone (or it was refused): video-only clips are still clips.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    } catch {
      say(err?.name === "NotAllowedError" ? "Camera permission was refused. Allow it in your browser settings, or try Upload." : "No camera found. Try Upload instead.");
      return false;
    }
  }
  camera.srcObject = stream;
  await camera.play().catch(() => {});
  return true;
}

function stopCamera() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
}

function updateHint() {
  privacyHint.textContent =
    mode === "camera"
      ? "Camera mode: records what your camera sees."
      : worldSelect.value === LIVE_CAMERA
        ? "Live camera: your real camera, blurred, is recorded behind the avatar. You, your face and your room can still be recognised in the clip."
        : worldSelect.value === ROOM_PHOTO
          ? "Room photo: your face is tracked on this device. The avatar and your room photo are recorded."
          : "Avatar mode: your face is tracked on this device. Only the avatar is recorded.";
}
worldSelect.addEventListener("change", updateHint);

async function enterLive(next) {
  mode = next;
  avatarPickers.hidden = mode !== "avatar";
  document.getElementById("avatar-upload").hidden = mode !== "avatar";
  modelStatus.hidden = mode !== "avatar";
  updateHint();
  liveControls.hidden = false;
  uploadControls.hidden = true;
  recordButton.disabled = true;
  say("Allow the camera to start");
  if (!(await startCamera())) return;
  if (!can.record) {
    say("This browser can't record here. Try Upload instead.");
    return;
  }
  if (mode === "avatar" && !trackerReady) {
    say("Loading face tracking…");
    try {
      await loadTracker();
      trackerReady = true;
    } catch {
      say("Face tracking couldn't load. Your character will still move on its own.");
      setTimeout(() => say(""), 2500);
    }
  }
  if (mode === next) {
    if (message.textContent.startsWith("Loading") || message.textContent.startsWith("Allow")) say("");
    recordButton.disabled = false;
  }
}

function enterUpload() {
  mode = "upload";
  if (recorder?.state === "recording") recorder.stop();
  stopCamera();
  liveControls.hidden = true;
  uploadControls.hidden = false;
  say("Pick a short video from your device");
}

let lastVideoTime = -1;
let pose = null;
function frame(t) {
  if (!clip) {
    if (mode === "avatar") {
      if (trackerReady && camera.currentTime !== lastVideoTime) {
        lastVideoTime = camera.currentTime;
        try {
          pose = track(camera, t);
        } catch {}
      }
      const backdrop = worldSelect.value === ROOM_PHOTO ? roomBackdrop() : null;
      drawAvatarScene(ctx, { model: currentModel()?.url, world: worldSelect.value, backdrop, camera, t, pose });
    } else if (mode === "camera") {
      drawCameraScene(ctx, camera);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a", "video/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

function startRecording() {
  // Record the drawn canvas, never the raw camera directly: in avatar mode
  // that is what keeps your face out of the clip.
  const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(stream?.getAudioTracks() ?? [])];
  const mimeType = pickMimeType();
  recorder = new MediaRecorder(new MediaStream(tracks), { ...(mimeType && { mimeType }), videoBitsPerSecond: 1_500_000 });
  const chunks = [];
  const source = mode;
  const model = mode === "avatar" ? lookSelect.value : null;
  recorder.addEventListener("dataavailable", (e) => e.data.size && chunks.push(e.data));
  recorder.addEventListener("stop", () => {
    clearInterval(startRecording.tick);
    timer.hidden = true;
    recordButton.classList.remove("recording");
    recordButton.setAttribute("aria-label", "start recording");
    if (!chunks.length) return;
    showClip(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }), source, model);
  });
  recorder.start(1000);
  recordButton.classList.add("recording");
  recordButton.setAttribute("aria-label", "stop recording");
  const started = Date.now();
  timer.hidden = false;
  timer.textContent = "0:00";
  startRecording.tick = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    timer.textContent = `0:${String(s).padStart(2, "0")}`;
    if (s >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
  }, 250);
}

recordButton.addEventListener("click", () => {
  if (recorder?.state === "recording") recorder.stop();
  else startRecording();
});

function showClip(blob, source, model = null) {
  clip = { blob, source, model };
  preview.src = URL.createObjectURL(blob);
  preview.hidden = false;
  canvas.hidden = true;
  preview.muted = false;
  preview.play().catch(() => {});
  say("");
  liveControls.hidden = true;
  uploadControls.hidden = true;
  postForm.hidden = false;
  postStatus.textContent = blob.size > MAX_BYTES ? "That clip is over 25 MB. Retake a shorter one." : "";
}

function discardClip() {
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.removeAttribute("src");
  preview.hidden = true;
  canvas.hidden = false;
  clip = null;
  postForm.hidden = true;
  fileInput.value = "";
  if (mode === "upload") enterUpload();
  else enterLive(mode);
}
document.getElementById("retake").addEventListener("click", discardClip);

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_BYTES) {
    say("That video is over 25 MB. Pick a shorter one.");
    return;
  }
  showClip(file, "upload");
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!clip || clip.blob.size > MAX_BYTES) return;
  const data = new FormData(postForm);
  save({ avatar: String(data.get("avatar")), name: String(data.get("name")).trim().slice(0, 40) });
  const query = new URLSearchParams({ caption: String(data.get("caption")), name: me.name, avatar: me.avatar, source: clip.source });
  if (clip.source === "avatar" && clip.model) query.set("avatarModelId", clip.model);
  const submit = postForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  postStatus.textContent = "Posting…";
  try {
    const res = await fetch(`/videos?${query}`, {
      method: "POST",
      headers: { "content-type": clip.blob.type.split(";")[0] || "application/octet-stream" },
      body: clip.blob,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "posting failed");
    stopCamera();
    location.href = `/#v-${body.id}`;
  } catch (err) {
    postStatus.textContent = `${err.message}. Try again.`;
    submit.disabled = false;
  }
});

for (const tab of document.querySelectorAll("[data-mode]")) {
  tab.addEventListener("click", () => {
    if (clip || recorder?.state === "recording") return;
    for (const t of document.querySelectorAll("[data-mode]")) t.setAttribute("aria-selected", String(t === tab));
    if (tab.dataset.mode === "upload") enterUpload();
    else enterLive(tab.dataset.mode);
  });
}

enterLive("avatar");
