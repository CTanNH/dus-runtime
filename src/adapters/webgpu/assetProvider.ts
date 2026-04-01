import { clamp } from "../../core/utils.js";

const FONT_SOURCE = {
  json: "https://cdn.aframe.io/fonts/Roboto-msdf.json",
  png: "https://cdn.aframe.io/fonts/Roboto-msdf.png"
};

const FONT_TIMEOUT_MS = 7000;
const DEFAULT_LINE_HEIGHT = 0.30;
const DEFAULT_MAX_WIDTH = 2.6;

function getCharKey(charData) {
  if (typeof charData.char === "string" && charData.char.length > 0) return charData.char;
  if (typeof charData.letter === "string" && charData.letter.length > 0) return charData.letter;
  return String.fromCodePoint(charData.id);
}

function getKerningAmount(kernings, first, second) {
  return kernings.get(`${first}:${second}`) ?? 0.0;
}

function measureWord(word, charMap, kerningMap, scale, tracking) {
  let width = 0.0;
  let prevId = 0;
  for (const symbol of word) {
    const charData = charMap.get(symbol) ?? charMap.get("?");
    if (!charData) continue;
    width += getKerningAmount(kerningMap, prevId, charData.id) * scale;
    width += charData.xadvance * scale + tracking;
    prevId = charData.id;
  }
  return Math.max(width - tracking, 0.0);
}

function splitParagraphs(text) {
  return String(text).replace(/\r/g, "").split("\n");
}

async function loadMsdfBitmap(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { mode: "cors", signal: controller.signal });
    if (!response.ok) throw new Error(`MSDF image ${response.status} ${response.statusText}`);
    const blob = await response.blob();
    return createImageBitmap(blob);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadMsdfFont() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_TIMEOUT_MS);

  try {
    const [jsonResponse, bitmap] = await Promise.all([
      fetch(FONT_SOURCE.json, { mode: "cors", signal: controller.signal }),
      loadMsdfBitmap(FONT_SOURCE.png)
    ]);

    if (!jsonResponse.ok) throw new Error(`MSDF JSON ${jsonResponse.status} ${jsonResponse.statusText}`);
    return { font: await jsonResponse.json(), bitmap };
  } finally {
    clearTimeout(timeout);
  }
}

function buildImageAtlas() {
  const width = 512;
  const height = 256;
  const data = new Uint8Array(width * height * 4);

  const writePixel = (x, y, r, g, b, a = 255) => {
    const offset = (y * width + x) * 4;
    data[offset + 0] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  };

  const fillTile = (tileX, tileY, tileWidth, tileHeight, shader) => {
    for (let y = 0; y < tileHeight; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const color = shader(x / Math.max(tileWidth - 1, 1), y / Math.max(tileHeight - 1, 1));
        writePixel(tileX + x, tileY + y, color[0], color[1], color[2], color[3] ?? 255);
      }
    }
  };

  fillTile(0, 0, 256, 128, (u, v) => {
    const ridge = Math.sin(u * 18.0) * Math.cos(v * 11.0);
    const glow = Math.exp(-12.0 * ((u - 0.62) ** 2 + (v - 0.38) ** 2));
    return [
      Math.round(46 + 70 * u + 46 * ridge),
      Math.round(92 + 100 * glow + 28 * ridge),
      Math.round(120 + 94 * (1.0 - v) + 30 * glow),
      255
    ];
  });

  fillTile(256, 0, 256, 128, (u, v) => {
    const stripes = Math.sin((u + v * 0.3) * 30.0) * 0.5 + 0.5;
    const basin = Math.exp(-10.0 * ((u - 0.35) ** 2 + (v - 0.52) ** 2));
    return [
      Math.round(118 + 90 * basin),
      Math.round(52 + 130 * stripes),
      Math.round(50 + 80 * (1.0 - basin)),
      255
    ];
  });

  fillTile(0, 128, 256, 128, (u, v) => {
    const rings = Math.sin(Math.hypot(u - 0.5, v - 0.5) * 36.0);
    const beams = Math.cos(u * 20.0) * Math.sin(v * 16.0);
    return [
      Math.round(34 + 42 * beams),
      Math.round(76 + 120 * (rings * 0.5 + 0.5)),
      Math.round(134 + 90 * (1.0 - u)),
      255
    ];
  });

  fillTile(256, 128, 256, 128, (u, v) => {
    const nodes = Math.sin((u * 14.0 + v * 22.0) * Math.PI) * 0.5 + 0.5;
    const fade = Math.exp(-7.0 * ((u - 0.72) ** 2 + (v - 0.28) ** 2));
    return [
      Math.round(72 + 78 * nodes),
      Math.round(60 + 96 * fade),
      Math.round(94 + 120 * nodes),
      255
    ];
  });

  const images = new Map([
    ["retrieval-map", { id: "retrieval-map", uvRect: { u0: 0.0, v0: 0.0, u1: 0.5, v1: 0.5 }, aspect: 2.0 }],
    ["uncertainty-ridge", { id: "uncertainty-ridge", uvRect: { u0: 0.5, v0: 0.0, u1: 1.0, v1: 0.5 }, aspect: 2.0 }],
    ["citation-lattice", { id: "citation-lattice", uvRect: { u0: 0.0, v0: 0.5, u1: 0.5, v1: 1.0 }, aspect: 2.0 }],
    ["evidence-flow", { id: "evidence-flow", uvRect: { u0: 0.5, v0: 0.5, u1: 1.0, v1: 1.0 }, aspect: 2.0 }]
  ]);

  return { width, height, data, images };
}

