# Multi-user test report

- **Date:** 2026-10-19, 14:17–14:18 AEDT (03:17:34–03:17:44 UTC)
- **Build:** `e8da7f3`, deployed to https://comp4020-final-mayrhee218.fly.dev
- **Logs from:** `mise exec -- flyctl logs -a comp4020-final-mayrhee218`

## What was tested

Two people, each in their own browser with no shared cookies, act on the
same feed. This is the setup the crit 10 spec asks for. The server should tell
them apart, decide on its own who may change what, and log every step.

Two separate Chrome contexts ran the scenario, driven by a script so it can
be repeated exactly:

1. **Kai** opens the feed.
2. **Mia** opens the studio, picks the Hotdog avatar, records a 3-second clip
   and posts it.
3. Kai sees the clip arrive without reloading.
4. Kai likes it and comments on it.
5. Kai tries to delete Mia's clip by sending the request by hand, bypassing
   the page, which doesn't offer him the button.
6. Mia deletes her own clip, and it disappears from Kai's feed.
7. Both close the app.

## Results

| Check | Expected | Seen |
| --- | --- | --- |
| Two browsers are told apart | different handles | Kai `#5hv95jJFi3`, Mia `#BrVgoqJewH` |
| A post reaches the other person live | no reload | Kai's feed showed it; `[BCAST] video … → 2 sockets` |
| Like and comment reach everyone | broadcast | `[BCAST] likes … = 1`, `[BCAST] comment …` |
| Kai can't delete Mia's clip | refused on the server | `[REJECT] … 403 that video isn't yours to delete (mia…'s)` |
| Delete is offered only to its owner | Kai: no | Kai: no button |
| Mia can delete her own clip | done, and it reaches Kai | `[DONE] … deleted`, `[BCAST] video-removed … → 3 sockets` |
| Leaving updates presence | count drops | `[LEAVE] … (2 here)`, then `(1 here)` |
| No page errors | none | none |

The feed ended with only what was there before the test, because the clip
was deleted by its owner.

## Log of the session

Every line the server wrote during the test, unedited. Another visitor,
already in the app (the "1 here" when Kai arrived), shows in the counts.

```
2026-10-19T03:17:34Z [SNAPSHOT] → #5hv95jJFi3 feed page: 1 video
2026-10-19T03:17:34Z [JOIN]     #5hv95jJFi3 connected to /live (2 open)
2026-10-19T03:17:34Z [SNAPSHOT] → #5hv95jJFi3 welcome + presence: 1 here
2026-10-19T03:17:34Z [RECV]     #5hv95jJFi3 socket hello (r:d9b6)
2026-10-19T03:17:34Z [JOIN]     kai🐧#5hv95jJFi3 joined the room (2 here) (r:d9b6)
2026-10-19T03:17:34Z [BCAST]    presence: 2 here → 2 sockets (r:d9b6)
2026-10-19T03:17:43Z [RECV]     #BrVgoqJewH POST /videos (r:190b)
2026-10-19T03:17:43Z [DONE]     mia🦊#BrVgoqJewH posted video 6864287b "rehearsal: hotdog says hi" [avatar, 295 KB] (r:190b)
2026-10-19T03:17:43Z [BCAST]    video 6864287b → 2 sockets (r:190b)
2026-10-19T03:17:43Z [SNAPSHOT] → mia🦊#BrVgoqJewH feed page: 2 videos
2026-10-19T03:17:43Z [JOIN]     mia🦊#BrVgoqJewH connected to /live (3 open)
2026-10-19T03:17:43Z [SNAPSHOT] → mia🦊#BrVgoqJewH welcome + presence: 2 here
2026-10-19T03:17:43Z [RECV]     kai🐧#5hv95jJFi3 POST /videos/6864287b/like (r:aab8)
2026-10-19T03:17:43Z [RECV]     mia🦊#BrVgoqJewH socket hello (r:aa28)
2026-10-19T03:17:43Z [JOIN]     mia🦊#BrVgoqJewH joined the room (3 here) (r:aa28)
2026-10-19T03:17:43Z [BCAST]    presence: 3 here → 3 sockets (r:aa28)
2026-10-19T03:17:43Z [DONE]     kai🐧#5hv95jJFi3 liked video 6864287b (mia🦊#BrVgoqJewH's) → 1 like (r:aab8)
2026-10-19T03:17:43Z [BCAST]    likes 6864287b = 1 → 3 sockets (r:aab8)
2026-10-19T03:17:43Z [RECV]     kai🐧#5hv95jJFi3 POST /videos/6864287b/comments (r:b91f)
2026-10-19T03:17:43Z [DONE]     kai🐧#5hv95jJFi3 commented on video 6864287b (mia🦊#BrVgoqJewH's): "love the hotdog" (r:b91f)
2026-10-19T03:17:43Z [BCAST]    comment 6864287b → 3 sockets (r:b91f)
2026-10-19T03:17:44Z [RECV]     kai🐧#5hv95jJFi3 DELETE /videos/6864287b (r:cc89)
2026-10-19T03:17:44Z [REJECT]   kai🐧#5hv95jJFi3 DELETE /videos/6864287b: 403 that video isn't yours to delete (mia🦊#BrVgoqJewH's) (r:cc89)
2026-10-19T03:17:44Z [RECV]     mia🦊#BrVgoqJewH DELETE /videos/6864287b (r:a440)
2026-10-19T03:17:44Z [DONE]     mia🦊#BrVgoqJewH deleted video 6864287b "rehearsal: hotdog says hi" (r:a440)
2026-10-19T03:17:44Z [BCAST]    video-removed 6864287b → 3 sockets (r:a440)
2026-10-19T03:17:44Z [SNAPSHOT] → #3ukW3ZtHD_ feed page: 1 video
2026-10-19T03:17:44Z [LEAVE]    kai🐧#5hv95jJFi3 left the room (2 here) (r:3b9a)
2026-10-19T03:17:44Z [BCAST]    presence: 2 here → 2 sockets (r:3b9a)
2026-10-19T03:17:44Z [LEAVE]    mia🦊#BrVgoqJewH left the room (1 here) (r:9f8d)
2026-10-19T03:17:44Z [BCAST]    presence: 1 here → 1 socket (r:9f8d)
```

