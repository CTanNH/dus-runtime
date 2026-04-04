import { clamp } from "../../core/utils.js";

const FONT_SOURCE = {
  json: "https://cdn.aframe.io/fonts/Roboto-msdf.json",
  png: "https://cdn.aframe.io/fonts/Roboto-msdf.png"
};

const FONT_TIMEOUT_MS = 7000;
const DEFAULT_LINE_HEIGHT = 0.30;
const DEFAULT_MAX_WIDTH = 2.6;
const FALLBACK_FONT_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FALLBACK_FONT_SIZE = 60;
const FALLBACK_CELL_WIDTH = 80;
const FALLBACK_CELL_HEIGHT = 104;
const FALLBACK_COLUMNS = 16;
const FALLBACK_DISTANCE_RANGE = 1.4;
const FALLBACK_ASCII_START = 32;
const FALLBACK_ASCII_END = 126;

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
    return { font: await jsonResponse.json(), bitmap, mode: "msdf" };
  } finally {
    clearTimeout(timeout);
  }
}

function createScratchCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context was unavailable for fallback font generation.");
  return context;
}

async function buildFallbackMsdfFont() {
  const charset = [];
  for (let code = FALLBACK_ASCII_START; code <= FALLBACK_ASCII_END; code += 1) {
    charset.push(String.fromCharCode(code));
  }

  const rows = Math.ceil(charset.length / FALLBACK_COLUMNS);
  const width = FALLBACK_COLUMNS * FALLBACK_CELL_WIDTH;
  const height = rows * FALLBACK_CELL_HEIGHT;
  const canvas = createScratchCanvas(width, height);
  const context = getCanvasContext(canvas);
  const baseline = Math.round(FALLBACK_CELL_HEIGHT * 0.72);
  const paddingX = 8;
  const paddingY = 8;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = `600 ${FALLBACK_FONT_SIZE}px ${FALLBACK_FONT_FAMILY}`;

  const chars = [];
  for (let index = 0; index < charset.length; index += 1) {
    const char = charset[index];
    const column = index % FALLBACK_COLUMNS;
    const row = Math.floor(index / FALLBACK_COLUMNS);
    const cellX = column * FALLBACK_CELL_WIDTH;
    const cellY = row * FALLBACK_CELL_HEIGHT;
    const originX = cellX + paddingX;
    const originY = cellY + baseline;
    const metrics = context.measureText(char);
    const actualLeft = metrics.actualBoundingBoxLeft ?? 0;
    const actualRight = metrics.actualBoundingBoxRight ?? Math.max(metrics.width, FALLBACK_FONT_SIZE * 0.45);
    const actualAscent = metrics.actualBoundingBoxAscent ?? Math.round(FALLBACK_FONT_SIZE * 0.78);
    const actualDescent = metrics.actualBoundingBoxDescent ?? Math.round(FALLBACK_FONT_SIZE * 0.22);
    const left = Math.max(cellX + 1, Math.floor(originX - actualLeft - 1));
    const top = Math.max(cellY + 1, Math.floor(originY - actualAscent - 1));
    const glyphWidth = Math.min(
      FALLBACK_CELL_WIDTH - 2,
      Math.max(4, Math.ceil(actualLeft + actualRight + 2))
    );
    const glyphHeight = Math.min(
      FALLBACK_CELL_HEIGHT - 2,
      Math.max(6, Math.ceil(actualAscent + actualDescent + 2))
    );

    context.fillText(char, originX, originY);

    chars.push({
      id: char.codePointAt(0),
      char,
      x: left,
      y: top,
      width: glyphWidth,
      height: glyphHeight,
      xoffset: left - cellX,
      yoffset: baseline - (top - cellY),
      xadvance: Math.max(
        Math.ceil(metrics.width + 6),
        glyphWidth + Math.max(2, paddingX - Math.floor(actualLeft))
      )
    });
  }

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const coverage = data[index + 3];
    data[index + 0] = coverage;
    data[index + 1] = coverage;
    data[index + 2] = coverage;
    data[index + 3] = coverage;
  }
  context.putImageData(imageData, 0, 0);

  const bitmap = await createImageBitmap(canvas);
  return {
    font: {
      common: {
        lineHeight: FALLBACK_CELL_HEIGHT,
        base: baseline,
        scaleW: width,
        scaleH: height
      },
      distanceField: {
        distanceRange: FALLBACK_DISTANCE_RANGE
      },
      chars,
      kernings: []
    },
    bitmap,
    mode: "bitmap-fallback"
  };
}

async function loadMsdfFontWithFallback() {
  try {
    return await loadMsdfFont();
  } catch (error) {
    console.warn("Falling back to generated font atlas.", error);
    return buildFallbackMsdfFont();
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
  const msdf = await loadMsdfFontWithFallback();
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
      distanceRange,
      fontMode: msdf.mode ?? "msdf"
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
