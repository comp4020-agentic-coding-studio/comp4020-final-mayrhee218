# 4. Backgrounds: a room photo is 2D, AI is optional, worlds are 3D

- **Status:** accepted
- **Date:** 2026-10-18

## Context

The README describes recording in your own room transformed to match your
avatar's style, and uploading your own 3D environments. These sound like one
feature but aren't. A restyled photo is a flat picture behind the avatar; a
3D environment is geometry the avatar stands inside. Calling a styled photo
"3D", or an on-device colour filter "AI", would promise something that isn't
there.

The deploy is one 256 MB machine with no GPU, so no image model can run on it.

## Decision

Backgrounds are three separate things, grouped as such in the World picker:

| Kind | What it is | Where it's made | Leaves the device? |
| --- | --- | --- | --- |
| **Standard** | Drawn 2D backdrops: Dusk room, Neon street, Cloud sky | The browser | No |
| **Room photo (2D)** | A still photo of your room, restyled, drawn flat behind the avatar | On-device filter, or optional AI | Only with consent, for AI |
| **3D worlds** | An uploaded `.glb` scene, rendered as real geometry around the avatar | The browser (three.js) | The file is stored, private to you |

**Room photo.** You take a photo after a 5-second countdown, so you can step
out of frame, or pick a picture. Face tracking warns if it still sees a face;
"no face found" is not a promise that nobody is there. The default style is an
**on-device filter** labelled "not AI": a colour grade, flat colour bands and
ink edges in one of three presets (Mochi, Neon, Sunny). Each built-in avatar
suggests one.

**AI restyling** happens only if the server has a provider configured
(`ROOM_AI_PROVIDER`). It's provider-agnostic (`src/rooms.js`):

- It runs as a **background job**: the studio posts the photo and polls. The
  server only relays to the provider and stores the result.
- It needs **explicit consent** per photo. The consent text names the
  provider and its cost.
- **The API key stays in a server env var** and never reaches the browser.
- **The original photo is deleted** when the job ends. The result is private
  to the browser that asked. Limits: 10 a day, 6 kept.
- **The style prompt is chosen on the server** from the three presets, so the
  endpoint can't be used as a general image generator.
- **With no provider, the option doesn't appear** and the server answers
  `503`. Nothing pretends.

**3D worlds** reuse the avatar upload checks (`0003`) with world-sized limits
(20 MB, 5,000 nodes) and the same ownership rule. A VRM uploaded as a world is
refused. The world is scaled to about eight avatar-heights across, with its
floor at the avatar's feet, and the camera steps back and looks slightly
down for a portrait frame.

**Live camera.** The old "My room (AR)" world recorded your real camera,
blurred, and claimed your face stayed on the device. It's now "Live camera
(shows you)", and it says you and your room can be recognised in the clip.

## What it costs

- **The on-device filter recolours; it doesn't redraw.** A restyled photo
  looks like your room with a grade, not like a game background. That needs
  AI, which costs money and sends the photo away.
- **The Stability adapter is untested.** It was written from the published API
  and never called, because each call is paid. Its first real call is a test.
- **A restart fails any job mid-flight** (it says so). The queue is in memory,
  not a durable job system.
- **A room photo is flat.** The avatar doesn't cast shadows or stand behind
  furniture in it.
- **Worlds are placed by a rule, not by hand.** An odd-shaped scene, such as a
  tall tower or a wide landscape, may frame badly. There's no camera control
  yet.
- **Large worlds are slow on phones** even within the limits.

## Where it lives

- Room photo and filter: `src/public/room.js`
- AI jobs and providers: `src/rooms.js`, with routes in `src/server.js`
- Worlds: the `worlds` collection in `src/models.js`, and `loadWorld` and
  `placeWorld` in `src/public/avatar.js`
- Studio wiring: `src/public/create.js`
- Contract: `spec/rooms.test.ts` and the world test in `spec/avatars.test.ts`
- Setup: `docs/room-ai-setup.md`
