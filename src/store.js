import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const TRACES_FILE = path.join(DATA_DIR, "traces.json");

let traces = [];
let ready = null;
let writeQueue = Promise.resolve();

async function load() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    traces = JSON.parse(await readFile(TRACES_FILE, "utf8"));
  } catch {
    traces = [];
  }
}

function ensureLoaded() {
  ready ??= load();
  return ready;
}

export async function listTraces() {
  await ensureLoaded();
  return [...traces].reverse();
}

export async function addTrace(trace) {
  await ensureLoaded();
  traces.push(trace);
  // Serialized through one promise chain so two near-simultaneous POSTs
  // can't interleave their writes and corrupt the file.
  writeQueue = writeQueue.then(() => writeFile(TRACES_FILE, JSON.stringify(traces, null, 2)));
  await writeQueue;
  return trace;
}
