import { clamp, roleIndexFromString } from "../../core/utils.js";

const FRAME_W = 0;
const FRAME_H = 1;
const FRAME_T = 2;
const FRAME_DT = 3;
const CURSOR_X = 4;
const CURSOR_Y = 5;
const CURSOR_VX = 6;
const CURSOR_VY = 7;
const INTERACTION_MASS = 8;
const INTERACTION_IMPULSE = 9;
const INTERACTION_CLICK_AGE = 10;
const INTERACTION_PRESSURE = 11;
const CAMERA = 12;
const CAMERA_INV = 28;
const RENDER_FLAGS = 44;
const GLOBAL_FLOATS = 48;

const PANEL_STRIDE = 16;
const CONTENT_STRIDE = 16;

function kindFlag(kind) {
  switch (kind) {
    case "image": return 1;
    case "slot": return 2;
    default: return 0;
  }
}

function quadVertexLayout() {
  return {
    arrayStride: PANEL_STRIDE * 4,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x4" },
      { shaderLocation: 1, offset: 16, format: "float32x4" },
      { shaderLocation: 2, offset: 32, format: "float32x4" },
      { shaderLocation: 3, offset: 48, format: "float32x4" }
    ]
  };
}

function contentVertexLayout() {
  return {
    arrayStride: CONTENT_STRIDE * 4,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x4" },
      { shaderLocation: 1, offset: 16, format: "float32x4" },
      { shaderLocation: 2, offset: 32, format: "float32x4" },
      { shaderLocation: 3, offset: 48, format: "float32x4" }
    ]
  };
}

