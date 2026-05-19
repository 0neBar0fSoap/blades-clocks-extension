import OBR, { buildPath, buildShape, buildText, Command } from "@owlbear-rodeo/sdk";

const CLOCK_KEY = "com.blades-clocks/clock";
const DARK_FILL = "#1a1a1a";
const INNER_RATIO = 0.38; // center cutout as fraction of radius
const GAP = 0.05;         // radians of gap between segments

const PRESETS = [
  { name: "Bronze", value: "#c8a46e" },
  { name: "Ember", value: "#c44c44" },
  { name: "Verdant", value: "#4aa36c" },
  { name: "Midnight", value: "#6e7fd2" },
  { name: "Violet", value: "#8d63d9" },
  { name: "Ash", value: "#bfb7aa" },
];

const state = {
  segments: 6,
  color: PRESETS[0].value,
  selectionIds: [],
  selectedClock: null,
};

function $(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node;
}

function setStatus(el, message, kind = "") {
  el.textContent = message;
  el.className = `status ${kind}`.trim();
}

function polar(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

// Draws an annular (donut) segment with a small gap on each side
function wedgeCommands(size, segmentIndex, segments) {
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 1;
  const innerRadius = size * INNER_RATIO;
  const arcStep = (Math.PI * 2) / segments;
  const start = segmentIndex * arcStep - Math.PI / 2 + GAP / 2;
  const end = start + arcStep - GAP;

  const steps = 20;
  const outerPts = [];
  const innerPts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = start + (end - start) * t;
    outerPts.push(polar(cx, cy, outerRadius, angle));
    innerPts.push(polar(cx, cy, innerRadius, angle));
  }

  // Outer arc forward, inner arc backward → closed donut segment
  const commands = [[Command.MOVE, outerPts[0].x, outerPts[0].y]];
  for (let i = 1; i <= steps; i += 1) {
    commands.push([Command.LINE, outerPts[i].x, outerPts[i].y]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    commands.push([Command.LINE, innerPts[i].x, innerPts[i].y]);
  }
  commands.push([Command.CLOSE]);
  return commands;
}

function buildClockPreviewSVG({ segments, color, filled = 0, size = 120 }) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = size * INNER_RATIO;
  const arcStep = (Math.PI * 2) / segments;
  const steps = 24;

  const slicePaths = [];
  for (let i = 0; i < segments; i += 1) {
    const start = i * arcStep - Math.PI / 2 + GAP / 2;
    const end = start + arcStep - GAP;

    const outerPts = [];
    const innerPts = [];
    for (let j = 0; j <= steps; j += 1) {
      const t = j / steps;
      const angle = start + (end - start) * t;
      outerPts.push({ x: cx + outerR * Math.cos(angle), y: cy + outerR * Math.sin(angle) });
      innerPts.push({ x: cx + innerR * Math.cos(angle), y: cy + innerR * Math.sin(angle) });
    }

    const d = [`M ${outerPts[0].x.toFixed(2)} ${outerPts[0].y.toFixed(2)}`];
    for (let j = 1; j <= steps; j += 1) d.push(`L ${outerPts[j].x.toFixed(2)} ${outerPts[j].y.toFixed(2)}`);
    for (let j = steps; j >= 0; j -= 1) d.push(`L ${innerPts[j].x.toFixed(2)} ${innerPts[j].y.toFixed(2)}`);
    d.push("Z");

    const fillColor = i < filled ? color : DARK_FILL;
    slicePaths.push(`<path d="${d.join(" ")}" fill="${fillColor}" stroke="#000000" stroke-width="1.5" />`);
  }

  // Center cutout circle in the preview
  slicePaths.push(`<circle cx="${cx}" cy="${cy}" r="${innerR - 1}" fill="#111111" />`);

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      ${slicePaths.join("\n")}
    </svg>
  `)}`;
}

function syncPreview() {
  const color = state.color;
  $("preview").src = buildClockPreviewSVG({
    segments: state.segments,
    color,
    filled: 0,
  });
}

function selectSegmentButton(segments) {
  document.querySelectorAll(".seg-btn").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.segments) === segments);
  });
}

function selectColorButton(color) {
  document.querySelectorAll(".color-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === color);
  });
}

function createColorButtons() {
  const row = $("colorRow");
  row.innerHTML = "";
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-btn";
    button.dataset.color = preset.value;
    button.title = preset.name;
    button.style.background = preset.value;
    button.addEventListener("click", () => {
      state.color = preset.value;
      $("customColor").value = preset.value;
      selectColorButton(preset.value);
      syncPreview();
    });
    row.appendChild(button);
  }
  selectColorButton(state.color);
}

