export const AVATARS = ["🙂", "🦊", "🐧", "🤖", "👾", "🌙", "🌻", "🐙"];

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: system-ui, sans-serif;
        max-width: 40rem;
        margin: 2rem auto;
        padding: 0 1rem;
        line-height: 1.5;
      }
      header { margin-bottom: 2rem; }
      header p { opacity: 0.75; }
      fieldset { border: 1px solid currentColor; border-radius: 0.5rem; margin: 0 0 2rem; }
      .avatars { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .avatars label { font-size: 1.5rem; cursor: pointer; }
      textarea, input[type="text"] { width: 100%; font: inherit; box-sizing: border-box; }
      textarea { resize: vertical; }
      .trace { display: flex; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
      .trace .avatar { font-size: 1.75rem; }
      .trace .meta { opacity: 0.6; font-size: 0.85rem; }
      .empty { opacity: 0.6; font-style: italic; }
      nav a { color: inherit; }
      .here { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; min-height: 2.5rem; margin-bottom: 1.5rem; }
      .here .person { display: flex; flex-direction: column; align-items: center; font-size: 0.75rem; opacity: 0.85; }
      .here .person span:first-child { font-size: 1.75rem; }
      .here .person.me { opacity: 1; font-weight: 600; }
      .trace.arrived { animation: arrive 1.2s ease-out; }
      @keyframes arrive { from { background: color-mix(in srgb, currentColor 12%, transparent); } }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export function renderHome(traces) {
  const avatarInputs = AVATARS.map(
    (a, i) =>
      `<label><input type="radio" name="avatar" value="${a}" ${i === 0 ? "checked" : ""}/>${a}</label>`,
  ).join("\n        ");

  const traceItems = traces.length
    ? traces
        .map(
          (t) => `<li class="trace">
          <span class="avatar">${t.avatar}</span>
          <span>
            <strong>${escapeHtml(t.name || "someone")}</strong>
            <div>${escapeHtml(t.text)}</div>
            <div class="meta">${timeAgo(t.createdAt)}</div>
          </span>
        </li>`,
        )
        .join("\n")
    : `<li class="empty">no one has left a trace yet &mdash; be the first</li>`;

  return layout(
    "the space",
    `<header>
      <h1>the space</h1>
      <p>a small shared space. pick an avatar, leave a trace of a moment, and come back later to see who else was here. <nav><a href="/readme/">what good means here</a></nav></p>
    </header>
    <section aria-labelledby="here-heading">
      <h2 id="here-heading" style="font-size: 1rem; margin-bottom: 0.5rem;">here right now</h2>
      <div class="here" id="here" aria-live="polite"><span class="empty">just you, until the page connects</span></div>
    </section>
    <form method="POST" action="/traces" id="leave">
      <fieldset>
        <legend>leave a trace</legend>
        <div class="avatars">
          ${avatarInputs}
        </div>
        <p>
          <label>name (optional)<br/>
          <input type="text" name="name" maxlength="40" placeholder="someone" /></label>
        </p>
        <p>
          <label>what's happening right now?<br/>
          <textarea name="text" maxlength="280" rows="2" required></textarea></label>
        </p>
        <button type="submit">leave it here</button>
      </fieldset>
    </form>
    <ul id="traces" style="list-style: none; padding: 0;">
      ${traceItems}
    </ul>
    <script type="module" src="/assets/space.js"></script>`,
  );
}

export function renderReadmePage(html) {
  return layout(
    "about this space",
    `<nav><a href="/">&larr; back to the space</a></nav>
    ${html}`,
  );
}