### Reading it

- The first word is the kind of event:
  - `JOIN` and `LEAVE`: the room
  - `RECV`: an action arrives
  - `DONE` or `REJECT`: what the server decided
  - `BCAST`: an update sent to every open page
  - `SNAPSHOT`: the state sent to one person
- `(r:cc89)` ties together the lines one request caused. Kai's forged delete
  is `r:cc89`: received, then rejected with a 403, and nothing broadcast,
  because nothing changed. Mia's real delete is `r:a440`: received, done, then
  broadcast to all 3 open pages.
- Mia shows up as `#BrVgoqJewH` on her post (r:190b) before she has a name on
  that line. The name is learned from the upload, then used on every later
  line.

## A finding

On the live run, the delete button wasn't yet visible to Mia the instant her
page loaded after posting. It appeared a moment later, and her delete
succeeded (r:a440). Three local runs showed it straight away. The button is
revealed when the page's live connection receives its `welcome` message,
which takes a moment longer from Sydney. It's a brief delay, not a missing
button. Since the button only reflects the server's rule, it was never a
security issue: Kai's `REJECT` shows the server deciding either way.

## Recording more sessions

```sh
scripts/record-logs.sh            # show live and save to docs/testing/logs/<date>.log
scripts/record-logs.sh REJECT     # only lines that match
```

It shows the logs as they happen and appends them to that day's file.
Ctrl+C stops it. The recordings stay on your machine, because
`docs/testing/logs/` is git-ignored: they hold the names real visitors chose,
and this repo is public. Copy into a report only the lines it needs, as above.

## The whole crit session, anonymised

`crit-10-session-2026-10-19.txt` is every event the server logged on
2026-10-19 while the recorder ran, including the crit itself: 349 lines from
19 browsers. It's anonymised by `scripts/anonymise-log.mjs`:

- each handle becomes **Person A, B, C…** in order of first appearance, and
  the name and emoji people chose are dropped
- anything people typed (comments, captions, names) becomes `"[text]"`

Events, times, request ids, counts, sizes and whose-thing-it-was are kept, so
it still shows who did what to whom, just not who they are. The raw recording
stays local and git-ignored. My own test above is Persons E (Kai) and F (Mia).