function buildClockItems({ name, segments, color, size, position }) {
  const items = [];

  const root = buildShape()
    .name(name || "Progress Clock")
    .position(position)
    .width(size)
    .height(size)
    .shapeType("CIRCLE")
    .fillColor("#000000")
    .fillOpacity(0)
    .strokeColor("#000000")
    .strokeOpacity(1)
    .strokeWidth(3)
    .layer("NOTE")
    .metadata({
      [CLOCK_KEY]: {
        kind: "root",
        name,
        segments,
        filled: 0,
        color,
        size,
      },
    })
    .build();

  items.push(root);

  const wedgePos = { x: position.x - size / 2, y: position.y - size / 2 };

  const wedgeIds = [];
  for (let i = 0; i < segments; i += 1) {
    const wedge = buildPath()
      .name(`Clock wedge ${i + 1}`)
      .position(wedgePos)
      .attachedTo(root.id)
      .disableHit(true)
      .disableAutoZIndex(true)
      .layer("NOTE")
      .commands(wedgeCommands(size, i, segments))
      .fillColor(DARK_FILL)
      .fillOpacity(1)
      .strokeColor("#000000")
      .strokeOpacity(1)
      .strokeWidth(2)
      .build();

    wedgeIds.push(wedge.id);
    items.push(wedge);
  }

  // Dark center cutout circle
  const innerRadius = size * INNER_RATIO;
  const cutoutSize = innerRadius * 2;
  const cutout = buildShape()
    .name("Clock center")
    .position(position)
    .attachedTo(root.id)
    .disableHit(true)
    .disableAutoZIndex(true)
    .layer("NOTE")
    .width(cutoutSize)
    .height(cutoutSize)
    .shapeType("CIRCLE")
    .fillColor("#111111")
    .fillOpacity(1)
    .strokeColor("#000000")
    .strokeOpacity(1)
    .strokeWidth(2)
    .build();

  items.push(cutout);

// Label sits inside the center circle, colored to match the segments
// No disableAutoZIndex — OBR auto-manages z-index, placing text above
// the cutout circle. disableHit keeps it locked to the parent.
const labelDiameter = innerRadius * 2;
const label = buildText()
    .name(name || "Clock label")
    .position({ x: position.x - innerRadius, y: position.y - innerRadius })
    .attachedTo(root.id)
    .disableHit(true)
    .layer("NOTE")
    .width(labelDiameter)
    .height(labelDiameter)
    .plainText(name || "")
    .textType("PLAIN")
    .fontSize(Math.max(8, Math.round(innerRadius * 0.45)))
    .fontWeight(700)
    .fillColor(color)
    .fillOpacity(1)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .build();

  if (name) {
    items.push(label);
  }

  root.metadata[CLOCK_KEY].wedgeIds = wedgeIds;
  root.metadata[CLOCK_KEY].labelId = name ? label.id : undefined;

  return items;
}

async function createClock() {
  const createStatus = $("createStatus");
  try {
    const name = $("clockLabel").value.trim();
    const size = Number($("size").value);
    const position = await OBR.viewport.getPosition();

    const items = buildClockItems({
      name,
      segments: state.segments,
      color: state.color,
      size,
      position,
    });

    await OBR.scene.items.addItems(items);

    const root = items[0];
    await OBR.player.select([root.id], true);

    setStatus(createStatus, "Clock placed.", "success");
  } catch (error) {
    console.error(error);
    setStatus(createStatus, error instanceof Error ? error.message : "Failed to place clock.", "error");
  }
}

async function getSelectedClockRoot() {
  const selection = await OBR.player.getSelection();
  state.selectionIds = Array.isArray(selection) ? selection : [];

  if (!state.selectionIds.length) return null;

  const attachments = await OBR.scene.items.getItemAttachments(state.selectionIds);

  const root = attachments.find((item) => item.metadata?.[CLOCK_KEY]?.kind === "root");
  if (!root) return null;

  const data = root.metadata?.[CLOCK_KEY];
  return { root, attachments, data };
}

