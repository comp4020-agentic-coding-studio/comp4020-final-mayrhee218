// Upper-body pose from MediaPipe Pose landmarks, as the directions the
// avatar's arms should point and how its chest leans. Plain math, no browser
// or three.js, so spec/body.test.ts can check it without a camera.
//
// Landmarks come from the raw camera image, unmirrored. They're mirrored here,
// like the face in avatar.js, so the avatar moves like a reflection: raise
// your right arm and the arm on the same side of the screen goes up, which is
// the avatar's left.

// MediaPipe Pose indices, named for the person's own left and right.
const PERSON_LEFT = { shoulder: 11, elbow: 13, wrist: 15 };
const PERSON_RIGHT = { shoulder: 12, elbow: 14, wrist: 16 };

// Below this, MediaPipe is guessing where a joint is: it's out of frame or
// hidden. A guessed arm stays at rest rather than flailing.
export const MIN_VISIBILITY = 0.5;
// Depth from one webcam is the noisiest axis; follow only part of it.
const DEPTH = 0.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// World landmarks are metres around the hips: x to the image's right, y down,
// z smaller toward the camera. The scene has y up and the camera at +z, and
// x is flipped to mirror.
const toScene = (p) => ({ x: -p.x, y: -p.y, z: -p.z * DEPTH });

function direction(a, b) {
  const v = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const n = Math.hypot(v.x, v.y, v.z);
  return n > 1e-6 ? { x: v.x / n, y: v.y / n, z: v.z / n } : null;
}

// Seen means confidently placed and inside the picture. `image` landmarks are
// 0–1 across the frame; a wrist below the bottom edge is a guess.
function seen(image, world, i) {
  const p = image?.[i] ?? world[i];
  if ((p?.visibility ?? 1) < MIN_VISIBILITY) return false;
  if (image?.[i] && (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05)) return false;
  return true;
}

// Returns null if there are no landmarks at all. Otherwise { found, left,
// right, roll, twist }:
// - left / right: the AVATAR's arms, each { upper, lower }, unit directions in
//   scene space (y up, toward the camera +z), or null where that part wasn't
//   seen and should rest
// - roll: the chest tilting, positive when the shoulder on the screen's right
//   is higher; twist: turning, positive when that shoulder comes forward
export function solveBody(world, image = null) {
  if (!world || world.length < 17) return null;
  const at = (i) => toScene(world[i]);
  const ok = (i) => seen(image, world, i);

  const arm = (side) => {
    const upper = ok(side.shoulder) && ok(side.elbow) ? direction(at(side.shoulder), at(side.elbow)) : null;
    const lower = upper && ok(side.wrist) ? direction(at(side.elbow), at(side.wrist)) : null;
    return { upper, lower };
  };

  let roll = 0;
  let twist = 0;
  const shoulders = ok(PERSON_LEFT.shoulder) && ok(PERSON_RIGHT.shoulder);
  if (shoulders) {
    // From the shoulder on the screen's left to the one on its right.
    const v = direction(at(PERSON_LEFT.shoulder), at(PERSON_RIGHT.shoulder));
    if (v) {
      roll = clamp(Math.atan2(v.y, v.x), -0.35, 0.35);
      twist = clamp(Math.atan2(v.z, v.x), -0.5, 0.5);
    }
  }

  // Mirrored: the person's right arm is on the screen's right, the avatar's left.
  const left = arm(PERSON_RIGHT);
  const right = arm(PERSON_LEFT);
  const found = shoulders || Boolean(left.upper || right.upper);
  return { found, left, right, roll, twist };
}
