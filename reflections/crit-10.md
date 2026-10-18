# Crit 10 — Fly by instruments

**What was the breakthrough that moved the work forward?**

The breakthrough was seeing that my app already had an identity problem before
crit 10 asked about one. Reading the server against the spec showed it trusted
whatever a request said about who sent it: names came in the body, and likes
were keyed by an id the page made up. One browser could like a video as many
times as it liked. Once I saw identity as something the server hands out, not
something the page claims, the rest followed. A random token in a cookie that
scripts can't touch makes each browser a person, and a public handle derived
from it tells people apart without letting anyone act as someone else. The logs
became a running account I can narrate from:
`kai#S1_… REFUSED delete video 6c8c… (mia#Qx7…'s)`. Rehearsing with two
separate browsers proved the server held, and showed the page didn't: Kai saw
a delete button on Mia's clip, a CSS bug no server test could see.

**What did this work change about who I want to be as a software developer?**

I want to treat what I can't see as part of the product. Last week I learned
that green tests aren't the same as a working page. This week the lesson was
that a working page isn't the same as a trustworthy one: everything looked
right in the browser while the server would have believed anyone. I also
caught myself breaking my own rule, running tests that post clips against the
live feed, and it was the logs that showed me. I want to build so that the
system can tell me what happened, rather than relying on me to remember.
[TODO: rewrite this in your own words. It should say what *you* noticed.]
