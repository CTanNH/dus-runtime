// @ts-nocheck

import { createDusRuntime } from "./core/runtime.js";
import { clamp } from "./core/utils.js";
import { createAssetProvider } from "./adapters/webgpu/assetProvider.js";
import { createWebGpuRendererAdapter } from "./adapters/webgpu/renderer.js";
import { createDomHostBridge } from "./adapters/dom/hostBridge.js";
import { buildKnowledgeWorkspaceScene } from "./app/knowledgeWorkspace.js";

function fitCameraToBounds(bounds) {
  const width = Math.max(bounds.maxX - bounds.minX, 1.0);
  const height = Math.max(bounds.maxY - bounds.minY, 1.0);
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const minDim = Math.max(1, Math.min(screenWidth, screenHeight));
  const zoomX = (2.0 * screenWidth) / (minDim * width);
  const zoomY = (2.0 * screenHeight) / (minDim * height);

  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
    zoom: clamp(Math.min(zoomX, zoomY) * 0.92, 0.08, 1.0)
  };
}

function layoutBounds(layout, padding = 0.42) {
  if (!layout?.nodePoses?.length) {
    return { minX: -4.0, maxX: 4.0, minY: -3.0, maxY: 3.0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pose of layout.nodePoses) {
    minX = Math.min(minX, pose.x - pose.width * 0.5, pose.targetX - pose.targetWidth * 0.5);
    maxX = Math.max(maxX, pose.x + pose.width * 0.5, pose.targetX + pose.targetWidth * 0.5);
    minY = Math.min(minY, pose.y - pose.height * 0.5, pose.targetY - pose.targetHeight * 0.5);
    maxY = Math.max(maxY, pose.y + pose.height * 0.5, pose.targetY + pose.targetHeight * 0.5);
  }

  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minY: minY - padding,
    maxY: maxY + padding
  };
}

