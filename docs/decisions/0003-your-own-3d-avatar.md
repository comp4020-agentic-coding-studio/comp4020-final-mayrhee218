# 3. Your own 3D avatar: VRM uploads, checked on the server, kept private

- **Status:** accepted
- **Date:** 2026-10-18

## Context

The README promises that people can use "a virtual avatar that they have
already uploaded", or pick one the platform provides. Until now the studio
drew a 2D character on a canvas, then offered three built-in VRM models. This
adds uploading your own.

A 3D model is untrusted input like a video, and heavier: it's parsed by the
browser's WebGL stack, it can reference files elsewhere, and it can be big
enough to stall a phone.

## Decision

- **Formats.** `.vrm` (VRM 0.x and 1.0) is the format: it's what avatar tools
  export, and it names the head bone and face expressions face tracking needs.
  A plain `.glb` is accepted **for preview only**; the studio says it can't
  follow your face, and the server records `faceTracking: false`.
- **Checked on the server before it's kept** (`inspectGlb` in `src/models.js`):
  - starts with the `glTF` magic and says version 2, and its stated length is
    the real length
  - its JSON chunk parses and says glTF 2.0
  - **no `uri` on any buffer or image**: everything is inside the file, so a
    model can't fetch a tracking pixel or break when a host disappears
  - no required extension outside a small known list
  - at most 2,000 nodes, 300 meshes, 64 textures and similar limits, and
    15 MB in total
- **Stored on the Fly volume** at `/data/models`, with metadata in
  `/data/models.json`, counted in the same 850 MB budget as clips. At most five
  per person.
- **Owned by the browser that uploaded it**, by the handle from crit 10
  (`docs/decisions/0002-who-may-change-what.md`). Only the owner can list it
  (`GET /avatars`), fetch it (`GET /avatar-files/:id`) or delete it. Anyone
  else gets `404` on the file, so ids can't be probed for, and `403` on a
  delete.
- **Separate from the emoji.** A clip records the 3D model it was made with as
  `avatarModelId`, beside the emoji `avatar` that identifies the poster in the
  feed. The server keeps `avatarModelId` only if it's a built-in or one of the
  poster's own models. Older clips simply don't have one.

## Why private

The clip is what's shared, not the model. A model is often someone's own
character, sometimes paid for, and publishing the file would let anyone take
it. Keeping it private costs nothing today, because nothing in the feed needs
to load anyone else's model.

## What it costs

- **A person is still a browser.** Clear cookies and your uploaded avatars are
  gone for you. They stay on the volume, unreachable, until someone deletes
  them by hand.
- **The checks are structural.** They don't decode textures or geometry, so a
  file under every limit could still be slow to draw. The browser is the last
  line: a model that fails to load says so and the studio keeps working.
- **No sharing or remixing** of avatars between people.
- **15 MB** is generous for a phone on mobile data.

## Where it lives

- Server: `src/models.js`; routes in `src/server.js`
- Studio: the picker, upload and delete in `src/public/create.js`; loading and
  driving the model in `src/public/avatar.js`; built-ins listed in
  `src/public/models/manifest.json`
- Contract: `spec/avatars.test.ts`
