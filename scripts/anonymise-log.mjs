// Usage: node scripts/anonymise-log.mjs docs/testing/logs/<date>.log docs/testing/<name>.txt
// Anonymises a recorded crit log: each handle becomes Person A, B, C… (with
// its chosen name dropped), and quoted text from people (comments, captions,
// names) becomes [text]. Events, times, ids and counts are kept.
import { readFileSync, writeFileSync } from "node:fs";
const [src, out] = process.argv.slice(2);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const lines = strip(readFileSync(src, "utf8")).split("\n").filter((l) => /\[(JOIN|LEAVE|RECV|DONE|REJECT|BCAST|SNAPSHOT)\]/.test(l));
const people = new Map();
const label = (h) => {
  if (!people.has(h)) {
    const n = people.size;
    people.set(h, `Person ${n < 26 ? String.fromCharCode(65 + n) : `#${n + 1}`}`);
  }
  return people.get(h);
};
const res = lines.map((l) =>
  l
    .replace(/^(\S+Z) app\[[0-9a-f]+\] [a-z]+ \[info\]/, "$1 ")
    // name + emoji + handle, or a bare handle
    .replace(/(?:[^\s(#[\]]*)#([A-Za-z0-9_-]{10})(?![A-Za-z0-9_-])/g, (_, h) => label(h))
    // anything people typed: quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '"[text]"')
);
writeFileSync(out, res.join("\n") + "\n");
console.log(`${res.length} lines, ${people.size} people`);
