import { createHash, randomBytes } from "node:crypto";

// A person is one browser. On its first request the server gives it a random
// token in a cookie that page scripts can't read; that token is the only proof
// of who you are. Everyone else sees a handle, a hash of the token, so knowing
// someone's handle never lets you act as them. No accounts, no server secret:
// a 128-bit random token can't be guessed, and there's nothing to sign.
const COOKIE = "who";
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export const handleOf = (token) => createHash("sha256").update(token).digest("base64url").slice(0, 10);

function tokenFrom(cookieHeader = "") {
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === COOKIE && TOKEN.test(value ?? "")) return value;
  }
  return null;
}

// The handle for a WebSocket upgrade, which carries the page's cookie. Null
// if the browser somehow has none; the socket can watch but isn't anyone.
export const handleFromCookie = (cookieHeader) => {
  const token = tokenFrom(cookieHeader);
  return token ? handleOf(token) : null;
};

// Owners can delete anything (docs/decisions/0005-devices-and-owners.md). Set
// as a comma-separated list of handles, e.g. `fly secrets set OWNER_HANDLES=…`;
// a handle is public, but only the browser holding its token can act as it.
const OWNERS = new Set(
  String(process.env.OWNER_HANDLES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
);
export const isOwner = (by) => Boolean(by) && OWNERS.has(by);

// Gives this browser `token` as its identity, from now on.
export function setIdentity(req, res, token) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  res.append("set-cookie", `${COOKIE}=${token}; Path=/; Max-Age=${YEAR_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
  req.token = token;
  req.by = handleOf(token);
}

// req.token is the secret; it never leaves the server except in this browser's
// own cookie, and is never logged. req.by is the public handle.
export function identify(req, res, next) {
  const token = tokenFrom(req.get("cookie"));
  if (token) {
    req.token = token;
    req.by = handleOf(token);
  } else {
    setIdentity(req, res, randomBytes(16).toString("base64url"));
  }
  next();
}
