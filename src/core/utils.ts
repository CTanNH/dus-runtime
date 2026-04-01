export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1.0e-6), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

export function length2(x, y) {
  return Math.hypot(x, y);
}

export function lengthSq(x, y) {
  return x * x + y * y;
}

export function normalize2(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1.0e-6) return { x: 0.0, y: 0.0 };
  return { x: x / len, y: y / len };
}

export function hashString(value, seed = 0) {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  hash += seed * 1013904223;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489917);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

export function seededSigned(value, seed = 0) {
  return hashString(value, seed) * 2.0 - 1.0;
}

export function seededPoint(key, seed, spreadX, spreadY) {
  return {
    x: seededSigned(`${key}:x`, seed) * spreadX,
    y: seededSigned(`${key}:y`, seed + 17) * spreadY
  };
}

export function cloneScene(scene) {
  return {
    ...scene,
    nodes: (scene.nodes ?? []).map((node) => ({
      ...node,
      intrinsicSize: { ...node.intrinsicSize },
      targetPose: node.targetPose ? { ...node.targetPose } : undefined,
      rendererPayload: node.rendererPayload ? { ...node.rendererPayload } : undefined,
      metadata: node.metadata ? { ...node.metadata } : undefined
    })),
    relations: (scene.relations ?? []).map((relation) => ({ ...relation })),
    constraints: (scene.constraints ?? []).map((constraint) => ({
      ...constraint,
      params: constraint.params ? { ...constraint.params } : undefined
    })),
    viewport: scene.viewport ? { ...scene.viewport } : undefined,
    interactionField: scene.interactionField ? { ...scene.interactionField } : undefined
  };
}

export function worldBoundsFromViewport(viewport) {
  if (viewport && Number.isFinite(viewport.minX) && Number.isFinite(viewport.maxX) && Number.isFinite(viewport.minY) && Number.isFinite(viewport.maxY)) {
    return viewport;
  }

  return {
    minX: -6.8,
    maxX: 6.8,
    minY: -4.4,
    maxY: 4.4
  };
}

export function poseToRect(pose) {
  return {
    left: pose.x - pose.width * 0.5,
    right: pose.x + pose.width * 0.5,
    top: pose.y + pose.height * 0.5,
    bottom: pose.y - pose.height * 0.5
  };
}

export function rectContainsPoint(rect, pointX, pointY) {
  return pointX >= rect.left && pointX <= rect.right && pointY >= rect.bottom && pointY <= rect.top;
}

export function makeSparkline(values, width = 28) {
  if (!values.length) return "";
  const slice = values.slice(-width);
  let min = Infinity;
  let max = -Infinity;

  for (const value of slice) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const chars = "▁▂▃▄▅▆▇█";
  const denom = Math.max(max - min, 1.0e-6);
  return slice.map((value) => {
    const normalized = clamp((value - min) / denom, 0.0, 1.0);
    return chars[Math.min(chars.length - 1, Math.floor(normalized * chars.length))];
  }).join("");
}

export function roleIndexFromString(role) {
  switch (role) {
    case "lead": return 0;
    case "answer": return 1;
    case "evidence": return 2;
    case "citation": return 3;
    case "contradiction": return 4;
    case "figure": return 5;
    case "token": return 6;
    case "slot": return 7;
    default: return 8;
  }
}
