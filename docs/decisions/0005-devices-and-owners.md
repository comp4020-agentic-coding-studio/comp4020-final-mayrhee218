# 5. Devices and owners: link a browser with a code, and an owner role for removals

- **Status:** proposed
- **Date:** 2026-10-31

## Context

Decision 0002 made a person one browser, and listed what would change my mind:

- if people need to keep their videos across devices, a sign-in would replace
  the cookie as proof of who you are, with the handle carrying over
- if something abusive is posted, an owner role that can delete anything, with
  every use logged

Both costs are real now. A creator records on a phone and checks comments on
a laptop, and those are two people who can't delete each other's posts. And
nobody can take down a video that shouldn't be there, including the
ownerless ones from before crit 10.

## Options considered for devices

1. **Email magic link.** Familiar, but needs an email provider, an API key as
   a Fly secret, and possibly cost. CLAUDE.md says a paid service needs
   approval, and the pod at a crit would need real email addresses.
2. **Passkey (WebAuthn).** The strongest, but adds a library on both sides,
   and a passkey made on one device doesn't by itself reach another without a
   platform's sync. Hard to test from `spec/`, which runs over plain HTTP.
3. **A device link code.** My choice. The browser you already use shows a
   short one-time code; typing it on the other device makes it the same
   person.

## Decision

### Linking a device

- `POST /link` gives this browser a code like `K7QM-3XRP`: eight characters
  from a 31-letter alphabet without look-alikes (no 0/O, 1/I/L), so about
  8.5 × 10¹¹ possibilities.
- It **lasts ten minutes and works once**. Asking again replaces the old code.
  Codes live in memory only, so a restart forgets them and you ask again.
- `POST /link/claim` with the code, **as JSON only**, sets this browser's
  cookie to the same token as the first browser. Same token, same handle,
  same person. JSON only means a form on another site can't post a code and
  swap a visitor into someone else's identity.
- Neither the token nor the code is ever logged or broadcast. The log says
  `linked another device (it was #…)`, naming the old handle.
- The page is `/link`, reached from the About page.

### The owner role

- `OWNER_HANDLES`, a comma-separated list of handles, set as an environment
  variable (`fly secrets set OWNER_HANDLES=…`). `fly.toml` doesn't change.
  A handle is public, but only the browser holding its token can act as it.
- An owner can delete **any video or comment**, ownerless ones included. This
  is checked in `removeVideo` and `removeComment` in `src/store.js`, like
  every other rule.
- Every use is logged as its own kind, `[OWNER]`, naming whose thing it was,
  so `flyctl logs | grep OWNER` lists every removal. Deleting your own things
  is still `[DONE]`.
- Other people's feeds say the video was removed **by the app's owner**, not
  by its poster.
- The owner can't do anything else: they can't post as someone, see who liked
  what, or read anyone's private avatars, worlds or rooms.

## What it costs

- **A code is a key to you while it lives.** Whoever types it within ten
  minutes becomes you, so the page says to show it only to yourself.
- **Linking is one-way and replaces who the new browser was.** Anything that
  browser posted before stays up but can no longer be deleted from it.
- **Still no recovery.** Lose every linked browser and you lose your identity.
  Only an email or a passkey would fix that.
- **Unlinking isn't possible.** A linked browser stays you until its cookie is
  cleared. There's no "sign out other devices", since that would need rotating
  the token, which would change the handle on every post.
- **The owner is a list in an env var.** Changing it means a redeploy. There's
  no in-app way to appoint or remove an owner.

## What would change my mind

- If people lose their identity and need it back, add a passkey as a second
  way to claim a handle, keeping the code for linking.
- If there's more than one moderator, or owners need to be changed often, keep
  roles on the volume instead of in an env var.

## Where it lives

- Codes: `src/link.js`; the `/link` and `/link/claim` routes in `src/server.js`;
  `setIdentity` in `src/identity.js`; the page is `renderLink` in
  `src/views.js` and `src/public/link.js`.
- Owner: `isOwner` in `src/identity.js`; `asOwner` in `src/store.js`; the
  `[OWNER]` kind in `src/log.js`; `owner` in the `/live` welcome.
- Contract: `spec/devices-and-owners.test.ts`. The owner test runs only when
  `OWNER_TOKEN` is set against an app started with that owner, so CI skips it.