async function loadShaderSource() {
  const response = await fetch(new URL("../../dus.wgsl", import.meta.url));
  if (!response.ok) throw new Error(`Shader load failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export async function createWebGpuRendererAdapter(options) {
  const gpu = navigator.gpu;
  if (!gpu) throw new Error("WebGPU is unavailable in this browser.");

  const globals = new Float32Array(GLOBAL_FLOATS);
  const msdfFont = await options.assetProvider.getMsdfFont();
  const imageAtlas = options.assetProvider.getImageAtlas();
  const shaderSource = await loadShaderSource();

  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter was found.");

  const device = await adapter.requestDevice();
  const context = options.canvas.getContext("webgpu");
  if (!context) throw new Error("The canvas did not provide a WebGPU context.");

  const shaderModule = device.createShaderModule({ code: shaderSource });
  const compilationInfo = await shaderModule.getCompilationInfo();
  const errors = compilationInfo.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    const details = errors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join(" | ");
    throw new Error(`WGSL compilation failed: ${details}`);
  }

  const format = gpu.getPreferredCanvasFormat();
  const clearColor = options.clearColor ?? { r: 0.012, g: 0.016, b: 0.028, a: 1.0 };
  const globalsBuffer = device.createBuffer({
    size: globals.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const msdfTexture = device.createTexture({
    size: { width: msdfFont.bitmap.width, height: msdfFont.bitmap.height, depthOrArrayLayers: 1 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  device.queue.copyExternalImageToTexture(
    { source: msdfFont.bitmap },
    { texture: msdfTexture },
    { width: msdfFont.bitmap.width, height: msdfFont.bitmap.height, depthOrArrayLayers: 1 }
  );
  msdfFont.bitmap.close?.();

  const imageTexture = device.createTexture({
    size: { width: imageAtlas.width, height: imageAtlas.height, depthOrArrayLayers: 1 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture(
    { texture: imageTexture },
    imageAtlas.data,
    { bytesPerRow: imageAtlas.width * 4, rowsPerImage: imageAtlas.height },
    { width: imageAtlas.width, height: imageAtlas.height, depthOrArrayLayers: 1 }
  );

  const textureSampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear"
  });

  const uniformLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
  });
  const textureLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } }
    ]
  });

  const uniformBindGroup = device.createBindGroup({
    layout: uniformLayout,
    entries: [{ binding: 0, resource: { buffer: globalsBuffer } }]
  });
  const msdfBindGroup = device.createBindGroup({
    layout: textureLayout,
    entries: [
      { binding: 0, resource: textureSampler },
      { binding: 1, resource: msdfTexture.createView() }
    ]
  });
  const imageBindGroup = device.createBindGroup({
    layout: textureLayout,
    entries: [
      { binding: 0, resource: textureSampler },
      { binding: 1, resource: imageTexture.createView() }
    ]
  });

  const panelPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformLayout] });
  const texturedPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, textureLayout] });

  const blendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
  };

  const panelPipeline = device.createRenderPipeline({
    layout: panelPipelineLayout,
    vertex: { module: shaderModule, entryPoint: "vs_panel_current", buffers: [quadVertexLayout()] },
    fragment: { module: shaderModule, entryPoint: "fs_panel", targets: [{ format, blend: blendState }] },
    primitive: { topology: "triangle-list" }
  });

  const targetPipeline = device.createRenderPipeline({
    layout: panelPipelineLayout,
    vertex: { module: shaderModule, entryPoint: "vs_panel_target", buffers: [quadVertexLayout()] },
    fragment: { module: shaderModule, entryPoint: "fs_panel_target", targets: [{ format, blend: blendState }] },
    primitive: { topology: "triangle-list" }
  });

  const textPipeline = device.createRenderPipeline({
    layout: texturedPipelineLayout,
    vertex: { module: shaderModule, entryPoint: "vs_text", buffers: [contentVertexLayout()] },
    fragment: { module: shaderModule, entryPoint: "fs_text", targets: [{ format, blend: blendState }] },
    primitive: { topology: "triangle-list" }
  });

  const imagePipeline = device.createRenderPipeline({
    layout: texturedPipelineLayout,
    vertex: { module: shaderModule, entryPoint: "vs_image", buffers: [contentVertexLayout()] },
    fragment: { module: shaderModule, entryPoint: "fs_image", targets: [{ format, blend: blendState }] },
    primitive: { topology: "triangle-list" }
  });

  let cameraX = 0.0;
  let cameraY = 0.0;
  let cameraZoom = 0.58;
  let mode = "field";
  let showTargets = true;
  let showHeat = false;

  let panelArray = new Float32Array(PANEL_STRIDE * 32);
  let textArray = new Float32Array(CONTENT_STRIDE * 512);
  let imageArray = new Float32Array(CONTENT_STRIDE * 32);
  let panelBuffer = device.createBuffer({ size: panelArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let textBuffer = device.createBuffer({ size: textArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let imageBuffer = device.createBuffer({ size: imageArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

  let sceneRef = null;

  function ensureCapacity(scene) {
    const panelCount = scene.nodes.length;
    let glyphCount = 0;
    let imageCount = 0;

    for (const node of scene.nodes) {
      if (node.kind === "text") glyphCount += options.assetProvider.getTextRun(node.contentRef)?.glyphs.length ?? 0;
      if (node.kind === "image") imageCount += 1;
    }

    if (panelCount * PANEL_STRIDE > panelArray.length) {
      panelArray = new Float32Array(Math.max(panelCount * PANEL_STRIDE, panelArray.length * 2));
      panelBuffer.destroy();
      panelBuffer = device.createBuffer({ size: panelArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }

    if (glyphCount * CONTENT_STRIDE > textArray.length) {
      textArray = new Float32Array(Math.max(glyphCount * CONTENT_STRIDE, textArray.length * 2));
      textBuffer.destroy();
      textBuffer = device.createBuffer({ size: textArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }

    if (imageCount * CONTENT_STRIDE > imageArray.length) {
      imageArray = new Float32Array(Math.max(imageCount * CONTENT_STRIDE, imageArray.length * 2));
      imageBuffer.destroy();
      imageBuffer = device.createBuffer({ size: imageArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
  }

  function writeCameraMatrices() {
    const width = Math.max(1, globals[FRAME_W]);
    const height = Math.max(1, globals[FRAME_H]);
    const minDim = Math.max(1, Math.min(width, height));
    const sx = cameraZoom * minDim / width;
    const sy = cameraZoom * minDim / height;
    const invSx = 1.0 / Math.max(sx, 1.0e-6);
    const invSy = 1.0 / Math.max(sy, 1.0e-6);

    globals[CAMERA + 0] = sx;
    globals[CAMERA + 1] = 0.0;
    globals[CAMERA + 2] = 0.0;
    globals[CAMERA + 3] = 0.0;
    globals[CAMERA + 4] = 0.0;
    globals[CAMERA + 5] = sy;
    globals[CAMERA + 6] = 0.0;
    globals[CAMERA + 7] = 0.0;
    globals[CAMERA + 8] = 0.0;
    globals[CAMERA + 9] = 0.0;
    globals[CAMERA + 10] = 1.0;
    globals[CAMERA + 11] = 0.0;
    globals[CAMERA + 12] = -cameraX * sx;
    globals[CAMERA + 13] = -cameraY * sy;
    globals[CAMERA + 14] = 0.0;
    globals[CAMERA + 15] = 1.0;

    globals[CAMERA_INV + 0] = invSx;
    globals[CAMERA_INV + 1] = 0.0;
    globals[CAMERA_INV + 2] = 0.0;
    globals[CAMERA_INV + 3] = 0.0;
    globals[CAMERA_INV + 4] = 0.0;
    globals[CAMERA_INV + 5] = invSy;
    globals[CAMERA_INV + 6] = 0.0;
    globals[CAMERA_INV + 7] = 0.0;
    globals[CAMERA_INV + 8] = 0.0;
    globals[CAMERA_INV + 9] = 0.0;
    globals[CAMERA_INV + 10] = 1.0;
    globals[CAMERA_INV + 11] = 0.0;
    globals[CAMERA_INV + 12] = cameraX;
    globals[CAMERA_INV + 13] = cameraY;
    globals[CAMERA_INV + 14] = 0.0;
    globals[CAMERA_INV + 15] = 1.0;
  }

  function resize(width = window.innerWidth, height = window.innerHeight) {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    options.canvas.width = nextWidth;
    options.canvas.height = nextHeight;
    context.configure({ device, format, alphaMode: "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    globals[FRAME_W] = nextWidth;
    globals[FRAME_H] = nextHeight;
    writeCameraMatrices();
  }

  function project(point) {
    const minDim = Math.max(1, Math.min(globals[FRAME_W], globals[FRAME_H]));
    return {
      x: (point.x - cameraX) * cameraZoom * minDim * 0.5 + globals[FRAME_W] * 0.5,
      y: globals[FRAME_H] * 0.5 - (point.y - cameraY) * cameraZoom * minDim * 0.5
    };
  }

  function screenToWorld(point) {
    const minDim = Math.max(1, Math.min(globals[FRAME_W], globals[FRAME_H]));
    return {
      x: cameraX + (point.x - globals[FRAME_W] * 0.5) / (cameraZoom * minDim * 0.5),
      y: cameraY + (globals[FRAME_H] * 0.5 - point.y) / (cameraZoom * minDim * 0.5)
    };
  }

  resize();

  return {
    device,

    setScene(scene) {
      sceneRef = scene;
      ensureCapacity(scene);
    },

    setMode(nextMode) {
      mode = nextMode;
    },

    getMode() {
      return mode;
    },

    setDebugFlags(flags) {
      showTargets = Boolean(flags.showTargets);
      showHeat = Boolean(flags.showHeat);
    },

    getDebugFlags() {
      return { showTargets, showHeat };
    },

    setCamera(nextCamera) {
      cameraX = nextCamera.x;
      cameraY = nextCamera.y;
      cameraZoom = clamp(nextCamera.zoom, 0.08, 2.4);
      writeCameraMatrices();
    },

    getCamera() {
      return { x: cameraX, y: cameraY, zoom: cameraZoom };
    },

    resize,
    project,
    screenToWorld,

    render(layout, scene, debugState, viewState) {
      if (!sceneRef) this.setScene(scene);

      const selectedId = viewState.selectedNodeId;
      const focusId = viewState.focusNodeId;
      const panelCount = layout.nodePoses.length;
      let panelOffset = 0;
      let textOffset = 0;
      let imageOffset = 0;

      globals[FRAME_T] = viewState.time;
      globals[FRAME_DT] = viewState.dt;
      globals[CURSOR_X] = viewState.cursorX;
      globals[CURSOR_Y] = viewState.cursorY;
      globals[CURSOR_VX] = viewState.cursorVx;
      globals[CURSOR_VY] = viewState.cursorVy;
      globals[INTERACTION_MASS] = viewState.cursorMass;
      globals[INTERACTION_IMPULSE] = viewState.clickImpulse;
      globals[INTERACTION_CLICK_AGE] = viewState.clickAge;
      globals[INTERACTION_PRESSURE] = viewState.queryPulse;
      globals[RENDER_FLAGS + 0] = mode === "field" ? 1.0 : 0.0;
      globals[RENDER_FLAGS + 1] = showHeat ? 1.0 : 0.0;
      globals[RENDER_FLAGS + 2] = viewState.queryPulse;
      globals[RENDER_FLAGS + 3] = 0.0;

      writeCameraMatrices();

      for (const pose of layout.nodePoses) {
        const role = roleIndexFromString(pose.metadata?.role);
        panelArray[panelOffset + 0] = pose.x;
        panelArray[panelOffset + 1] = pose.y;
        panelArray[panelOffset + 2] = pose.width;
        panelArray[panelOffset + 3] = pose.height;
        panelArray[panelOffset + 4] = pose.targetX;
        panelArray[panelOffset + 5] = pose.targetY;
        panelArray[panelOffset + 6] = pose.targetWidth;
        panelArray[panelOffset + 7] = pose.targetHeight;
        panelArray[panelOffset + 8] = pose.confidence;
        panelArray[panelOffset + 9] = pose.importance;
        panelArray[panelOffset + 10] = pose.stiffness;
        panelArray[panelOffset + 11] = kindFlag(pose.kind);
        panelArray[panelOffset + 12] = role;
        panelArray[panelOffset + 13] = pose.id === focusId ? 1.0 : pose.focusInfluence;
        panelArray[panelOffset + 14] = pose.id === selectedId ? 1.0 : 0.0;
        panelArray[panelOffset + 15] = pose.overlapHeat;
        panelOffset += PANEL_STRIDE;

        if (pose.kind === "text") {
          const run = options.assetProvider.getTextRun(pose.contentRef);
          if (run) {
            for (const glyph of run.glyphs) {
              textArray[textOffset + 0] = pose.x + glyph.offsetX;
              textArray[textOffset + 1] = pose.y + glyph.offsetY;
              textArray[textOffset + 2] = glyph.width;
              textArray[textOffset + 3] = glyph.height;
              textArray[textOffset + 4] = glyph.uvRect.u0;
              textArray[textOffset + 5] = glyph.uvRect.v0;
              textArray[textOffset + 6] = glyph.uvRect.u1;
              textArray[textOffset + 7] = glyph.uvRect.v1;
              textArray[textOffset + 8] = pose.confidence;
              textArray[textOffset + 9] = pose.importance;
              textArray[textOffset + 10] = pose.stiffness;
              textArray[textOffset + 11] = role;
              textArray[textOffset + 12] = pose.id === selectedId ? 1.0 : 0.0;
              textArray[textOffset + 13] = pose.id === focusId ? 1.0 : pose.focusInfluence;
              textArray[textOffset + 14] = pose.overlapHeat;
              textArray[textOffset + 15] = (run.fontMode === "bitmap-fallback" ? -1.0 : 1.0) * (run.distanceRange ?? 4.0);
              textOffset += CONTENT_STRIDE;
            }
          }
        } else if (pose.kind === "image") {
          const image = options.assetProvider.getImage(pose.contentRef);
          if (image) {
            imageArray[imageOffset + 0] = pose.x;
            imageArray[imageOffset + 1] = pose.y;
            imageArray[imageOffset + 2] = pose.width - 0.18;
            imageArray[imageOffset + 3] = pose.height - 0.18;
            imageArray[imageOffset + 4] = image.uvRect.u0;
            imageArray[imageOffset + 5] = image.uvRect.v0;
            imageArray[imageOffset + 6] = image.uvRect.u1;
            imageArray[imageOffset + 7] = image.uvRect.v1;
            imageArray[imageOffset + 8] = pose.confidence;
            imageArray[imageOffset + 9] = pose.importance;
            imageArray[imageOffset + 10] = pose.stiffness;
            imageArray[imageOffset + 11] = role;
            imageArray[imageOffset + 12] = pose.id === selectedId ? 1.0 : 0.0;
            imageArray[imageOffset + 13] = pose.id === focusId ? 1.0 : pose.focusInfluence;
            imageArray[imageOffset + 14] = pose.overlapHeat;
            imageArray[imageOffset + 15] = 0.0;
            imageOffset += CONTENT_STRIDE;
          }
        }
      }

      device.queue.writeBuffer(globalsBuffer, 0, globals.buffer, 0, globals.byteLength);
      device.queue.writeBuffer(panelBuffer, 0, panelArray.buffer, 0, panelCount * PANEL_STRIDE * 4);
      if (textOffset > 0) device.queue.writeBuffer(textBuffer, 0, textArray.buffer, 0, textOffset * 4);
      if (imageOffset > 0) device.queue.writeBuffer(imageBuffer, 0, imageArray.buffer, 0, imageOffset * 4);

      const encoder = device.createCommandEncoder();
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store"
        }]
      });

      renderPass.setBindGroup(0, uniformBindGroup);

      if (showTargets) {
        renderPass.setPipeline(targetPipeline);
        renderPass.setVertexBuffer(0, panelBuffer);
        renderPass.draw(6, panelCount, 0, 0);
      }

      renderPass.setPipeline(panelPipeline);
      renderPass.setVertexBuffer(0, panelBuffer);
      renderPass.draw(6, panelCount, 0, 0);

      if (imageOffset > 0) {
        renderPass.setPipeline(imagePipeline);
        renderPass.setBindGroup(1, imageBindGroup);
        renderPass.setVertexBuffer(0, imageBuffer);
        renderPass.draw(6, imageOffset / CONTENT_STRIDE, 0, 0);
      }

      if (textOffset > 0) {
        renderPass.setPipeline(textPipeline);
        renderPass.setBindGroup(1, msdfBindGroup);
        renderPass.setVertexBuffer(0, textBuffer);
        renderPass.draw(6, textOffset / CONTENT_STRIDE, 0, 0);
      }

      renderPass.end();
      device.queue.submit([encoder.finish()]);

      return {
        panelCount,
        textGlyphCount: textOffset / CONTENT_STRIDE,
        imageCount: imageOffset / CONTENT_STRIDE
      };
    }
  };
}
