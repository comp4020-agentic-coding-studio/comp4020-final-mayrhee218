# 1. Presence: show who is here as avatar faces and a count

- **Status:** accepted (crit 9)
- **Date:** 2026-10-10

## Context

Crit 9 asks for one decision about how the app behaves when several people
use it at once. I chose **presence**: can people see who else is here right
now, and how?

My README defines good as a **social short-form video platform for virtual
creators**, where people watch and interact with each other's videos, and that
should feel as easy as TikTok. The virtual human is the point: everyone here
appears as an avatar, not as their real face.

Constraints from the build:

- **No accounts.** A person is a self-chosen name and emoji avatar, stored on
  their own device.
- **One small server.** Presence is held in memory and broadcast over the
  WebSocket at `/live`. Each change goes out to everyone connected.

## Options considered

1. **No presence.** Like TikTok's normal feed, you never see who else is
   watching. It's the simplest option and reveals nothing about anyone.
2. **An anonymous count**, such as "3 here". It shows the app is alive without
   identifying anyone.
3. **Avatar faces and a count**, with names shown on hover. This is my choice.
4. **A count on each video**, such as "2 watching this", in the style of TikTok
   LIVE. It tells creators who is on *their* video.
5. **A full named list, always visible.** This shows the most social
   information and exposes everyone the most.

## Decision

**Option 3.** The feed's top bar shows a live dot, up to five **avatar faces**
of the people on the feed right now (your own is outlined), and **"N here"**.
Names appear only on hover or long-press, never on screen by default.

## Why

- **Avatars are the identity on this platform.** Showing the emoji avatar,
  rather than a number or a name, makes presence part of the virtual-human
  idea: you see other virtual people, not users.
- **It makes the social platform feel live.** A feed you can watch and react
  to feels different when you can see others are there with you. The same
  live connection that carries new videos, likes and comments makes this
  nearly free.
- **It reveals less than a named list.** Faces without names on screen show
  that people are here without putting names up for everyone, which suits a
  platform where anyone with the link can watch.
- **It's the version a crit can show.** When my pod opens the app together,
  they see each other arrive and leave within a second.

## What it costs

- **Privacy.** Anyone with the link can see that you're on the feed and, on
  hover, the name you chose. There's no way to hide yourself yet. Option 1 or
  2 wouldn't have this cost.
- **It doesn't help creators.** Presence covers the whole feed, not one
  video, so a creator can't tell who is watching *their* clip. Option 4 would
  do that.
- **It doesn't scale.** Five faces and a number say little once there are
  hundreds of people, and every arrival or departure is broadcast to everyone.
  That's fine at crit scale, but it would need batching or per-video rooms
  later.
- **Ghosts.** A phone that sleeps without closing its connection stays "here"
  until the next server ping finds it gone, which can take up to about a
  minute.
- **Names can be faked.** Without accounts, anyone can choose any name or
  avatar.
- **It forgets.** Presence lives only in memory. A restart clears it, which is
  right for "here right now", but there's no history of who visited.
- **The studio is invisible.** People recording on the create page aren't
  counted, because only the feed holds a presence connection.

## What would change my mind

- If people feel watched rather than accompanied, I'd move to **option 2**, or
  add a "hide me" switch.
- Once there are real creators with an audience, **option 4** matters more:
  a creator cares who is watching their video, not who is on the feed.

## Where it lives

- Server: `src/live.js` (in-memory presence, broadcast on hello and close,
  and a ping every 30 seconds to clear dead connections)
- Client: `renderPresence` in `src/public/feed.js`
- Contract: the presence test in `spec/realtime.test.ts`. Someone arriving
  appears for everyone already here, and disappears when they leave.
