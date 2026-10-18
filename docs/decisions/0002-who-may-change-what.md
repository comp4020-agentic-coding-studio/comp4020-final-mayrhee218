# 2. Who may change what: a person is a browser, and only owners delete

- **Status:** proposed (crit 10)
- **Date:** 2026-10-18

## Context

Crit 10 asks the app to tell people apart and to decide, **on the server**,
what each person may see and change. My pod will open the app from its URL
alone, in separate Chrome profiles, with nothing to sign up for.

Until now the server believed whatever a request said about who sent it: the
name and avatar came in the body, and a like was keyed by a `clientId` the page
made up. Anyone could post as anyone, and could like a video as many times as
they had ids to send.

## What counts as a person

**One browser.** On its first visit the server sets a cookie, `who`, holding a
random 128-bit token. It is `HttpOnly`, so page scripts can't read it, and it
lasts a year. The server never trusts anything else to say who you are.

Everyone else sees your **handle**, the first 10 characters of a SHA-256 hash of
that token, on what you post (`by`). The handle tells people apart, and it
can't be turned back into the token, so seeing someone's handle doesn't let you
act as them.

The name and emoji avatar stay what they were: what you choose to be called.
They are labels, not identity, so two people can both be "mia".

## The rules

| Action | Who may | Checked in |
| --- | --- | --- |
| Watch the feed, see videos, comments, like counts, presence | anyone with the URL | — |
| Post a video, comment, like | anyone (each browser gets a person on first visit) | `src/server.js` |
| Like a video | once per person; a second like from the same browser does nothing | `setLike` in `src/store.js` |
| Delete a video | only the person who posted it | `removeVideo` in `src/store.js` |
| Delete a comment | the person who wrote it, **or** the poster of the video it's on | `removeComment` in `src/store.js` |
| See who liked a video | no one; only the count leaves the server | `toPublic` in `src/store.js` |

Anything not in the table, including editing a video or comment, isn't
offered at all. The page hides delete buttons you can't use, but that's only
manners: the `403` comes from the server either way.

## Why

- **Nothing to get past at the crit.** The pod gets only the URL. A cookie on
  the first visit makes each Chrome profile a separate person with no sign-up
  step, which TikTok also lets you do when you're only watching.
- **Ownership is what a creator platform needs.** You should be able to take
  down your own clip, and nobody else's.
- **A poster can clean up their own comments.** The video is theirs, so they
  can remove what's said under it. This mirrors how creator platforms let you
  moderate your own comment section.
- **Likes mean people.** A count anyone can inflate means nothing.

## What it costs

- **A person is a browser, not a human.** Clear your cookies, or open another
  profile, and you're someone new: you lose the power to delete what you
  posted before. One human can still be many people.
- **No moving between devices.** Your phone and laptop are two people.
- **Names can still be faked.** Anyone can call themselves "mia". The handle
  tells the two apart, but only if you look.
- **Videos and comments from before this change have no owner**, so no one can
  delete them.
- **No admin.** Nobody can remove someone else's bad video. That needs a real
  account and a role, which would be the next decision.

## What would change my mind

- If people need to keep their videos across devices, a sign-in (email link or
  passkey) would replace the cookie as the proof of who you are, and the
  handle would carry over.
- If something abusive gets posted, I'd add an owner role that can delete
  anything, and log who used it.

## Where it lives

- Identity: `src/identity.js` (cookie, handle), `app.use(identify)` in
  `src/server.js`, and the handle sent in the `welcome` message by
  `src/live.js`.
- Rules: `removeVideo`, `removeComment` and `setLike` in `src/store.js`; the
  `DELETE` routes in `src/server.js`.
- Contract: `spec/permissions.test.ts`. Two browsers get different handles, a
  stranger's delete is refused, and a browser's like counts once.