async function refreshEditPanel() {
  const editContent = $("editContent");
  const info = await getSelectedClockRoot();

  if (!info) {
    state.selectedClock = null;
    editContent.innerHTML = `
      <div class="help">
        Select any part of a clock in the scene, then switch back here to advance, reset, or delete it.
      </div>
    `;
    return;
  }

  state.selectedClock = info;

  const { root, data } = info;
  const filled = Number(data?.filled ?? 0);
  const segments = Number(data?.segments ?? 0);
  const name = String(data?.name || root.name || "Clock");
  const progress = `${filled}/${segments}`;

  editContent.innerHTML = `
    <div class="clock-card">
      <div class="clock-title">${escapeHtml(name)}</div>
      <div class="clock-meta">${progress} filled · ${escapeHtml(String(data?.color ?? state.color))}</div>
      <div class="button-row">
        <button class="mini-btn advance" id="advanceBtn">Advance</button>
        <button class="mini-btn retreat" id="retreatBtn">Retreat</button>
        <button class="mini-btn reset" id="resetBtn">Reset</button>
        <button class="mini-btn delete" id="deleteBtn">Delete</button>
      </div>
    </div>
  `;

  $("advanceBtn").disabled = filled >= segments;
  $("retreatBtn").disabled = filled <= 0;
  $("resetBtn").disabled = filled === 0;
  $("deleteBtn").disabled = false;

  $("advanceBtn").onclick = () => advanceSelectedClock(1);
  $("retreatBtn").onclick = () => retreatSelectedClock(1);
  $("resetBtn").onclick = () => resetSelectedClock();
  $("deleteBtn").onclick = () => deleteSelectedClock();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function updateItemsByIds(ids, updater) {
  await OBR.scene.items.updateItems(ids, updater);
}

async function fillWedge(wedgeId, color) {
  await updateItemsByIds([wedgeId], (items) => {
    const wedge = items[0];
    if (!wedge || wedge.type !== "PATH") return;
    wedge.style.fillColor = color;
    wedge.style.fillOpacity = 1;
  });
}

async function clearWedge(wedgeId) {
  await updateItemsByIds([wedgeId], (items) => {
    const wedge = items[0];
    if (!wedge || wedge.type !== "PATH") return;
    wedge.style.fillColor = DARK_FILL;
    wedge.style.fillOpacity = 1;
  });
}

async function setRootMetadata(root, data) {
  await updateItemsByIds([root.id], (items) => {
    const item = items[0];
    if (!item) return;
    item.metadata = {
      ...(item.metadata || {}),
      [CLOCK_KEY]: data,
    };
    item.name = data.name || item.name;
  });
}

async function advanceSelectedClock(count = 1) {
  const info = state.selectedClock || await getSelectedClockRoot();
  if (!info) return;

  const { root, data } = info;
  let filled = Number(data?.filled ?? 0);
  const segments = Number(data?.segments ?? 0);
  const color = String(data?.color ?? state.color);
  const wedgeIds = Array.isArray(data?.wedgeIds) ? data.wedgeIds : [];

  const target = Math.min(segments, filled + count);
  while (filled < target) {
    const wedgeId = wedgeIds[filled];
    if (!wedgeId) break;
    await fillWedge(wedgeId, color);
    filled += 1;
  }

  const nextData = { ...data, filled };
  await setRootMetadata(root, nextData);
  state.selectedClock = {
    ...info,
    data: nextData,
  };

  await refreshEditPanel();
}

async function retreatSelectedClock(count = 1) {
  const info = state.selectedClock || await getSelectedClockRoot();
  if (!info) return;

  const { root, data } = info;
  let filled = Number(data?.filled ?? 0);
  const color = String(data?.color ?? state.color);
  const wedgeIds = Array.isArray(data?.wedgeIds) ? data.wedgeIds : [];

  const target = Math.max(0, filled - count);
  while (filled > target) {
    filled -= 1;
    const wedgeId = wedgeIds[filled];
    if (!wedgeId) break;
    await clearWedge(wedgeId);
  }

  const nextData = { ...data, filled };
  await setRootMetadata(root, nextData);
  state.selectedClock = { ...info, data: nextData };

  await refreshEditPanel();
}

async function resetSelectedClock() {
  const info = state.selectedClock || await getSelectedClockRoot();
  if (!info) return;

  const { root, data, attachments } = info;
  const wedgeIds = Array.isArray(data?.wedgeIds) ? data.wedgeIds : [];
  for (const wedgeId of wedgeIds) {
    await clearWedge(wedgeId);
  }

  const nextData = { ...data, filled: 0 };
  await setRootMetadata(root, nextData);

  state.selectedClock = {
    ...info,
    data: nextData,
    attachments,
  };

  await refreshEditPanel();
}

async function deleteSelectedClock() {
  const info = state.selectedClock || await getSelectedClockRoot();
  if (!info) return;

  const ids = info.attachments.map((item) => item.id);
  await OBR.scene.items.deleteItems(ids);
  state.selectedClock = null;
  await refreshEditPanel();
}

function registerUI() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((el) => el.classList.remove("active"));
      tab.classList.add("active");
      $(`panel-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "edit") {
        refreshEditPanel();
      }
    });
  });

  document.querySelectorAll(".seg-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.segments = Number(button.dataset.segments);
      selectSegmentButton(state.segments);
      $("customSegments").value = "";
      syncPreview();
    });
  });

  $("customColor").addEventListener("input", (event) => {
    state.color = String(event.target.value);
    selectColorButton(state.color);
    syncPreview();
  });

  $("customSegments").addEventListener("input", (event) => {
    const val = parseInt(event.target.value, 10);
    if (!isNaN(val) && val >= 2 && val <= 20) {
      state.segments = val;
      // Deselect all preset buttons since we're using a custom value
      document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      syncPreview();
    }
  });

  $("placeBtn").addEventListener("click", createClock);
}

function startSelectionPolling() {
  const tick = async () => {
    try {
      if ($("panel-edit").classList.contains("active")) {
        await refreshEditPanel();
      } else {
        state.selectionIds = (await OBR.player.getSelection()) || [];
      }
    } catch (error) {
      console.error(error);
    }
  };

  tick();
  setInterval(tick, 500);
}

function init() {
  createColorButtons();
  selectSegmentButton(state.segments);
  $("customColor").value = state.color;
  syncPreview();
  registerUI();
  startSelectionPolling();
}

OBR.onReady(() => {
  init();
});
