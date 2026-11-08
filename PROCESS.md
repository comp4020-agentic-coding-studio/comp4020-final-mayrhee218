# Process

## Where the Project Is Now

The assignment was to make a good multi-user, real-time website. For my project, "good" means a short-form video app where people can post as virtual characters. I wanted it to feel simple like TikTok, but not become a large public social platform.

I was influenced by Robin Sloan's idea of ["home-cooked apps"](https://www.robinsloan.com/notes/home-cooked-app/): software made for a small group of people. In my app, people need the link to join. There is no public discovery or recommendation algorithm.

My direction changed between crit 8 and crit 9. For crit 8, I tried a smaller idea without a feed, only showing who was online and leaving text traces. After reading more about home-cooked apps, I felt this did not solve the problem I cared about. Virtual artists such as PLAVE do not have an easy way to share casual short videos. So I brought back a feed, likes and comments. I still tried to keep each part as small as possible.

## Tech Choices

At the beginning of crit 9, I asked the agent to plan the full system. Its first proposal used Next.js, Postgres, Redis, S3, FFmpeg and GPU workers for 2D-to-3D processing. This was too much for the course deployment: **one shared-CPU machine, 256 MB RAM, one 1 GB volume, no database server and no GPU**.

I had to change the plan to fit what I could actually deploy.

| What I needed | What I used | Reason |
| --- | --- | --- |
| Face and body tracking | MediaPipe in the browser, connected to a VRM avatar | There is no server GPU. Camera frames can stay on the user's device. |
| Video recording | `canvas.captureStream()` and `MediaRecorder` | Avatar mode records the rendered scene instead of sending camera frames to the server. |
| Video storage | Stream uploads to the Fly volume, with a 25 MB limit per clip | The server has very little memory, so it should not hold whole files in RAM. |
| File validation | Check the first bytes for WebM, MP4 or QuickTime | The file extension or declared MIME type alone is not reliable. |
| Data storage | One JSON file on the volume, with writes handled one at a time | The deployment does not provide a database server. |
| Live updates | `ws` WebSocket at `/live` | I only need updates for posts, reactions and presence, not live video streaming. |

I wrote down some decisions separately so they would not get lost: presence ([decision 0001](docs/decisions/0001-presence.md)), identity and deletion permissions ([0002](docs/decisions/0002-who-may-change-what.md)), custom avatars ([0003](docs/decisions/0003-your-own-3d-avatar.md)) and backgrounds ([0004](docs/decisions/0004-backgrounds-photo-ai-and-3d.md)). Later I chose a device-link code instead of email sign-in or passkeys for now, because the alternatives needed a paid service or a client library I could not test properly ([0005](docs/decisions/0005-linking-devices.md)).

## Working With the Coding Agent

I used the agent mainly to implement and test the code. My part was deciding what the project should do, checking its work and correcting things when the result did not match my intention.

One problem happened early. When I said the proposed architecture was too large, the agent understood that I wanted to remove the TikTok-style idea. That was not what I meant. I wanted the same basic experience with a much smaller implementation. After that, I tried to give clearer limits, such as the numbers in `fly.toml` and the rule that camera frames should not be sent to the server, instead of asking for a long list of features.

For crit 9 and crit 10, I also asked for failing tests before fixes. The real-time requirement was tested first in [`867c2ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/867c2ac), and permission tests were added around [`5faf5ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/5faf5ee). Running these against the broken version helped me understand what was actually failing.

But I learned that passing tests is not enough. Twice the tests passed while the browser still had a serious problem. In one case, JavaScript ran in the wrong order and the studio stopped before drawing anything. In another, `.rail button { display: flex }` overrode the `hidden` state and showed a delete button to someone who should not see it. The CSS issue was fixed in [`6412c49`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mayrhee218/commit/6412c49). I found these problems by checking with two browsers, not just by running `pnpm check`. Now I include this browser check before each crit.

## Things I Had to Correct

There were also mistakes that changed the project rules or tests, not only the app itself.

First, the studio originally said that only the avatar was recorded. This was not always true: with the AR background, the blurred camera view is also part of the recording. I changed the message so it depends on which world the user chooses. This also reminded me why the privacy wording rule in `CLAUDE.md` matters.

Second, my crit 9 instructions said not to run tests that create posts against the live app. The full suite was still run on the deployed site, and test videos appeared in the real feed before a crit. I now check that rule before deployment rehearsals.

I also implemented and tested an owner role. Handles listed in `OWNER_HANDLES` can delete any post, and those actions are logged with `[OWNER]`. I did **not** enable this on the live deployment. As explained in decision 0005, the app currently identifies people by browser, so there is no configured owner on the live site.

## Limitations and What I Would Do Next

The biggest limitation is identity. At the moment, one browser counts as one person. If someone clears their cookies, the app treats them as new. The device-link code can connect two browsers, but it cannot restore an identity after it is lost. Moderation is also limited: users can delete their own posts, but there is no wider moderation system.

Tracking is basic webcam-level face and upper-body tracking, not professional motion capture. Body tracking is a beta feature based on `docs/body-tracking-plan.md`. Also, a room photo stays a flat 2D background even after it is restyled. I do not describe it as a 3D space.

I manually checked three things that automated tests could not fully prove: real-time updates between two separate browsers, data still being there after a server restart, and face/body tracking on a real device. The first two were checked on the deployed app, rather than only with the simulated clients in `spec/realtime.test.ts`. Tracking was checked with a real camera, not Chrome's fake camera or the sample landmarks in `spec/body.test.ts`. These checks worked on the setup I tested.

If I continue the project, I want to add passkeys as another way to recover an identity, alongside the link code. I also need to measure body-tracking frame rates on more devices, because so far I have only tested that part on one device.
