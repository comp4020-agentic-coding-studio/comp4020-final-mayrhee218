import { randomInt } from "node:crypto";

// Linking a second device (docs/decisions/0005-linking-devices.md). A
// browser asks for a short code; typing it into another browser within ten
// minutes makes that browser the same person, with the same token and handle.
// Codes live only in memory: a restart forgets them, which costs a retry.
const TTL_MS = 10 * 60 * 1000;
// No 0/O, 1/I/L, so a code read off one screen types cleanly into another.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 8; // 31^8 ≈ 8.5 × 10^11: not guessable in ten minutes over HTTP

const codes = new Map(); // code -> { token, by, expires }

function sweep(now = Date.now()) {
  for (const [code, entry] of codes) if (entry.expires <= now) codes.delete(code);
}

// A fresh code for this browser, replacing any it asked for before.
export function issueCode(token, by) {
  sweep();
  for (const [code, entry] of codes) if (entry.by === by) codes.delete(code);
  let code;
  do {
    code = Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  } while (codes.has(code));
  const expires = Date.now() + TTL_MS;
  codes.set(code, { token, by, expires });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: new Date(expires).toISOString() };
}

// The identity a code stands for, used up on the first try that finds it.
// Accepts lower case, spaces and the dash, as people type them.
export function claimCode(typed) {
  sweep();
  const code = String(typed ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  return entry;
}
