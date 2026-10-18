// The virtual human: a 3D VRM character driven by face tracking, drawn onto a
// 2D canvas over a world. MediaPipe runs here in the browser, so camera frames
// never leave the device; only the drawn character is recorded.
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";


// "Live camera (shows you)" draws the real camera, blurred, behind the avatar:
// it records you, so it's named for what it does.
export const LIVE_CAMERA = "Live camera (shows you)";
export const WORLDS = ["Dusk room", "Neon street", "Cloud sky", LIVE_CAMERA];

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

// Is there a face in this still image? Used to warn before a room photo with
// someone in it becomes a background. Only says yes when it's sure; a "no"
// means no face was found, not that no person is there.
let stillTime = 0;
export function faceIn(image) {
  if (!landmarker) return null; // can't tell
  stillTime = Math.max(performance.now(), stillTime + 1);
  return Boolean(landmarker.detectForVideo(image, stillTime).faceLandmarks?.length);
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
  if (world === LIVE_CAMERA && camera?.readyState >= 2) {
    // Camera behind the character, cropped to fill and mirrored, softened so
    // the avatar reads as the subject. The blur does not hide a person: your
    // body and face are in these pixels, and they are recorded.
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

// The character itself: a VRM model (CC0, by Polygonal Mind) rendered with
// three.js into its own WebGL canvas, then drawn over the world. Everything is
// loaded on first use, like MediaPipe above, so a CDN hiccup only costs the
// avatar mode: camera and upload keep working.
let stage = null; // Promise of the three.js setup, made once
let three = null; // that setup, once it has resolved
const loading = new Map(); // model url -> Promise of a loaded avatar
const ready = new Map(); // model url -> loaded avatar
const failed = new Map(); // model url -> why it couldn't load
let shown = null;
let lastT = null;

async function setup() {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(540, 960, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1, 1.5, 2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 540 / 960, 0.05, 50);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  three = { THREE, VRMUtils, renderer, scene, camera, loader };
  return three;
}

export const webglAvailable = (() => {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
})();

// Starts loading the model at `url` if it isn't already, and resolves to
// { vrm, scene, centre, frame, tracked } once it can be drawn. A plain GLB, or
// a VRM without a head bone, still shows, but `tracked` is false: it can't
// follow your face, and the studio says so.
export function loadAvatar(url) {
  if (!loading.has(url)) {
    failed.delete(url);
    const promise = (async () => {
      if (!webglAvailable) throw new Error("this browser can't draw 3D");
      const { THREE, VRMUtils, loader } = await (stage ??= setup());
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm ?? null;
      const scene = vrm?.scene ?? gltf.scene;
      if (vrm) {
        // VRM 0.x faces away from the camera; 1.0 already faces it.
        if (vrm.meta?.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
        const bone = (b) => vrm.humanoid?.getNormalizedBoneNode(b);
        // Out of the T-pose: arms rest at the sides.
        if (bone("leftUpperArm")) bone("leftUpperArm").rotation.z = 1.2;
        if (bone("rightUpperArm")) bone("rightUpperArm").rotation.z = -1.2;
        vrm.update(0);
      }
      scene.updateMatrixWorld(true);
      // Frame the whole model, a little above centre so it stands clear of
      // the controls at the bottom.
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) throw new Error("that model has nothing to draw");
      const frame = (box.max.y - box.min.y) * 1.25;
      const centre = box.getCenter(new THREE.Vector3()).y - frame * 0.08;
      const tracked = Boolean(vrm?.humanoid?.getNormalizedBoneNode("head"));
      const loaded = { vrm, scene, centre, frame, tracked };
      ready.set(url, loaded);
      return loaded;
    })();
    promise.catch((err) => {
      loading.delete(url);
      failed.set(url, err?.message ?? "Avatar couldn't load");
    });
    loading.set(url, promise);
  }
  return loading.get(url);
}

function say(ctx, text, w, h) {
  ctx.fillStyle = "rgb(0 0 0 / 0.45)";
  ctx.fillRect(w * 0.2, h * 0.45, w * 0.6, 56);
  ctx.fillStyle = "#fff";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h * 0.45 + 36);
}

// Sets an expression only if this model has it: models name them differently,
// and many have only some (the built-ins carry blink and a/e/i/o/u, no smile).
function express(em, names, value) {
  for (const name of names) {
    if (em.getExpression(name)) {
      em.setValue(name, clamp(value, 0, 1));
      return;
    }
  }
}

function drawCharacter(ctx, url, s, w, h, t) {
  const avatar = ready.get(url);
  if (!avatar || !three) {
    if (!webglAvailable) say(ctx, "3D isn't available here", w, h);
    else if (failed.has(url)) say(ctx, "Avatar couldn't load", w, h);
    else {
      loadAvatar(url).catch(() => {});
      say(ctx, "Loading avatar…", w, h);
    }
    return;
  }
  const { THREE, renderer, scene, camera } = three;
  const { vrm, scene: model, centre, frame, tracked } = avatar;
  if (shown !== model) {
    if (shown) scene.remove(shown);
    scene.add(model);
    shown = model;
  }

  const dt = lastT === null ? 0 : clamp((t - lastT) / 1000, 0, 0.1);
  lastT = t;

  if (tracked) {
    // Head turn, nod and tilt, shared between neck and head so it bends
    // naturally. The pose is already mirrored, so it moves like a reflection.
    const yaw = s.yaw * 1.3;
    const pitch = s.pitch * 1.4;
    const roll = -s.roll;
    const neck = vrm.humanoid.getNormalizedBoneNode("neck");
    const head = vrm.humanoid.getNormalizedBoneNode("head");
    const share = neck ? 0.6 : 1;
    head.rotation.set(pitch * share, yaw * share, roll * share);
    neck?.rotation.set(pitch * 0.4, yaw * 0.4, roll * 0.4);
  }
  const em = vrm?.expressionManager;
  if (em) {
    // VRM 1.0 names first, then the VRM 0.x presets three-vrm maps them from.
    if (em.getExpression("blinkLeft") && em.getExpression("blinkRight")) {
      express(em, ["blinkLeft"], s.blinkL * 1.2);
      express(em, ["blinkRight"], s.blinkR * 1.2);
    } else express(em, ["blink"], Math.max(s.blinkL, s.blinkR) * 1.2);
    express(em, ["aa", "a"], s.jaw * 1.6);
    express(em, ["happy", "joy"], s.smile * 1.2);
    express(em, ["surprised"], s.brows * 0.8);
  }
  vrm?.update(dt);

  // Follow the face around the frame and in and out.
  const viewW = frame * (w / h);
  model.position.x = (s.x - 0.5) * 0.5 * viewW;
  model.position.y = -(s.y - 0.45) * 0.4 * frame;
  if (!tracked) model.rotation.y = s.yaw * 0.6; // a plain model turns whole
  const distance = frame / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / clamp(s.scale, 0.7, 1.4);
  camera.position.set(0, centre, distance);
  camera.lookAt(0, centre, 0);

  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
}

// `model` is the URL of the avatar to draw: a built-in under /assets/models/
// or an upload under /avatar-files/.
// `backdrop`, if given, is a picture (a canvas or loaded image) drawn instead
// of a standard world: a room photo, filtered or AI-styled.
export function drawAvatarScene(ctx, { model, world, backdrop, camera, t, pose: tracked }) {
  const { width: w, height: h } = ctx.canvas;
  if (backdrop) ctx.drawImage(backdrop, 0, 0, w, h);
  else drawWorld(ctx, world, w, h, t, camera);
  drawCharacter(ctx, model, tracked?.found ? tracked : idle(t), w, h, t);
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
