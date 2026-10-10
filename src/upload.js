import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

export const MAX_BYTES = 25 * 1024 * 1024;

export class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Trust the bytes, not the Content-Type or the filename: WebM/Matroska starts
// with the EBML magic number, MP4 and QuickTime carry an "ftyp" box at byte 4.
export function sniff(head) {
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return { type: "video/webm", ext: "webm" };
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") {
    return head.toString("latin1", 8, 12) === "qt  "
      ? { type: "video/quicktime", ext: "mov" }
      : { type: "video/mp4", ext: "mp4" };
  }
  return null;
}

// Streams the request body to disk rather than holding it in memory: the
// machine has 256 MB, and one clip can be a tenth of that.
export async function receiveVideo(req, dir) {
  const tmp = path.join(dir, `.${randomUUID()}.part`);
  const out = createWriteStream(tmp);
  let size = 0;
  let head = Buffer.alloc(0);
  let kind = null;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new UploadError(413, "that clip is too big — keep it under 25 MB");
      if (!kind && head.length < 12) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= 12) {
          kind = sniff(head);
          if (!kind) throw new UploadError(415, "that file isn't a video we can play");
        }
      }
      if (!out.write(chunk)) await once(out, "drain");
    }
    kind ??= sniff(head);
    if (!kind) throw new UploadError(415, "that file isn't a video we can play");
    out.end();
    await once(out, "finish");
    const file = `${randomUUID()}.${kind.ext}`;
    await rename(tmp, path.join(dir, file));
    return { file, type: kind.type, size };
  } catch (err) {
    out.destroy();
    await rm(tmp, { force: true });
    throw err;
  }
}
