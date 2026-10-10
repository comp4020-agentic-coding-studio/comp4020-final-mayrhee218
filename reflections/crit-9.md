# Crit 9 — All at once

**What was the breakthrough that moved the work forward?**

The breakthrough was realising that most of the "big platform" in my original
prompt didn't need a big server. I began the week with an architecture written
for Postgres, Redis, S3, FFmpeg workers and GPUs, and the course deploy is one
256 MB machine with a 1 GB volume. Instead of cutting the TikTok idea to fit, I
moved each piece somewhere it could run. Face tracking runs in the browser
with MediaPipe, so it needs no GPU. That also means camera frames never leave
the phone, which turned out to be a privacy argument as well as a cost
argument. Recording happens on the canvas, so only the avatar is filmed.
Uploads stream straight to disk and are checked by their first bytes. The
WebSocket for real-time sits on the same server. Once every piece had a place
to run, the open video platform became buildable this week rather than "in
Phase 4".

**What did this work change about who I want to be as a software developer?**

I want to be the one who sets the direction, even when the agent pushes back.
This week the agent pointed out real constraints, and it was right about them.
But it also read my answer as dropping the TikTok idea, which I hadn't, and I
had to correct it. Taking its pushback seriously while keeping my own product
decision turned out to be two different skills. I also learned that green tests
aren't the same as working software: every spec check passed, but the create
page was broken in a real browser until a walkthrough caught it. I want to keep
checking what the user actually sees, not only what the server returns.
