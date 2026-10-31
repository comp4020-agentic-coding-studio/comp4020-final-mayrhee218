// Devices page: asks the server for a link code, or hands it one typed in.
// The server does the work (src/link.js); this only shows what it says.
const issue = document.getElementById("link-issue");
const code = document.getElementById("link-code");
const expiry = document.getElementById("link-expiry");
const claim = document.getElementById("link-claim");
const status = document.getElementById("link-status");

const errorOf = async (res) => (await res?.json().catch(() => null))?.error ?? "something went wrong, try again";

issue.addEventListener("click", async () => {
  issue.disabled = true;
  const res = await fetch("/link", { method: "POST" }).catch(() => null);
  issue.disabled = false;
  if (!res?.ok) {
    expiry.textContent = await errorOf(res);
    return;
  }
  const { code: value, expiresAt } = await res.json();
  code.textContent = value;
  code.hidden = false;
  const time = new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  expiry.textContent = `Type this on your other device before ${time}. It works once.`;
  issue.textContent = "Show a new code";
});

claim.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Linking…";
  const res = await fetch("/link/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: new FormData(claim).get("code") }),
  }).catch(() => null);
  if (!res?.ok) {
    status.textContent = await errorOf(res);
    return;
  }
  status.textContent = "Linked. Taking you to the feed…";
  setTimeout(() => location.assign("/"), 800);
});
