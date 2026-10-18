// One line per thing a person does, on stdout, so `flyctl logs` reads as a
// running account of who did what. Every line starts with the actor's name and
// handle, so two people who both call themselves "mia" still read apart:
//
//   mia🦊#fVuOo4_lR3 posted video 18e0d187 "first try"
//   kai🐧#ncQDAUabyl liked video 18e0d187 (mia🦊#fVuOo4_lR3's) → 1 like
//   kai🐧#ncQDAUabyl REFUSED delete video 18e0d187 (mia🦊#fVuOo4_lR3's)
//
// The handle is the public one (src/identity.js), never the cookie token, so
// the logs are safe to paste into an issue or show at a crit.

// The last name and avatar each handle used. Deletes and likes don't carry a
// name, so this is what lets their log lines say who. Seeded at boot from
// what's stored, so a restart doesn't turn everyone into bare handles.
const known = new Map(); // handle -> { name, avatar }

export function remember(by, { name, avatar }) {
  if (by) known.set(by, { name, avatar });
}

export function who(by) {
  if (!by) return "(no cookie)";
  const p = known.get(by);
  return p ? `${p.name || "someone"}${p.avatar}#${by}` : `#${by}`;
}

export const quote = (text, max = 40) => {
  const s = String(text).replace(/\s+/g, " ");
  return JSON.stringify(s.length > max ? `${s.slice(0, max)}…` : s);
};

export const shortId = (id) => String(id).slice(0, 8);

export function act(by, what) {
  console.log(`${who(by)} ${what}`);
}
