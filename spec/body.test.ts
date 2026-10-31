import { expect, inject, it } from "vitest";

// Body tracking (docs/body-tracking-plan.md): MediaPipe Pose landmarks become
// the avatar's arm directions in src/public/body.js. No camera in a test, so
// these feed it made-up poses. The module is fetched from the running app,
// like every other check here, so it's the file browsers actually get.
const baseUrl = inject("baseUrl");

type Dir = { x: number; y: number; z: number };
type Arm = { upper: Dir | null; lower: Dir | null };
type Body = { found: boolean; left: Arm; right: Arm; roll: number; twist: number };
type Landmark = { x: number; y: number; z: number; visibility?: number };

async function load(): Promise<{ solveBody: (world: Landmark[], image?: Landmark[] | null) => Body | null }> {
  const res = await fetch(new URL("/assets/body.js", baseUrl));
  expect(res.status).toBe(200);
  const source = await res.text();
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

// A person facing the camera, arms hanging, in MediaPipe's world space:
// metres around the hips, x to the image's right, y down. The person's own
// left shoulder (11) is on the image's right, since they face the camera.
function standing(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.1 }));
  const set = (i: number, x: number, y: number, z = 0) => (lm[i] = { x, y, z, visibility: 0.99 });
  set(11, 0.18, -0.45); // person's left shoulder
  set(12, -0.18, -0.45); // person's right shoulder
  set(13, 0.2, -0.17); // elbows below the shoulders
  set(14, -0.2, -0.17);
  set(15, 0.21, 0.08); // wrists below the elbows
  set(16, -0.21, 0.08);
  return lm;
}

// The same pose as image landmarks, all comfortably inside the frame.
const inFrame = (world: Landmark[]) => world.map((p) => ({ ...p, x: 0.5 + p.x, y: 0.5 + p.y }));

it("is served to the browser", async () => {
  const res = await fetch(new URL("/assets/body.js", baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
});

it("arms hanging at your sides point the avatar's arms down", async () => {
  const { solveBody } = await load();
  const body = solveBody(standing())!;
  expect(body.found).toBe(true);
  for (const arm of [body.left, body.right]) {
    expect(arm.upper!.y).toBeLessThan(-0.9);
    expect(arm.lower!.y).toBeLessThan(-0.9);
  }
  expect(Math.abs(body.roll)).toBeLessThan(0.01);
});

it("raising your right arm raises the arm on the same side of the screen, as in a mirror", async () => {
  const { solveBody } = await load();
  const lm = standing();
  // Person's right arm (12 → 14 → 16) straight up: on the image's left.
  lm[14] = { x: -0.2, y: -0.73, z: 0, visibility: 0.99 };
  lm[16] = { x: -0.21, y: -0.98, z: 0, visibility: 0.99 };
  const body = solveBody(lm)!;
  // Mirrored, that's the screen's right, which is the avatar's left arm.
  expect(body.left.upper!.y).toBeGreaterThan(0.9);
  expect(body.left.lower!.y).toBeGreaterThan(0.9);
  expect(body.right.upper!.y).toBeLessThan(-0.9);
});

it("reaching out to the side points the avatar's arm out to the same side of the screen", async () => {
  const { solveBody } = await load();
  const lm = standing();
  // Person's right arm out toward the image's left edge.
  lm[14] = { x: -0.46, y: -0.45, z: 0, visibility: 0.99 };
  lm[16] = { x: -0.72, y: -0.45, z: 0, visibility: 0.99 };
  const body = solveBody(lm)!;
  // The image's left, mirrored, is the screen's right: +x in the scene.
  expect(body.left.upper!.x).toBeGreaterThan(0.9);
  expect(body.left.lower!.x).toBeGreaterThan(0.9);
});

it("a joint the camera can't see leaves that part of the arm at rest", async () => {
  const { solveBody } = await load();
  const lm = standing();
  lm[16] = { ...lm[16], visibility: 0.2 }; // right wrist hidden
  lm[13] = { ...lm[13], visibility: 0.2 }; // left elbow hidden
  const body = solveBody(lm)!;
  expect(body.left.upper).not.toBeNull();
  expect(body.left.lower).toBeNull();
  expect(body.right.upper).toBeNull();
  expect(body.right.lower).toBeNull();
});

it("a wrist below the bottom of the picture is a guess, and is ignored", async () => {
  const { solveBody } = await load();
  const world = standing();
  const image = inFrame(world);
  image[16] = { ...image[16], y: 1.3 }; // person's right wrist, out of frame
  const body = solveBody(world, image)!;
  expect(body.left.upper).not.toBeNull();
  expect(body.left.lower).toBeNull();
  expect(body.right.lower).not.toBeNull();
});

it("leaning sideways tilts the chest the same way on screen", async () => {
  const { solveBody } = await load();
  const lm = standing();
  // The person's right shoulder (image left) drops: in the mirror, the
  // screen's right shoulder is lower, so roll is negative.
  lm[12] = { ...lm[12], y: -0.35 };
  expect(solveBody(lm)!.roll).toBeLessThan(-0.1);
});

it("no person in frame means no body, and the avatar keeps its rest pose", async () => {
  const { solveBody } = await load();
  expect(solveBody([])).toBeNull();
  const hidden = standing().map((p) => ({ ...p, visibility: 0.1 }));
  expect(solveBody(hidden)!.found).toBe(false);
});