export async function createAssetProvider() {
  const msdf = await loadMsdfFont();
  const imageAtlas = buildImageAtlas();

  const chars = msdf.font.chars ?? [];
  const common = msdf.font.common ?? {};
  const lineHeightPx = Math.max(common.lineHeight ?? 0.0, 1.0);
  const basePx = common.base ?? lineHeightPx * 0.8;
  const scaleW = Math.max(common.scaleW ?? msdf.bitmap.width, 1);
  const scaleH = Math.max(common.scaleH ?? msdf.bitmap.height, 1);
  const distanceRange = Math.max(msdf.font.distanceField?.distanceRange ?? 4.0, 1.0);
  const charMap = new Map();
  const kerningMap = new Map();
  const textRuns = new Map();

  for (const charData of chars) charMap.set(getCharKey(charData), charData);
  for (const kerning of msdf.font.kernings ?? []) kerningMap.set(`${kerning.first}:${kerning.second}`, kerning.amount);

  const fallbackChar = charMap.get("?") ?? chars[0];

  function createTextRun(id, text, options = {}) {
    if (textRuns.has(id)) return textRuns.get(id);

    const tracking = options.tracking ?? 0.012;
    const lineHeightWorld = options.lineHeight ?? DEFAULT_LINE_HEIGHT;
    const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
    const paddingX = options.paddingX ?? 0.18;
    const paddingY = options.paddingY ?? 0.14;
    const scale = lineHeightWorld / lineHeightPx;
    const lineAdvance = (options.lineAdvance ?? 1.28) * lineHeightWorld;
    const paragraphs = splitParagraphs(text);
    const spaceAdvance = ((charMap.get(" ")?.xadvance ?? lineHeightPx * 0.34) * scale) + tracking;
    const lines = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push([]);
        continue;
      }

      let current = [];
      let currentWidth = 0.0;
      for (const word of words) {
        const wordWidth = measureWord(word, charMap, kerningMap, scale, tracking);
        if (current.length > 0 && currentWidth + spaceAdvance + wordWidth > maxWidth) {
          lines.push(current);
          current = [word];
          currentWidth = wordWidth;
        } else {
          if (current.length > 0) currentWidth += spaceAdvance;
          current.push(word);
          currentWidth += wordWidth;
        }
      }

      if (current.length > 0) lines.push(current);
    }

    const glyphs = [];
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let maxTop = -Infinity;
    let minBottom = Infinity;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const words = lines[lineIndex];
      let penX = 0.0;
      const penY = -lineIndex * lineAdvance;

      for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        const word = words[wordIndex];
        let prevId = 0;

        for (const symbol of word) {
          const charData = charMap.get(symbol) ?? fallbackChar;
          if (!charData) continue;

          penX += getKerningAmount(kerningMap, prevId, charData.id) * scale;

          const width = Math.max(charData.width * scale, lineHeightWorld * 0.05);
          const height = Math.max(charData.height * scale, lineHeightWorld * 0.10);
          const left = penX + charData.xoffset * scale;
          const top = penY + (basePx - charData.yoffset) * scale;
          const bottom = top - height;
          const right = left + width;

          minLeft = Math.min(minLeft, left);
          maxRight = Math.max(maxRight, right);
          maxTop = Math.max(maxTop, top);
          minBottom = Math.min(minBottom, bottom);

          glyphs.push({
            x: left + width * 0.5,
            y: (top + bottom) * 0.5,
            width,
            height,
            uvRect: {
              u0: charData.x / scaleW,
              v0: charData.y / scaleH,
              u1: (charData.x + charData.width) / scaleW,
              v1: (charData.y + charData.height) / scaleH
            }
          });

          penX += charData.xadvance * scale + tracking;
          prevId = charData.id;
        }

        if (wordIndex < words.length - 1) penX += spaceAdvance;
      }
    }

    const runWidth = Number.isFinite(maxRight - minLeft) ? Math.max(maxRight - minLeft, lineHeightWorld * 0.24) : lineHeightWorld;
    const runHeight = Number.isFinite(maxTop - minBottom) ? Math.max(maxTop - minBottom, lineHeightWorld) : lineHeightWorld;
    const centerX = Number.isFinite(minLeft + maxRight) ? 0.5 * (minLeft + maxRight) : 0.0;
    const centerY = Number.isFinite(maxTop + minBottom) ? 0.5 * (maxTop + minBottom) : 0.0;

    for (const glyph of glyphs) {
      glyph.offsetX = glyph.x - centerX;
      glyph.offsetY = glyph.y - centerY;
    }

    const run = {
      id,
      text,
      glyphs,
      width: runWidth,
      height: runHeight,
      paddedWidth: runWidth + paddingX * 2.0,
      paddedHeight: runHeight + paddingY * 2.0,
      paddingX,
      paddingY,
      lineHeight: lineHeightWorld,
      distanceRange
    };

    textRuns.set(id, run);
    return run;
  }

  return {
    async getMsdfFont() {
      return msdf;
    },

    getTextRun(id) {
      return textRuns.get(id) ?? null;
    },

    createTextRun,

    getImage(id) {
      return imageAtlas.images.get(id) ?? null;
    },

    getImageAtlas() {
      return imageAtlas;
    }
  };
}
