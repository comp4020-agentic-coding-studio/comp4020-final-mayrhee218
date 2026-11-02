# Process

## Where This Stands

The brief asked for a multi-user, real-time website that's good; `README.md`
defines good here as a **social short-form video platform for virtual
creators**, as easy to use as TikTok but built at Robin Sloan's
["home-cooked"](https://www.robinsloan.com/notes/home-cooked-app/) scale:
people who have the link, not public discovery. That definition has stood
since crit 9. Crit 8 tried a smaller, feed-less version first — presence and
text traces only — and I rewrote it once a week of home-cooked reading
convinced me the gap I actually care about (virtual artists like PLAVE can't
easily share a casual video) needs a feed, likes and comments to matter at
all. The scale discipline from crit 8 stayed: build the smallest version of
each piece that proves the experience, not the whole platform.

## The Stack, and Why

I started crit 9 with an architecture prompt for the full idea: Next.js,
Postgres, Redis, S3, FFmpeg, GPU workers for 2D-to-3D. None of it fits the
course deploy — **one shared-CPU machine, 256 MB of memory, one 1 GB volume,
no database server, no GPU** — so each piece had to move somewhere it could
actually run:

| Needed | Built as | Why this, not the original plan |
| --- | --- | --- |
| Facial + body tracking | MediaPipe, **in the browser**, driving a VRM avatar | No GPU server; camera frames never leave the device, which is a privacy property as much as a cost one |
| Recording | `canvas.captureStream()` + `MediaRecorder` | Only the rendered avatar is captured, not the camera |
| Video storage | Streamed straight to the Fly volume, 25 MB/clip cap | The machine has 256 MB; nothing paid, nothing in memory |
| Upload validation | First-bytes check against WebM/MP4/QuickTime | Uploaded files are untrusted regardless of their claimed type |
| Database | One JSON file on the volume, serialized writes | No separate database server is allowed in the course setup |
| Real-time | A `ws` WebSocket at `/live` on the same server | No WebRTC needed — nothing here is live media |

Three further decisions shape the rest of the app, recorded as ADRs rather
than restated here: how presence is shown
([`docs/decisions/0001`](docs/decisions/0001-presence.md)), how a person is
told apart from another and who may delete what
([`docs/decisions/0002`](docs/decisions/0002-who-may-change-what.md)), and how
uploaded avatars and backgrounds stay 2D or 3D only where that's actually true
([`docs/decisions/0003`](docs/decisions/0003-your-own-3d-avatar.md),
[`0004`](docs/decisions/0004-backgrounds-photo-ai-and-3d.md)). A later decision
replaced sign-in with a device-link code instead of email or passkeys, because
both need a paid service or an untestable client library
([`0005`](docs/decisions/0005-linking-devices.md)).

## How I Directed the Agent

My role was setting direction and catching what the agent's own reports
missed, not writing the code. Three patterns repeated:

**Constraints over feature lists.** When the agent misread my push-back on the
original architecture as dropping the TikTok idea entirely, I corrected it:
scale the idea to fit, don't abandon it. From then on I gave constraints
(fly.toml's limits, "camera frames never leave the device") rather than a
feature list, and let the agent propose how to meet them.

**Red before green, against the real contract.** Crit 9's real-time
requirement and crit 10's permission requirement were each written as a
failing spec test first —
[`867c2ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/867c2ac)
and the permissions tests behind
[`5faf5ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/5faf5ee)
— run against the broken server before any fix landed, so I could see the
failure mode I was asking the agent to close, not just trust that it would.

**Green tests are not a working page.** Twice, the full spec suite passed
while the real browser was broken or unsafe: a JavaScript ordering bug froze
the studio before anything drew, and a CSS rule (`.rail button { display:
flex }`) showed a delete button to someone who had no right to use it, because
`hidden` lost to a more specific selector. Neither is visible to a server-only
test. Both were caught by a scripted two-browser rehearsal, not by `pnpm
check`, and the fixes
([`6412c49`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/6412c49)
for the CSS bug) are now something I check by hand before every crit, not
just something the suite reports green.

## Corrections That Landed in the Harness

Two mistakes changed `CLAUDE.md` or the test suite, not just the code:

- The studio told users "only the avatar is recorded", which was false in the
  AR background, where the blurred camera is recorded too. The copy now
  changes with the chosen world, and `CLAUDE.md`'s rule against overclaiming
  privacy is what caught it on review.
- My own crit 9 rule said only non-posting tests should run against the live
  app; the full suite was run against it anyway and left test clips in the
  real feed before a crit. That's now a rule I check before every deploy
  rehearsal, not just a one-off fix.

An owner role (handles in `OWNER_HANDLES` can delete anything, logged as
`[OWNER]`) was built and tested but deliberately left switched off on the live
deploy — decision 0005 keeps "a person is a browser" as the only identity
model for now, so nobody is an owner unless I configure one locally.

## Known Limits and Next

A person is a browser, not a human: clearing cookies makes you someone new,
and a link code joins two browsers but can't recover a lost identity. There's
no moderation beyond deleting your own posts. Tracking is face- and
upper-body-only, webcam-grade, not professional motion capture — body
tracking follows `docs/body-tracking-plan.md` and ships behind a beta switch.
A room photo stays a flat 2D background; it is never called 3D. Next: finish
testing face and body tracking on real phones (so far only a fake camera), and
look at a passkey as a second way to recover an identity alongside the link
code.
