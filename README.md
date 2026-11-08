# Virtual Human Short-Form Video

This is a small short-form video app where people can record and share everyday moments as virtual characters, using a webcam or phone camera.

<p align="center">
  <img src="src/public/readme/demo.gif" width="260" alt="Scrolling the feed, changing avatar and world, and recording in the studio" />
</p>

| Feed | Studio | Comments |
| :---: | :---: | :---: |
| <img src="src/public/readme/feed.png" width="220" alt="Feed with a Cool Banana clip" /> | <img src="src/public/readme/studio.png" width="220" alt="Studio with body tracking enabled" /> | <img src="src/public/readme/comments.png" width="220" alt="Comments on a video" /> |

*The demo uses a test camera, so the avatars are idle rather than tracking a real person.*

## What I Wanted to Make

I wanted something easy to use like TikTok, but for a smaller group of people who know each other. I was inspired by Robin Sloan's ["home-cooked apps"](https://www.robinsloan.com/notes/home-cooked-app/) idea. Instead of trying to make a huge social network, this app is for people who have the link.

That is why I left out public discovery, follower counts and algorithmic recommendations. I kept a shared feed, likes and comments, because these are the parts that make short videos feel social.

For me, a good version of this app should have a few important things:

- **Easy to start.** A new user should be able to pick an avatar, record and post in less than a minute, without installing anything.
- **Features that really work.** Buttons should do what they say. A `.glb` model without face rigging should not pretend to have face tracking. A restyled room photo is still a 2D image, and a normal colour filter should not be called AI.
- **Careful with privacy.** Face and body tracking happen in the browser, and raw camera frames are not uploaded for tracking. Normal avatar scenes record the rendered avatar; in an AR background, the blurred camera view is also included in the recording. A room photo is sent to an AI service only if the user agrees for that photo.
- **Shared and live.** Everyone with the link sees the same feed. New posts, likes and comments normally appear in about a second without refreshing. The app also shows who is online.
- **Basic permission rules and persistence.** The server checks who can delete videos or avatars. A person can like a video once, and posts remain after refreshes, server restarts and redeploys.

When I have to choose between these, I put privacy and keeping user data safe before visual design.

## How to Use It

**Watch videos:** Open **Home** and scroll through the feed. Tap a video to turn on sound, use ♥ to like, 💬 to comment, or ↗ to share. The 🗑 button is for deleting your own video. The top bar shows who is currently watching.

**Make a video:** Press **＋** to open the studio. There are three modes: **Avatar** (record as a virtual character), **Camera** (record yourself) and **Upload** (upload a video file up to 25 MB).

In **Avatar** mode, allow camera access. Your head movement, blinking and mouth movement control a supported avatar. **Body tracking (beta)** can also track your arms and shoulders, if your device can handle it.

Choose **Cool Banana**, **Hotdog**, **Mushy**, or upload your own `.vrm` avatar. A `.glb` file can also be used, but a basic `.glb` does not support face tracking. Then choose a background: one of the default scenes, an uploaded `.glb` world, or **Transform my room**, which changes a room photo into a stylised **2D** background.

Record a clip of up to **30 seconds**, add a caption and display name, and post it. The new video should appear in the shared feed right away.

**A few things to know:** There are no user accounts. The app treats each browser as a separate identity. To use the same identity on another device, go to **About → Use on another device** and enter the code within **10 minutes**. Your uploaded avatars and worlds are private to your browser identity. Body tracking is limited to the upper body and turns off automatically if performance is too slow.
