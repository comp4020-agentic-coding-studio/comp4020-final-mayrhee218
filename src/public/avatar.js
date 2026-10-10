// The virtual human: a 2D character drawn on a canvas and driven by face
// tracking. MediaPipe runs here in the browser, so camera frames never leave
// the device; only the drawn character is recorded.
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export const LOOKS = {
  Mochi: { skin: "#ffe0cc", hair: "#4b2a63", iris: "#8a5cf6", blush: "#ff9fb2", top: "#ffffff" },
  Neon: { skin: "#f6d3c0", hair: "#14e0d6", iris: "#ff2f88", blush: "#ff7aa8", top: "#1d1d2b" },
  Sunny: { skin: "#f3c7a3", hair: "#f2b33d", iris: "#3a8f5c", blush: "#f08a74", top: "#ff6b4a" },
  Midnight: { skin: "#fbe8de", hair: "#1c1f3a", iris: "#3d7bff", blush: "#f7a1b5", top: "#3a2f6b" },
};

export const WORLDS = ["Dusk room", "Neon street", "Cloud sky", "My room (AR)"];

let landmarker = null;
export async function loadTracker() {
  if (landmarker) return landmarker;
  const { FaceLandmarker, FilesetResolver } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, options("GPU"));
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(vision, options("CPU"));
  }
  return landmarker;
}

// Face parameters, normalised and smoothed. Landmarks are mirrored first so
// the character moves like a reflection: lean left, it leans left.
const pose = { x: 0.5, y: 0.45, scale: 1, roll: 0, yaw: 0, pitch: 0, blinkL: 0, blinkR: 0, jaw: 0, smile: 0, brows: 0, found: false };
let pitchBaseline = null;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function track(video, now) {
  if (!landmarker || video.readyState < 2) return pose;
  const result = landmarker.detectForVideo(video, now);
  const lm = result.faceLandmarks?.[0];
  if (!lm) {
    pose.found = false;
    return pose;
  }
  pose.found = true;
  const p = (i) => ({ x: 1 - lm[i].x, y: lm[i].y });
  const left = p(263); // the eye on the viewer's left once mirrored
  const right = p(33);
  const nose = p(1);
  const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const eyeDist = Math.hypot(right.x - left.x, right.y - left.y) || 0.1;

  const pitchRaw = (nose.y - mid.y) / eyeDist;
  pitchBaseline = pitchBaseline === null ? pitchRaw : lerp(pitchBaseline, pitchRaw, 0.002);

  const shapes = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
  const k = 0.45; // smoothing: higher follows faster, lower is calmer
  pose.x = lerp(pose.x, mid.x, k);
  pose.y = lerp(pose.y, mid.y, k);
  pose.scale = lerp(pose.scale, clamp(eyeDist / 0.16, 0.6, 1.6), k);
  pose.roll = lerp(pose.roll, Math.atan2(right.y - left.y, right.x - left.x), k);
  pose.yaw = lerp(pose.yaw, clamp((nose.x - mid.x) / eyeDist, -0.6, 0.6), k);
  pose.pitch = lerp(pose.pitch, clamp(pitchRaw - pitchBaseline, -0.4, 0.4), k);
  pose.blinkL = lerp(pose.blinkL, shapes.eyeBlinkLeft ?? 0, 0.7);
  pose.blinkR = lerp(pose.blinkR, shapes.eyeBlinkRight ?? 0, 0.7);
  pose.jaw = lerp(pose.jaw, shapes.jawOpen ?? 0, 0.6);
  pose.smile = lerp(pose.smile, ((shapes.mouthSmileLeft ?? 0) + (shapes.mouthSmileRight ?? 0)) / 2, 0.5);
  pose.brows = lerp(pose.brows, Math.max(shapes.browInnerUp ?? 0, ((shapes.browOuterUpLeft ?? 0) + (shapes.browOuterUpRight ?? 0)) / 2), 0.5);
  return pose;
}

// Gentle idle motion when no face is found, so the character never freezes.
function idle(t) {
  return { ...pose, x: 0.5, y: 0.45, scale: 1, roll: Math.sin(t / 900) * 0.05, yaw: Math.sin(t / 1300) * 0.15, pitch: 0, blinkL: (t % 4000) < 120 ? 1 : 0, blinkR: (t % 4000) < 120 ? 1 : 0, jaw: 0, smile: 0.4, brows: 0 };
}

