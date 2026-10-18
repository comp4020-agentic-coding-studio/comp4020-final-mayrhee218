// "Transform my room": a still photo of your room, restyled to suit your
// avatar, drawn behind it as a flat 2D picture. It is not a 3D world: the
// avatar stands in front of it, nothing walks around in it. True 3D worlds are
// uploaded .glb scenes (see world3d.js).
//
// Styling happens one of two ways, and the studio says which:
// - "filter": on this device, with canvas filters. Fast, free, and the photo
//   never leaves the browser. It recolours; it doesn't redraw.
// - "ai": on the server, by an image-to-image provider, only with your
//   explicit consent, and only if one is configured (src/rooms.js).

// One style per built-in avatar look. `filter` drives the on-device version;
// `prompt` is what an AI provider is asked for.
export const STYLES = {
  mochi: {
    name: "Mochi (soft pastel)",
    filter: "saturate(0.75) brightness(1.12) contrast(0.9) hue-rotate(-12deg)",
    tint: "rgb(255 182 214 / 0.22)",
    levels: 7,
    prompt: "the same room as a soft pastel anime background, gentle pink and lavender light, clean cel shading, cosy",
  },
  neon: {
    name: "Neon (night city)",
    filter: "saturate(1.8) contrast(1.35) brightness(0.72) hue-rotate(200deg)",
    tint: "rgb(124 92 255 / 0.25)",
    levels: 5,
    prompt: "the same room as a neon cyberpunk game background at night, magenta and cyan glow, bold cel shading",
  },
  sunny: {
    name: "Sunny (bright cartoon)",
    filter: "saturate(1.45) brightness(1.08) contrast(1.1) sepia(0.15)",
    tint: "rgb(255 210 120 / 0.18)",
    levels: 6,
    prompt: "the same room as a bright sunny cartoon game background, warm daylight, flat colours, cheerful",
  },
};
export const DEFAULT_STYLE = "sunny";

const W = 540;
const H = 960;

// Crops and scales any image to the 9:16 portrait frame, as a canvas.
export function portrait(source) {
  const sw = source.videoWidth ?? source.naturalWidth ?? source.width;
  const sh = source.videoHeight ?? source.naturalHeight ?? source.height;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const s = Math.max(W / sw, H / sh);
  c.getContext("2d").drawImage(source, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
  return c;
}

// The on-device style: a colour grade, then posterised into flat bands with
// darkened edges, which reads as painted rather than photographed.
export function stylise(photo, styleKey) {
  const style = STYLES[styleKey] ?? STYLES[DEFAULT_STYLE];
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.filter = `blur(1.5px) ${style.filter}`;
  ctx.drawImage(photo, 0, 0, W, H);
  ctx.filter = "none";

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const step = 255 / (style.levels - 1);
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / step) * step;
  }
  // Ink lines where brightness changes sharply.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const g = Math.abs(lum[p + 1] - lum[p - 1]) + Math.abs(lum[p + W] - lum[p - W]);
      if (g > 70) {
        const i = p * 4;
        d[i] *= 0.35;
        d[i + 1] *= 0.35;
        d[i + 2] *= 0.35;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = style.tint;
  ctx.fillRect(0, 0, W, H);
  return out;
}

// Encodes a canvas for upload: JPEG keeps a 540x960 room well under 1 MB.
export const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
