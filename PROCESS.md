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

## Telling People Apart (Crit 10)

Crit 10 asks the app to tell people apart, to decide **on the server** what
each person may see and change, and to log who did what, so I can narrate a
crit from `flyctl logs` without touching the app.

### What was wrong before

Reading the code against that spec showed the server believed whatever a
request said about who sent it. The name and avatar came in the request body,
and a like was keyed by a `clientId` the page made up. Anyone could post under
anyone's name, and one browser could like a video as many times as it had ids
to send. Nothing could be deleted, so there was no "yours" to protect.

### The decision

The full record is `docs/decisions/0002-who-may-change-what.md`. In short:

- **A person is a browser.** On the first visit the server sets an
  `HttpOnly` cookie with a random 128-bit token. That cookie is the only proof
  of who you are. Everyone else sees a **handle**, a hash of the token, on what
  you post. Seeing someone's handle doesn't let you act as them.
- **Name and avatar are labels, not identity.** Two people can both be "mia";
  the handle tells them apart.
- **Only owners delete.** A video can be deleted only by its poster. A comment
  can be deleted by its writer or by the poster of the video it's under. A
  like counts once per person. Who liked a video stays private.

I chose an anonymous browser over accounts because my pod gets only the URL:
each Chrome profile becomes a separate person with no sign-up step, the way
TikTok lets you watch without an account.

### Red to green

I wrote `spec/permissions.test.ts` before changing the server and ran it
against the old one: all four tests failed because no identity cookie was
handed out. They check that two browsers get different handles, that a
stranger's delete is refused with `403`, that a comment's writer and the
video's poster can both delete it, and that a browser's like counts once
whatever id it claims. The identity, the rules and the tests landed together
in [`5faf5ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/5faf5ee). The red run happened locally, not as its own
commit.

The page hides delete buttons you can't use, but that's only manners: the
`403` comes from the server either way, which is what the tests check.

### Logging who did what

[`6171c3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/6171c3f) prints one line per action, led by the person's
name, avatar and handle, and naming whose video was touched:

```
kai🐧#cdc_xHODhY liked video 4dcd8d61 (mia🦊#QzgBhugnct's) → 1 like
kai🐧#cdc_xHODhY REFUSED delete video 4dcd8d61 (mia🦊#QzgBhugnct's)
mia🦊#QzgBhugnct deleted video 4dcd8d61 "first try"
```

Posts, likes, comments, deletes, refused deletes, failed uploads, arrivals
and departures are all logged. Only the public handle is printed, never the
cookie token, so the log is safe to put on screen at the crit. The logging
stays after the crit: it's what I'll read when the deployed app misbehaves.

### Corrections along the way

- **Likes and deletes carry no name**, so their log lines first showed a bare
  handle. The server now remembers the last name each handle used, so those
  lines read as a person.
- **A restart would have forgotten every name.** The name list is now seeded
  from the stored videos and comments at boot.
- **Test clients with no cookie logged as "nobody"**, which reads like a bug
  at a crit. They now show as `(no cookie)`. A real browser always has a
  cookie.
- **I broke my own rule about the live feed.** To check the deploy, the full
  spec ran against the live URL, and it posts test clips, captioned `spec-…`.
  The crit 9 section above says only tests that don't post should run against
  the live app. Those clips have to be cleared before my pod opens the feed.
- **The rehearsal caught what the spec couldn't.** I ran the crit's script in
  two isolated Chrome contexts, with separate cookies standing in for two
  profiles, against a local copy with throwaway data. Mia posted, Kai
  commented and liked, Kai forged a second like and a delete by hand, and Mia
  deleted her clip. The server side held: the forged like left the count at 1,
  the delete got a `403` and a `REFUSED` line, and the clip vanished from
  Kai's feed live. The page didn't hold. **Kai saw a delete button on Mia's
  clip**, because the CSS rule `.rail button { display: flex }` beat the
  `hidden` attribute. Every page also threw an error when the empty-feed
  placeholder, which has no delete button, got the same treatment. All the
  spec tests were green throughout, because they check the server over HTTP
  and never render a page. Both bugs are fixed and the rehearsal reruns clean.
  It's the crit 9 lesson again: green tests are not a working page. The fix is
  [`6412c49`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/6412c49).

## Known Limits

- **A person is a browser, not a human.** Clearing cookies or opening another
  profile makes you someone new, and you lose the power to delete what you
  posted before. Your phone and laptop are two people.
- **Old posts have no owner.** Videos and comments from before crit 10 can't
  be deleted by anyone.
- **No moderation.** You can delete your own things, but nobody can remove
  someone else's video. That needs accounts and an owner role.
- **The avatar is 2D and face-only.** There's no 3D model, VRM upload or body
  tracking yet, and webcam tracking is not professional motion capture.
- **No AI environments or 2D-to-3D conversion.** Those need GPU infrastructure
  this deploy doesn't have.
- **No transcoding.** Clips play in the format they were recorded in (WebM, or
  MP4 from Safari).
- **Face tracking has only been tested with a fake camera so far.** It needs
  testing on real phones and webcams.

## Next

- Toward A3: a sign-in (email link or passkey) so a person can keep their
  videos across devices, with the handle carrying over.
- An owner role that can remove anything, logged like every other action.
- A 3D avatar.
