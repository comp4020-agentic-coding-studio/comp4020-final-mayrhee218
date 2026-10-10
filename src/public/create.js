import { LOOKS, WORLDS, drawAvatarScene, drawCameraScene, loadTracker, track } from "./avatar.js";
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

lookSelect.append(...Object.keys(LOOKS).map((l) => new Option(l, l)));
worldSelect.append(...WORLDS.map((w) => new Option(w, w)));
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
      : worldSelect.value === "My room (AR)"
        ? "AR world: a blurred view of your room is recorded behind the avatar. Your face is still tracked on this device only."
        : "Avatar mode: your face is tracked on this device. Only the avatar is recorded.";
}
worldSelect.addEventListener("change", updateHint);

async function enterLive(next) {
  mode = next;
  avatarPickers.hidden = mode !== "avatar";
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
      drawAvatarScene(ctx, { look: lookSelect.value, world: worldSelect.value, camera, t, pose });
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
  recorder.addEventListener("dataavailable", (e) => e.data.size && chunks.push(e.data));
  recorder.addEventListener("stop", () => {
    clearInterval(startRecording.tick);
    timer.hidden = true;
    recordButton.classList.remove("recording");
    recordButton.setAttribute("aria-label", "start recording");
    if (!chunks.length) return;
    showClip(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }), source);
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

function showClip(blob, source) {
  clip = { blob, source };
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
