# Setting up AI room restyling (optional)

Out of the box, AI restyling is **off**. The studio offers only the on-device
filter, and `POST /rooms` answers `503`. Nothing below is needed for the app to
work.

## Try the flow for free, locally

```sh
ROOM_AI_PROVIDER=fake pnpm dev
```

The `fake` provider returns your photo unchanged after a short wait. The
consent text and the result both say so. Use it to check the consent, job and
polling flow without spending anything.

## Use Stability AI

The adapter calls Stability AI's **Control: Structure** endpoint
(`POST https://api.stability.ai/v2beta/stable-image/control/structure`). That
endpoint keeps the input image's layout and redraws it to a prompt, with
`control_strength` 0.75. **This has not been called from this project yet.**
Check its current price on Stability's pricing page before turning it on.

1. Create an API key at https://platform.stability.ai/ (paid credits).
2. Locally, put it in `mise.local.toml`. That file is git-ignored, so the key
   never reaches the repo:
   ```toml
   [env]
   ROOM_AI_PROVIDER = "stability"
   STABILITY_API_KEY = "sk-..."
   ```
3. On Fly, set it as a secret. Secrets stay off the image and out of `fly.toml`:
   ```sh
   mise exec -- flyctl secrets set -a comp4020-final-mayrhee218 ROOM_AI_PROVIDER=stability STABILITY_API_KEY=sk-...
   ```
   Setting a secret restarts the app.
4. Turn it off again with
   `flyctl secrets unset ROOM_AI_PROVIDER STABILITY_API_KEY`.

## Adding another provider

Add an adapter in `src/rooms.js` with `name`, `costNote`, and
`transform({ image, type, prompt })` returning `{ image, type }`. Then select
it in `configured()`. The job queue, consent, ownership and limits apply to
every provider unchanged.

## Manual acceptance checks

- With no provider set, "Restyle with AI…" doesn't appear.
- With `fake`, the consent box names the provider and cost. Cancel sends
  nothing (the server log shows no request), and Send shows a timer, then
  "as returned by test provider (returns your photo unchanged)".
- A photo with a face in it shows the warning.
- Switching style without AI changes the on-device filter immediately.
  Switching back to a style that has an AI result shows that result.
- "Remove" clears the room photo and World returns to a standard backdrop.
- Uploading a `.glb` world shows the avatar standing in it. Switching between
  Standard, Room photo and the world works mid-session, and each records.
- "Live camera (shows you)" says the clip will show you.
- Camera mode and video Upload don't show any of the avatar, room or world
  controls.
