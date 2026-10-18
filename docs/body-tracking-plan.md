# Follow-up: body tracking

Face tracking drives the avatar today: head turn, nod and tilt, blink, mouth,
and smile and brows where the model has them. This is the plan for the body.
Nothing here is built yet.

## Approach

1. **Same library.** MediaPipe Pose Landmarker comes from the same
   `@mediapipe/tasks-vision` bundle already loaded in `src/public/avatar.js`.
   Load its `pose_landmarker_lite` model only when body tracking is switched
   on, so face-only recording costs nothing extra.
2. **Upper body first.** A selfie camera rarely sees hips and legs. Map
   shoulders, elbows and wrists onto the VRM's `upperChest`, `leftUpperArm`,
   `leftLowerArm`, `leftHand` and their right-hand pairs. Leave the legs in
   the rest pose.
3. **Solve, don't copy.** Landmarks are positions, but bones need rotations.
   Use a small IK solver (Kalidokit's `Pose.solve`, or our own two-bone solve)
   on the world landmarks, then smooth the result with the same `lerp` the face
   uses.
4. **One frame, two models.** Run face and pose on alternate frames when the
   device is slow, and measure the frame rate before turning both on by
   default.
5. **Fallback.** Low landmark visibility means the arms ease back to the rest
   pose, the same way the face falls back to `idle()`.

## Acceptance checks

- Raising either arm raises the avatar's arm on the same side, as in a mirror.
- Recording stays at 30 fps on a mid-range phone, or body tracking turns itself
  off and says so.
- Camera frames still never leave the device, and only the canvas is recorded.