async function main() {
  document.body.style.margin = "0";
  document.body.style.background = "#03070f";
  document.body.style.overflow = "hidden";

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  document.body.replaceChildren(canvas);

  const assetProvider = await createAssetProvider();
  const scene = await buildKnowledgeWorkspaceScene(assetProvider);
  const runtime = createDusRuntime({ seed: 11, iterationsPerFrame: 2 });
  runtime.setScene(scene);
  runtime.solve(120, 1.0 / 60.0);

  const renderer = await createWebGpuRendererAdapter({ canvas, assetProvider });
  renderer.setScene(scene);
  renderer.resize();

  let camera = fitCameraToBounds(layoutBounds(runtime.getLayout()));
  renderer.setCamera(camera);
  let hasManualCamera = false;

  const interaction = {
    cursorX: 0.0,
    cursorY: 0.0,
    cursorVx: 0.0,
    cursorVy: 0.0,
    cursorMass: 0.0,
    clickImpulse: 0.0,
    clickAge: 8.0,
    queryPulse: 0.0,
    focusNodeId: null,
    selectedNodeId: null
  };

  let paused = false;
  let pointerDown = false;
  let isPanning = false;
  let activePointerId = -1;
  let downScreenX = 0.0;
  let downScreenY = 0.0;
  let startCameraX = 0.0;
  let startCameraY = 0.0;
  let previousWorldX = 0.0;
  let previousWorldY = 0.0;
  let previousPointerT = 0.0;
  let lastFrameTime = performance.now() * 0.001;

  function applyViewPreset(preset) {
    if (preset === "field") {
      renderer.setMode("field");
      renderer.setDebugFlags({ showTargets: true, showHeat: false });
      return;
    }

    if (preset === "debug") {
      renderer.setMode("plain");
      renderer.setDebugFlags({ showTargets: true, showHeat: true });
      return;
    }

    renderer.setMode("plain");
    renderer.setDebugFlags({ showTargets: true, showHeat: false });
  }

  function fitCameraToLayout() {
    camera = fitCameraToBounds(layoutBounds(runtime.getLayout()));
    renderer.setCamera(camera);
    hasManualCamera = false;
  }

  applyViewPreset("plain");

  const replay = () => {
    runtime.setScene(scene);
    runtime.solve(120, 1.0 / 60.0);
    interaction.selectedNodeId = null;
    interaction.focusNodeId = null;
    interaction.clickImpulse = 0.0;
    interaction.clickAge = 8.0;
    fitCameraToLayout();
  };

  const bridge = createDomHostBridge({
    actions: {
      setViewPreset(preset) {
        applyViewPreset(preset);
      },
      toggleTargets() {
        const flags = renderer.getDebugFlags();
        renderer.setDebugFlags({ ...flags, showTargets: !flags.showTargets });
      },
      toggleHeat() {
        const flags = renderer.getDebugFlags();
        renderer.setDebugFlags({ ...flags, showHeat: !flags.showHeat });
      },
      togglePause() {
        paused = !paused;
      },
      fitCamera() {
        fitCameraToLayout();
      },
      replay
    },
    getViewPreset: () => {
      const mode = renderer.getMode();
      const flags = renderer.getDebugFlags();
      if (mode === "plain" && flags.showHeat) return "debug";
      if (mode === "field") return "field";
      return "plain";
    },
    getPaused: () => paused,
    getShowTargets: () => renderer.getDebugFlags().showTargets,
    getShowHeat: () => renderer.getDebugFlags().showHeat,
    project: (point) => renderer.project(point)
  });
  runtime.bindHostBridge(bridge);

  const updatePointer = (clientX, clientY, timeStamp) => {
    const rect = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld({ x: clientX - rect.left, y: clientY - rect.top });
    const time = timeStamp * 0.001;
    const dt = previousPointerT > 0.0 ? clamp(time - previousPointerT, 1.0e-3, 0.05) : 1.0 / 120.0;
    const rawVx = (world.x - previousWorldX) / dt;
    const rawVy = (world.y - previousWorldY) / dt;
    const blend = 1.0 - Math.exp(-20.0 * dt);

    interaction.cursorX = world.x;
    interaction.cursorY = world.y;
    interaction.cursorVx += (rawVx - interaction.cursorVx) * blend;
    interaction.cursorVy += (rawVy - interaction.cursorVy) * blend;
    previousWorldX = world.x;
    previousWorldY = world.y;
    previousPointerT = time;

    const speed = Math.min(9.0, Math.hypot(interaction.cursorVx, interaction.cursorVy));
    interaction.cursorMass = clamp(0.06 + 0.05 * speed + (interaction.focusNodeId ? 0.10 : 0.0), 0.0, 1.25);
    return world;
  };

  const focusAtPoint = (world) => {
    const hit = runtime.hitTest(world);
    interaction.focusNodeId = hit?.id ?? null;
    return hit;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activePointerId = event.pointerId;
    pointerDown = true;
    isPanning = false;
    downScreenX = event.clientX;
    downScreenY = event.clientY;
    startCameraX = camera.x;
    startCameraY = camera.y;
    const world = updatePointer(event.clientX, event.clientY, event.timeStamp);
    focusAtPoint(world);
  };

  const onPointerMove = (event) => {
    const world = updatePointer(event.clientX, event.clientY, event.timeStamp);
    if (!pointerDown || event.pointerId !== activePointerId) {
      focusAtPoint(world);
      return;
    }

    const dx = event.clientX - downScreenX;
    const dy = event.clientY - downScreenY;
    if (!isPanning && dx * dx + dy * dy > 49.0) isPanning = true;
    if (!isPanning) {
      focusAtPoint(world);
      return;
    }

    hasManualCamera = true;

    const minDim = Math.max(1, Math.min(canvas.width, canvas.height));
    camera = {
      ...camera,
      x: startCameraX - (dx / (camera.zoom * minDim * 0.5)),
      y: startCameraY + (dy / (camera.zoom * minDim * 0.5))
    };
    renderer.setCamera(camera);
    interaction.cursorMass = 0.0;
    interaction.cursorVx = 0.0;
    interaction.cursorVy = 0.0;
    interaction.focusNodeId = null;
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== activePointerId) return;
    const world = updatePointer(event.clientX, event.clientY, event.timeStamp);
    const hit = focusAtPoint(world);

    if (!isPanning) {
      interaction.selectedNodeId = hit?.id ?? null;
      interaction.clickImpulse = clamp(interaction.clickImpulse + 1.0 + Math.min(1.4, Math.hypot(interaction.cursorVx, interaction.cursorVy) * 0.12), 0.0, 2.6);
      interaction.clickAge = 0.0;
    }

    canvas.releasePointerCapture(event.pointerId);
    activePointerId = -1;
    pointerDown = false;
    isPanning = false;
  };

  const onPointerCancel = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = -1;
    pointerDown = false;
    isPanning = false;
    interaction.cursorMass = 0.0;
    interaction.focusNodeId = null;
  };

  const onPointerLeave = () => {
    if (!pointerDown) {
      interaction.cursorMass = 0.0;
      interaction.focusNodeId = null;
    }
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const anchor = renderer.screenToWorld(screen);
    const factor = Math.exp(-event.deltaY * 0.0011);
    hasManualCamera = true;
    camera.zoom = clamp(camera.zoom * factor, 0.08, 2.0);
    const minDim = Math.max(1, Math.min(canvas.width, canvas.height));
    camera.x = anchor.x - (screen.x - canvas.width * 0.5) / (camera.zoom * minDim * 0.5);
    camera.y = anchor.y + (screen.y - canvas.height * 0.5) / (camera.zoom * minDim * 0.5);
    renderer.setCamera(camera);
    updatePointer(event.clientX, event.clientY, event.timeStamp);
  };

  const onResize = () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    if (!hasManualCamera && !pointerDown) {
      fitCameraToLayout();
      return;
    }
    renderer.setCamera(camera);
  };

  const onKeyDown = (event) => {
    if (event.key === "1") applyViewPreset("plain");
    if (event.key === "2") applyViewPreset("field");
    if (event.key === "3") applyViewPreset("debug");
    if (event.key.toLowerCase() === "h") {
      const flags = renderer.getDebugFlags();
      renderer.setDebugFlags({ ...flags, showHeat: !flags.showHeat });
    }
    if (event.key.toLowerCase() === "t") {
      const flags = renderer.getDebugFlags();
      renderer.setDebugFlags({ ...flags, showTargets: !flags.showTargets });
    }
    if (event.key === " ") {
      event.preventDefault();
      paused = !paused;
    }
    if (event.key.toLowerCase() === "f") fitCameraToLayout();
    if (event.key.toLowerCase() === "r") replay();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);

  function frame() {
    const now = performance.now() * 0.001;
    const dt = clamp(now - lastFrameTime, 1.0 / 240.0, 1.0 / 20.0);
    lastFrameTime = now;

    interaction.clickImpulse *= Math.exp(-2.4 * dt);
    interaction.clickAge += dt;
    interaction.cursorVx *= Math.exp(-1.1 * dt);
    interaction.cursorVy *= Math.exp(-1.1 * dt);
    const targetPulse = interaction.focusNodeId || interaction.selectedNodeId ? 1.0 : 0.0;
    interaction.queryPulse += (targetPulse - interaction.queryPulse) * (1.0 - Math.exp(-4.0 * dt));

    runtime.setInteractionField({
      cursorX: interaction.cursorX,
      cursorY: interaction.cursorY,
      cursorVx: interaction.cursorVx,
      cursorVy: interaction.cursorVy,
      focusNodeId: interaction.focusNodeId,
      selectedNodeId: interaction.selectedNodeId,
      queryPulse: interaction.queryPulse
    });

    if (!paused) runtime.step(dt);

    const layout = runtime.getLayout();
    const debugState = runtime.getDebugState();

    renderer.render(layout, scene, debugState, {
      time: now,
      dt,
      cursorX: interaction.cursorX,
      cursorY: interaction.cursorY,
      cursorVx: interaction.cursorVx,
      cursorVy: interaction.cursorVy,
      cursorMass: interaction.cursorMass,
      clickImpulse: interaction.clickImpulse,
      clickAge: interaction.clickAge,
      queryPulse: interaction.queryPulse,
      focusNodeId: interaction.focusNodeId,
      selectedNodeId: interaction.selectedNodeId
    });

    bridge.update({
      scene,
      layout,
      debugState,
      interactionField: interaction
    });

    requestAnimationFrame(frame);
  }

  window.__DUS_READY__ = true;
  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
});
