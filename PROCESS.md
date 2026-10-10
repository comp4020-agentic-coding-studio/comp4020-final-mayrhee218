# Process

## Where This Started (Crit 8)

My idea has always been a short-form video platform for virtual humans: the
gap I noticed with PLAVE is that virtual artists can't easily share a casual
selfie moment the way real artists can.

In crit 8 I read Robin Sloan's writing on **"home-cooked apps"** and let it
pull me the other way. I described the project as **a shared kitchen** —
between a home-cooked app for a few people and a platform built for millions —
and deliberately left out feeds, likes, follower counts and discovery. That
position is in
[`bc7f2ad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/bc7f2ad),
the first definition of good in
[`03455ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/03455ac),
and the first proof of life — an emoji avatar, a text "trace", stored on the
Fly volume — in
[`6f3f655`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/6f3f655).

That scoping got something real deployed in a week. But a page of text notes
wasn't the product I actually want to make.

## Changing Direction: An Open Video Platform (Crit 9)

This week I went back to the original idea and redefined good in
[`662b986`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/662b986):

> a **social short-form video platform for virtual creators**, where anyone can
> easily record, share, and watch videos through their virtual avatars.

The PLAVE gap is about *videos reaching people*. A casual selfie only matters
if someone sees it, and a feed people can watch and react to is how short-form
video does that. So the feed, likes and comments I had left out are now part of
the core experience rather than something to avoid.

What I kept from crit 8 is the scale discipline: build the smallest version of
each piece that proves the experience, not the whole platform.

## How I Directed the Work

I started the week by giving the agent a long architecture prompt for the full
platform: Next.js, PostgreSQL, Redis queues, S3 and a CDN, FFmpeg transcoding,
GPU workers for 2D-to-3D, a monorepo with separate services.

The agent checked it against the course's fixed deploy setup in `fly.toml`
before building anything, and much of it doesn't fit: **one shared-CPU machine
with 256 MB of memory, and one 1 GB volume at `/data`** — no separate database
server, no object storage, no GPU. It also pointed out that the prompt
contradicted my crit 8 README.

The agent then misread my answer as dropping the TikTok direction. I corrected
it: I wanted the TikTok-like open video platform, scaled to fit. From there my
decisions were:

- **All three ways to make a video:** record as an avatar, record with the
  camera, or upload a file.
- **Likes, comments and a live "N here" count** as the social layer for now;
  follows and profiles wait until there are accounts.
- **Real-time first:** get the crit 9 contract deployed and green before
  anything else.

## What I Built, and Why This Way

Each part of the original prompt, mapped onto what this deploy can run:

| The prompt asked for | What I built | Why |
| --- | --- | --- |
| Facial tracking + avatar rendering | MediaPipe Face Landmarker **in the browser**, driving a 2D character drawn on a canvas (head turn/tilt, blinks, brows, mouth, smile) | No GPU server needed, low latency, and **camera frames never leave the device** |
| Recording pipeline | `canvas.captureStream()` + `MediaRecorder`, vertical 540×960, mic audio | Only the drawn avatar is recorded in avatar mode, not the face |
| Virtual environments | 4 drawn worlds, including an AR world with a blurred camera behind the avatar | A stand-in for uploaded or AI-generated 3D environments |
| S3 + presigned uploads | Uploads **streamed straight to `/data`**, never held in memory; 25 MB per clip, 850 MB in total | The machine has 256 MB, and the volume is the only storage |
| Malware/type validation | A file is accepted only if its first bytes are WebM, MP4 or QuickTime, whatever it claims to be | Uploaded files are untrusted |
| PostgreSQL | One JSON file on `/data`, with serialized writes | No database server is allowed in the course setup |
| TikTok-style feed | Full-screen swipe feed, autoplay for the clip on screen, the next one preloaded, a right-hand rail, a comments sheet | The experience the README promises |
| WebSocket for live updates | A `ws` WebSocket at `/live` on the same server | Real-time without WebRTC: nothing here is live media |

The server side is
[`67d13e5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/67d13e5)
and the UI and studio are
[`f98972b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/f98972b).

## Real-Time, Red to Green

Crit 9 requires that a change one person makes reaches every other open session
within about a second, with no reload. I held the agent to that with a test
in `spec/realtime.test.ts` that runs against the deployed app, written **before**
the code:

1. Red:
   [`867c2ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/867c2ac)
   — two clients; a trace left by one must reach the other within 1 s, and
   presence must update when someone arrives or leaves.
2. Green:
   [`56b56fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/56b56fa)
   (WebSocket server) and
   [`3e542f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/3e542f5)
   (live page).
3. When the project became a video platform, I changed the contract instead of
   keeping a test for a feature that no longer existed. Red again:
   [`2ce9411`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/2ce9411)
   — a posted video, a like and a comment must each reach other sessions within
   1 s, and a file that only *claims* to be a video must be refused.
4. Green again with the video platform commits above.

## Corrections Along the Way

- The tests were green, but the studio was broken in a real browser: a
  JavaScript ordering bug stopped the create page before it drew anything. The
  spec only checks the server, so it couldn't see this. A scripted Chrome
  walkthrough caught it — record an avatar clip, post it, watch it arrive in
  another tab — and it was fixed before the UI commit.
- The studio said "only the avatar is recorded", which isn't true in the AR
  world, where your blurred room is recorded too. The hint now changes with the
  world you pick.
- Test runs post clips, so the live app is only checked with tests that don't
  post anything; the posting tests run in CI against throwaway data, so the feed
  my pod sees isn't full of test videos.

## Known Limits

- **No accounts.** Names are self-chosen, likes are counted per device, and
  anyone with the link can post. There's no delete, report or moderation yet.
  That's acceptable for a crit, but not for an open platform.
- **The avatar is 2D and face-only.** There's no 3D model, VRM upload or body
  tracking yet, and webcam tracking is not professional motion capture.
- **No AI environments or 2D-to-3D conversion.** Those need GPU infrastructure
  this deploy doesn't have.
- **No transcoding.** Clips play in the format they were recorded in (WebM, or
  MP4 from Safari).
- **Face tracking has only been tested with a fake camera so far.** It needs
  testing on real phones and webcams.

## Next

- Decide and write down how presence should work when several people use the
  app at once, with the options I considered and what my choice costs.
- Crit 10, and toward A3: a 3D avatar, and the account and moderation basics an
  open platform needs.
