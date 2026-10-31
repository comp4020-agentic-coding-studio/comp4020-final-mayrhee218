# Body tracking

Face tracking drives the avatar's head and expressions. Body tracking adds the
upper body: arms and a chest that leans and turns. It's a switch in the
studio, **off by default**, marked beta.

## What's built

1. **Same library.** MediaPipe Pose Landmarker comes from the same
   `@mediapipe/tasks-vision` bundle the face uses (`loadBodyTracker` in
   `src/public/avatar.js`). Its `pose_landmarker_lite` model, about 5 MB, is
   fetched only when the switch is first turned on, so face-only recording
   costs nothing extra.
2. **Upper body only.** A selfie camera rarely sees hips and legs, so the legs
   stay in the rest pose. Shoulders, elbows and wrists drive the VRM's
   `leftUpperArm`, `leftLowerArm`, their right-hand pairs, and the chest
   (`upperChest`, else `chest`, else `spine`). Hands and fingers aren't
   tracked.
3. **Solved, not copied.** `solveBody` in `src/public/body.js` turns MediaPipe's
   world landmarks into a unit direction for each arm segment, mirrored like
   the face. `poseArms` in `src/public/avatar.js` turns each bone so it points
   that way. Which way a bone points is read from the model's own skeleton
   (toward its child joint) rather than assumed, so VRM 0.x and 1.0 models
   both work. Every bone eases toward its target with `slerp`, as the face
   does with `lerp`. Depth from one webcam is noisy, so arms follow only half
   of it.
4. **Two trackers, alternate frames.** With body tracking on, face and pose
   take turns on each new camera frame. The studio counts frames drawn per
   second; below 20 for three seconds, body tracking switches itself off and
   says so, and face tracking carries on.
5. **Fallback.** A joint MediaPipe isn't confident about (visibility under
   0.5) or that's outside the picture leaves that part of the arm easing back
   to rest. No one in frame, or the switch off, eases both arms down and
   straightens the chest.
6. **Models without arms.** A model is posed only if it has a chest and all
   four arm bones. Otherwise, the studio says only the face moves it. A plain
   `.glb` has no humanoid bones at all.

## Acceptance checks

- Raising either arm raises the avatar's arm on the same side, as in a mirror.
  `spec/body.test.ts` checks this on made-up landmarks, and the three
  built-in avatars were rendered in that pose and checked by eye.
- Recording stays at 20 fps or above, or body tracking turns itself off and
  says so. **Not yet measured on a real phone.**
- Camera frames still never leave the device, and only the canvas is
  recorded. Landmarks stay in the browser too: nothing about the body is sent
  to the server.

## Not done yet

- **Testing with a real person in front of a real camera.** Every check so far
  used made-up landmarks or Chrome's fake camera, which shows no person.
- Hands and fingers (MediaPipe Hand Landmarker), and legs.
- Measuring the frame rate on mid-range phones before turning it on by
  default.