function drawWorld(ctx, world, w, h, t, camera) {
  if (world === "My room (AR)" && camera?.readyState >= 2) {
    // Camera behind the character, cropped to fill and mirrored, softened so
    // the avatar reads as the subject.
    const vw = camera.videoWidth, vh = camera.videoHeight;
    const s = Math.max(w / vw, h / vh);
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.filter = "blur(6px) saturate(1.2)";
    ctx.drawImage(camera, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
    ctx.restore();
    ctx.fillStyle = "rgb(255 220 240 / 0.18)";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (world === "Neon street") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b0820");
    g.addColorStop(1, "#2a0b3d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const signs = [["#ff2f88", 40, 140, 120, 60], ["#14e0d6", 380, 90, 110, 160], ["#ffd23f", 60, 330, 70, 120], ["#7c5cff", 400, 360, 100, 50]];
    for (const [c, x, y, sw, sh] of signs) {
      ctx.shadowColor = c;
      ctx.shadowBlur = 25 + Math.sin(t / 300 + x) * 8;
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, sw, sh);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgb(124 92 255 / 0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.62);
      ctx.lineTo((i / 12) * w * 3 - w, h);
      ctx.stroke();
    }
    return;
  }
  if (world === "Cloud sky") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#7ec8ff");
    g.addColorStop(1, "#ffe1f0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgb(255 255 255 / 0.9)";
    for (let i = 0; i < 6; i++) {
      const x = ((i * 173 + t / 40) % (w + 200)) - 100;
      const y = 80 + ((i * 97) % 500);
      for (const [dx, dy, r] of [[0, 0, 36], [34, -14, 44], [72, 0, 34]]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }
  // Dusk room
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffb6a3");
  g.addColorStop(1, "#6b4c9a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgb(255 240 210 / 0.55)";
  ctx.fillRect(w * 0.6, h * 0.12, w * 0.3, h * 0.22);
  ctx.strokeStyle = "rgb(80 50 90 / 0.6)";
  ctx.lineWidth = 6;
  ctx.strokeRect(w * 0.6, h * 0.12, w * 0.3, h * 0.22);
  for (let i = 0; i < 14; i++) {
    const x = (i / 13) * w;
    const y = h * 0.06 + Math.sin(i * 0.9) * 18;
    ctx.fillStyle = `hsl(${40 + i * 20} 100% ${70 + Math.sin(t / 400 + i) * 15}%)`;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#4a3570";
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
}

function drawCharacter(ctx, look, s, w, h) {
  const cx = w * (0.5 + (s.x - 0.5) * 0.5);
  const cy = h * (0.42 + (s.y - 0.45) * 0.4);
  const r = 120 * s.scale;
  const yawShift = s.yaw * r * 0.55;
  const pitchShift = s.pitch * r * 0.5;

  // shoulders stay upright and only drift a little with the head
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 2.25, r * 1.5, r * 0.95, 0, Math.PI, 0);
  ctx.lineTo(cx + r * 1.5, h);
  ctx.lineTo(cx - r * 1.5, h);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.fillRect(cx - r * 0.25, cy + r * 0.8, r * 0.5, r * 0.6);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.roll);

  // back hair
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(-yawShift * 0.2, r * 0.15, r * 1.12, r * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // face
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.92, r * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();

  // features follow yaw and pitch so the head reads as turning
  ctx.translate(yawShift, pitchShift);
  const eyeY = -r * 0.05;
  const eyeX = r * 0.36;
  for (const [side, blink] of [[-1, s.blinkL], [1, s.blinkR]]) {
    const open = clamp(1 - blink * 1.25, 0.06, 1);
    ctx.save();
    ctx.translate(side * eyeX, eyeY);
    ctx.scale(1, open);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.iris;
    ctx.beginPath();
    ctx.ellipse(s.yaw * r * 0.12, r * 0.03, r * 0.14, r * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1030";
    ctx.beginPath();
    ctx.ellipse(s.yaw * r * 0.12, r * 0.05, r * 0.07, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s.yaw * r * 0.12 - r * 0.05, -r * 0.05, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (open < 0.2) {
      ctx.strokeStyle = "#3a2440";
      ctx.lineWidth = r * 0.04;
      ctx.beginPath();
      ctx.arc(side * eyeX, eyeY - r * 0.04, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  // brows
  ctx.strokeStyle = look.hair;
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const by = eyeY - r * 0.36 - s.brows * r * 0.14;
    ctx.beginPath();
    ctx.moveTo(side * (eyeX - r * 0.16), by + r * 0.02);
    ctx.quadraticCurveTo(side * eyeX, by - r * 0.06, side * (eyeX + r * 0.16), by + r * 0.04);
    ctx.stroke();
  }

  // blush
  ctx.fillStyle = look.blush;
  ctx.globalAlpha = 0.45 + s.smile * 0.35;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.55, r * 0.3, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // mouth: opens with the jaw, curves with a smile
  const mouthY = r * 0.48;
  const mw = r * (0.18 + s.smile * 0.12);
  const mh = r * (0.02 + s.jaw * 0.38);
  ctx.fillStyle = "#7a2440";
  ctx.beginPath();
  ctx.moveTo(-mw, mouthY);
  ctx.quadraticCurveTo(0, mouthY + mh + s.smile * r * 0.12, mw, mouthY);
  ctx.quadraticCurveTo(0, mouthY - mh * 0.3 + s.smile * r * 0.04, -mw, mouthY);
  ctx.fill();
  if (s.jaw > 0.25) {
    ctx.fillStyle = "#ff8fa8";
    ctx.beginPath();
    ctx.ellipse(0, mouthY + mh * 0.55, mw * 0.5, mh * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // fringe last, so it sits over the forehead
  ctx.translate(-yawShift * 0.5, -pitchShift * 0.5);
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.95, -r * 1.15, 0, -r * 1.12);
  ctx.quadraticCurveTo(r * 0.95, -r * 1.15, r * 0.98, -r * 0.1);
  for (let i = 4; i >= 0; i--) {
    const x = -r * 0.9 + (i / 4) * r * 1.8;
    ctx.quadraticCurveTo(x + r * 0.2, -r * 0.55, x, -r * 0.35 - (i % 2) * r * 0.1);
  }
  ctx.fill();
  ctx.restore();
}

export function drawAvatarScene(ctx, { look, world, camera, t, pose: tracked }) {
  const { width: w, height: h } = ctx.canvas;
  drawWorld(ctx, world, w, h, t, camera);
  drawCharacter(ctx, LOOKS[look] ?? LOOKS.Mochi, tracked?.found ? tracked : idle(t), w, h);
}

// Camera mode: the raw camera, cropped to 9:16 and mirrored like a selfie.
export function drawCameraScene(ctx, camera) {
  const { width: w, height: h } = ctx.canvas;
  if (camera.readyState < 2) return;
  const vw = camera.videoWidth, vh = camera.videoHeight;
  const s = Math.max(w / vw, h / vh);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s);
  ctx.restore();
}
