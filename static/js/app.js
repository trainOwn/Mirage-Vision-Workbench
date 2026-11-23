const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const goBtn = document.getElementById("go");
const clearBtn = document.getElementById("clear");
const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const previewEl = document.getElementById("preview");
const fnameEl = document.getElementById("fname");
const fsizeEl = document.getElementById("fsize");
const timingEl = document.getElementById("timing");
const metaEl = document.getElementById("meta");
const toggleSpotlight = document.getElementById("toggleSpotlight");

const objListWrap = document.getElementById("objListWrap");
const objList = document.getElementById("objList");
const objCount = document.getElementById("objCount");
const sceneWrap = document.getElementById("sceneWrap");
const scenePills = document.getElementById("scenePills");
const textWrap = document.getElementById("textWrap");
const textList = document.getElementById("textList");
const textCount = document.getElementById("textCount");
const regionsWrap = document.getElementById("regionsWrap");
const regionsList = document.getElementById("regionsList");
const regionsCount = document.getElementById("regionsCount");
const relWrap = document.getElementById("relWrap");
const relList = document.getElementById("relList");
const relCount = document.getElementById("relCount");
const eventsWrap = document.getElementById("eventsWrap");
const eventsList = document.getElementById("eventsList");
const eventsCount = document.getElementById("eventsCount");
const inspectorEmpty = document.getElementById("inspectorEmpty");
const confRow = document.getElementById("confRow");
const confRange = document.getElementById("confRange");
const confVal = document.getElementById("confVal");
const copyJsonBtn = document.getElementById("copyJson");
const thumbWrap = document.getElementById("thumbWrap");
const thumb = document.getElementById("thumb");
const descWrap = document.getElementById("descWrap");
const descBody = document.getElementById("descBody");
const descLang = document.getElementById("descLang");

const PANEL_FOR_LAYER = {
  scene: sceneWrap,
  objects: objListWrap,
  regions: regionsWrap,
  text: textWrap,
  relations: relWrap,
  events: eventsWrap,
  reasoning: descWrap,
};
const CANVAS_LAYERS = new Set(["objects", "text", "relations", "events"]);

let minScore = 0;
// Items without a numeric score always pass so unscored data stays visible.
function passesScore(item) {
  return !item || typeof item.score !== "number" || item.score >= minScore;
}

for (const [headId, wrapId] of [
  ["sceneHead", "sceneWrap"],
  ["objHead", "objListWrap"],
  ["regionsHead", "regionsWrap"],
  ["textHead", "textWrap"],
  ["relHead", "relWrap"],
  ["eventsHead", "eventsWrap"],
]) {
  const head = document.getElementById(headId);
  const wrap = document.getElementById(wrapId);
  head.addEventListener("click", () => {
    const collapsed = wrap.classList.toggle("collapsed");
    head.setAttribute("aria-expanded", String(!collapsed));
  });
}

function renderDescription() {
  // Pipe-separated reasoning string -> one paragraph per segment.
  // A leading "lang: xx" segment becomes the header pill instead of prose.
  const reasoning =
    lastResult && typeof lastResult.reasoning === "string" ? lastResult.reasoning : "";
  const segments = reasoning.split("|").map((s) => s.trim()).filter(Boolean);
  if (!segments.length) {
    descWrap.hidden = true;
    return;
  }
  const lang = segments[0].match(/^lang:\s*(\w+)$/i);
  const prose = lang ? segments.slice(1) : segments;
  descLang.hidden = !lang;
  if (lang) descLang.textContent = lang[1];
  descBody.innerHTML = "";
  prose.forEach((text, i) => {
    const p = document.createElement("p");
    if (i === prose.length - 1 && /^(cannot|can't|unable|unknown)/i.test(text)) p.className = "dim";
    p.textContent = text;
    descBody.appendChild(p);
  });
  descWrap.hidden = !prose.length;
}

const SCENE_KEYS = ["setting", "lighting", "weather", "time_of_day"];

let file = null;
let objectUrl = null;
let loadedImage = null;
let lastResult = null;
let hoveredIndex = -1;
let selectedIndex = -1;
let hoveredTextIndex = -1;

const PALETTE = [
  "#6ea8fe", "#3dd68c", "#ffb224", "#ff6369", "#c792ea",
  "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#e879f9",
];

function setStatus(msg, kind = "") {
  statusEl.className = `status ${kind}`;
  statusEl.innerHTML = msg;
}

function colorFor(i) {
  return PALETTE[i % PALETTE.length];
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Mirage coordinates live in 0-1000 normalized space; canvas is natural image size.
function toPixels(bbox, w, h) {
  const [x1, y1, x2, y2] = bbox;
  return [(x1 / 1000) * w, (y1 / 1000) * h, (x2 / 1000) * w, (y2 / 1000) * h];
}

function objectPath(obj, w, h) {
  if (!obj) return null;
  if (Array.isArray(obj.mask) && obj.mask.length >= 6) {
    const p = new Path2D();
    for (let k = 0; k + 1 < obj.mask.length; k += 2) {
      const px = (obj.mask[k] / 1000) * w;
      const py = (obj.mask[k + 1] / 1000) * h;
      if (k === 0) p.moveTo(px, py);
      else p.lineTo(px, py);
    }
    p.closePath();
    return p;
  }
  if (Array.isArray(obj.bbox) && obj.bbox.length === 4) {
    const [px1, py1, px2, py2] = toPixels(obj.bbox, w, h);
    const p = new Path2D();
    p.rect(px1, py1, px2 - px1, py2 - py1);
    return p;
  }
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image."));
    img.src = url;
  });
}

function idToIndexMap() {
  const map = {};
  (lastResult?.objects || []).forEach((o, i) => {
    if (o && o.id !== undefined) map[o.id] = i;
  });
  return map;
}

function syncActiveList() {
  const active = hoveredIndex >= 0 ? hoveredIndex : selectedIndex;
  objList.querySelectorAll(".obj-item").forEach((li) => {
    li.classList.toggle("active", Number(li.dataset.index) === active);
  });
}

function setHovered(i) {
  if (i === hoveredIndex) return;
  hoveredIndex = i;
  syncActiveList();
  redraw();
}

function describeBits(obj) {
  const bits = [];
  if (obj.position) bits.push(obj.position);
  if (obj.description && typeof obj.description === "object") {
    ["color", "shape", "state", "material"].forEach((k) => {
      if (obj.description[k]) bits.push(obj.description[k]);
    });
  }
  return bits.join(" · ");
}

function renderScene() {
  const scene = lastResult?.scene || null;
  scenePills.innerHTML = "";
  if (!scene) {
    sceneWrap.hidden = true;
    return;
  }
  const ordered = [
    ...SCENE_KEYS.filter((k) => scene[k]),
    ...Object.keys(scene).filter((k) => !SCENE_KEYS.includes(k) && scene[k]),
  ];
  const pills = ordered.map((k) => {
    const pill = document.createElement("span");
    pill.className = "scene-pill";
    const key = document.createElement("span");
    key.className = "k";
    key.textContent = k.replace(/_/g, " ");
    const val = document.createElement("span");
    val.className = "v";
    val.textContent = typeof scene[k] === "object" ? JSON.stringify(scene[k]) : String(scene[k]);
    pill.append(key, val);
    return pill;
  });
  if (!pills.length) {
    sceneWrap.hidden = true;
    return;
  }
  scenePills.append(...pills);
  sceneWrap.hidden = false;
}

function renderObjList() {
  const objects = lastResult?.objects || [];
  objList.innerHTML = "";
  if (!objects.length) {
    objListWrap.hidden = true;
    return;
  }
  objListWrap.hidden = false;
  let shown = 0;
  objects.forEach((obj, i) => {
    if (!passesScore(obj)) return;
    shown++;
    const li = document.createElement("li");
    li.className = "obj-item";
    li.dataset.index = String(i);
    const color = colorFor(i);
    const score = typeof obj.score === "number" ? obj.score.toFixed(2) : "—";
    const bits = describeBits(obj);
    li.innerHTML = `<span class="dot"></span><span class="name"></span><span class="meta"></span>`;
    li.querySelector(".dot").style.background = color;
    li.querySelector(".name").textContent = obj.name || "object";
    li.querySelector(".meta").textContent = score + (bits ? ` · ${bits}` : "");
    li.title = bits || obj.name || "object";
    li.addEventListener("mouseenter", () => setHovered(i));
    li.addEventListener("mouseleave", () => setHovered(-1));
    li.addEventListener("click", () => {
      selectedIndex = selectedIndex === i ? -1 : i;
      syncActiveList();
      redraw();
    });
    objList.appendChild(li);
  });
  objCount.textContent =
    shown < objects.length
      ? `${shown} of ${objects.length} objects`
      : objects.length + (objects.length === 1 ? " object" : " objects");
  syncActiveList();
}

function renderRegionsList() {
  const regions = lastResult?.regions || [];
  regionsList.innerHTML = "";
  if (!regions.length) {
    regionsWrap.hidden = true;
    return;
  }
  regionsWrap.hidden = false;
  regions.forEach((r) => {
    const li = document.createElement("li");
    li.className = "obj-item";
    const bits = [r.position, ...Object.values(r.description || {})].filter(Boolean).join(" · ");
    li.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    li.querySelector(".name").textContent = r.name || "region";
    li.querySelector(".meta").textContent = bits;
    regionsList.appendChild(li);
  });
  regionsCount.textContent = regions.length + (regions.length === 1 ? " region" : " regions");
}

function renderRelList() {
  const relations = lastResult?.relations || [];
  const idToName = {};
  (lastResult?.objects || []).forEach((o) => {
    if (o && o.id !== undefined) idToName[o.id] = o.name || "object";
  });
  relList.innerHTML = "";
  if (!relations.length) {
    relWrap.hidden = true;
    return;
  }
  relWrap.hidden = false;
  relations.forEach((r) => {
    const subject = idToName[r.subject] || `#${r.subject}`;
    const object = idToName[r.object] || `#${r.object}`;
    const li = document.createElement("li");
    li.className = "obj-item";
    li.innerHTML = `<span class="name"></span>`;
    li.querySelector(".name").textContent = `${subject} → ${r.predicate} → ${object}`;
    relList.appendChild(li);
  });
  relCount.textContent = relations.length + (relations.length === 1 ? " relation" : " relations");
}

function renderEventsList() {
  const events = lastResult?.events || [];
  const idToName = {};
  (lastResult?.objects || []).forEach((o) => {
    if (o && o.id !== undefined) idToName[o.id] = o.name || "object";
  });
  eventsList.innerHTML = "";
  if (!events.length) {
    eventsWrap.hidden = true;
    return;
  }
  eventsWrap.hidden = false;
  events.forEach((e) => {
    const li = document.createElement("li");
    li.className = "obj-item";
    li.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    li.querySelector(".name").textContent = idToName[e.actor] || `#${e.actor}`;
    li.querySelector(".meta").textContent = e.action || "";
    eventsList.appendChild(li);
  });
  eventsCount.textContent = events.length + (events.length === 1 ? " event" : " events");
}

async function copyString(s) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

function setHoveredText(i) {
  if (i === hoveredTextIndex) return;
  hoveredTextIndex = i;
  textList.querySelectorAll(".obj-item").forEach((li) => {
    li.classList.toggle("active", Number(li.dataset.index) === i);
  });
  redraw();
}

function renderTextList() {
  const texts = lastResult?.text || [];
  textList.innerHTML = "";
  hoveredTextIndex = -1;
  if (!texts.length) {
    textWrap.hidden = true;
    syncInspector();
    return;
  }
  textWrap.hidden = false;
  let shownText = 0;
  texts.forEach((t, i) => {
    if (!passesScore(t)) return;
    shownText++;
    const li = document.createElement("li");
    li.className = "obj-item text-item";
    li.dataset.index = String(i);
    li.title = (t.string || "") + (t.string ? " — click to copy" : "Click to copy");
    li.innerHTML = `<span class="quote">&ldquo;</span><span class="name"></span><span class="quote">&rdquo;</span><span class="meta"></span>`;
    li.querySelector(".name").textContent = t.string || "(unreadable)";
    li.querySelector(".meta").textContent =
      typeof t.score === "number" ? `${t.score.toFixed(2)} · click to copy` : "click to copy";
    li.addEventListener("mouseenter", () => setHoveredText(i));
    li.addEventListener("mouseleave", () => setHoveredText(-1));
    li.addEventListener("click", async () => {
      if (!t.string) return;
      const ok = await copyString(t.string);
      const meta = li.querySelector(".meta");
      const orig = meta.textContent;
      meta.textContent = ok ? "copied ✓" : "copy failed";
      setTimeout(() => {
        meta.textContent = orig;
      }, 1200);
    });
    textList.appendChild(li);
  });
  textCount.textContent =
    shownText < texts.length
      ? `${shownText} of ${texts.length} strings`
      : texts.length + (texts.length === 1 ? " string" : " strings");
  syncInspector();
}

function syncInspector() {
  inspectorEmpty.style.display =
    sceneWrap.hidden && objListWrap.hidden && regionsWrap.hidden && textWrap.hidden && relWrap.hidden && eventsWrap.hidden
      ? ""
      : "none";
  confRow.hidden = !lastResult;
}

function pickObjectAt(nx, ny) {
  const objects = lastResult?.objects || [];
  let best = -1;
  let bestArea = Infinity;
  objects.forEach((obj, i) => {
    if (!obj || !Array.isArray(obj.bbox) || obj.bbox.length !== 4) return;
    if (!passesScore(obj)) return;
    const [x1, y1, x2, y2] = obj.bbox;
    if (nx < x1 || nx > x2 || ny < y1 || ny > y2) return;
    const area = (x2 - x1) * (y2 - y1);
    if (area < bestArea) {
      bestArea = area;
      best = i;
    }
  });
  return best;
}

canvas.addEventListener("mousemove", (e) => {
  if (!loadedImage || !lastResult) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const nx = ((e.clientX - rect.left) / rect.width) * 1000;
  const ny = ((e.clientY - rect.top) / rect.height) * 1000;
  setHovered(pickObjectAt(nx, ny));
  canvas.style.cursor = hoveredIndex >= 0 ? "pointer" : "default";
});
canvas.addEventListener("mouseleave", () => setHovered(-1));
canvas.addEventListener("click", () => {
  selectedIndex = hoveredIndex >= 0 && selectedIndex !== hoveredIndex ? hoveredIndex : -1;
  syncActiveList();
  redraw();
});

function layerOn(name) {
  const cb = document.querySelector(`#overlayControls input[data-layer="${name}"]`);
  return !cb || cb.checked;
}

async function redraw() {
  if (!loadedImage) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const w = loadedImage.naturalWidth;
  const h = loadedImage.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(loadedImage, 0, 0, w, h);

  // Spotlight: dim everything except the selected object's mask.
  if (lastResult && toggleSpotlight.checked && selectedIndex >= 0) {
    const sel = lastResult.objects[selectedIndex];
    const cutout = passesScore(sel) ? objectPath(sel, w, h) : null;
    if (cutout) {
      const dim = document.createElement("canvas");
      dim.width = w;
      dim.height = h;
      const dctx = dim.getContext("2d");
      dctx.fillStyle = "rgba(4,7,14,0.62)";
      dctx.fillRect(0, 0, w, h);
      dctx.globalCompositeOperation = "destination-out";
      dctx.fill(cutout);
      ctx.drawImage(dim, 0, 0);
      ctx.save();
      ctx.strokeStyle = colorFor(selectedIndex);
      ctx.lineWidth = Math.max(2, Math.round(w / 200));
      ctx.stroke(cutout);
      ctx.restore();
    }
  }

  if (!lastResult) return;
  const fontSize = Math.max(12, Math.round(w / 42));
  ctx.font = `600 ${fontSize}px -apple-system, Inter, Segoe UI, sans-serif`;
  ctx.textBaseline = "top";

  const objects = lastResult.objects || [];
  const activeIndex = hoveredIndex >= 0 ? hoveredIndex : selectedIndex;

  if (layerOn("objects")) {
    objects.forEach((obj, i) => {
      if (!obj || !Array.isArray(obj.mask) || obj.mask.length < 6) return;
      if (!passesScore(obj)) return;
      const color = colorFor(i);
      const isActive = i === activeIndex;
      ctx.save();
      if (activeIndex >= 0 && !isActive) ctx.globalAlpha = 0.25;
      ctx.beginPath();
      for (let k = 0; k + 1 < obj.mask.length; k += 2) {
        const px = (obj.mask[k] / 1000) * w;
        const py = (obj.mask[k + 1] / 1000) * h;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, isActive ? 0.5 : 0.28);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(color, 0.9);
      ctx.lineWidth = isActive ? Math.max(3, Math.round(w / 160)) : Math.max(1.5, Math.round(w / 320));
      ctx.stroke();
      ctx.restore();
    });
    objects.forEach((obj, i) => {
      if (!obj || !Array.isArray(obj.bbox) || obj.bbox.length !== 4) return;
      if (!passesScore(obj)) return;
      const [px1, py1, px2, py2] = toPixels(obj.bbox, w, h);
      const color = colorFor(i);
      const isActive = i === activeIndex;
      ctx.save();
      if (activeIndex >= 0 && !isActive) ctx.globalAlpha = 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? Math.max(4, Math.round(w / 140)) : Math.max(2, Math.round(w / 220));
      ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);

      const label = `${obj.name || "object"}${typeof obj.score === "number" ? ` ${obj.score.toFixed(2)}` : ""}`;
      const pad = 5;
      const textW = ctx.measureText(label).width;
      const boxH = fontSize + pad * 2;
      let by = py1 - boxH - 3;
      if (by < 0) by = py1 + 3;
      ctx.fillStyle = color;
      ctx.fillRect(px1, by, textW + pad * 2, boxH);
      ctx.fillStyle = "#081226";
      ctx.fillText(label, px1 + pad, by + pad);
      ctx.restore();
    });
  }

  if (layerOn("text")) {
    const texts = lastResult.text || [];
    ctx.setLineDash([6, 4]);
    texts.forEach((t, ti) => {
      if (!t || !Array.isArray(t.bbox) || t.bbox.length !== 4) return;
      if (!passesScore(t)) return;
      const [px1, py1, px2, py2] = toPixels(t.bbox, w, h);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = ti === hoveredTextIndex ? Math.max(3, Math.round(w / 140)) : Math.max(1.5, Math.round(w / 320));
      ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);
      if (t.string) {
        const label = `“${t.string}”${typeof t.score === "number" ? ` ${t.score.toFixed(2)}` : ""}`;
        const pad = 4;
        const textW = ctx.measureText(label).width;
        const boxH = fontSize + pad * 2;
        let by = py2 + 3;
        if (by + boxH > h) by = py1 - boxH - 3;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px1, by, textW + pad * 2, boxH);
        ctx.fillStyle = "#111";
        ctx.fillText(label, px1 + pad, by + pad);
      }
    });
    ctx.setLineDash([]);
  }

  if (layerOn("relations")) {
    const idx = idToIndexMap();
    (lastResult.relations || []).forEach((r) => {
      const si = idx[r.subject];
      const oi = idx[r.object];
      if (si === undefined || oi === undefined) return;
      const s = objects[si], o = objects[oi];
      if (!passesScore(s) || !passesScore(o)) return;
      const [sx1, sy1, sx2, sy2] = toPixels(s.bbox, w, h);
      const [ox1, oy1, ox2, oy2] = toPixels(o.bbox, w, h);
      const scx = (sx1 + sx2) / 2, scy = (sy1 + sy2) / 2;
      const ocx = (ox1 + ox2) / 2, ocy = (oy1 + oy2) / 2;
      ctx.save();
      ctx.strokeStyle = "#8b93a9";
      ctx.lineWidth = Math.max(1.5, Math.round(w / 320));
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(scx, scy);
      ctx.lineTo(ocx, ocy);
      ctx.stroke();
      ctx.setLineDash([]);
      const mx = (scx + ocx) / 2, my = (scy + ocy) / 2;
      const pad = 4;
      const textW = ctx.measureText(r.predicate).width;
      ctx.fillStyle = "#0e1422";
      ctx.strokeStyle = "#262e44";
      ctx.fillRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2);
      ctx.strokeRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = "#e8ecf4";
      ctx.fillText(r.predicate, mx - textW / 2, my - fontSize / 2);
      ctx.restore();
    });
  }

  if (layerOn("events")) {
    const idx = idToIndexMap();
    (lastResult.events || []).forEach((e) => {
      const ai = idx[e.actor];
      if (ai === undefined) return;
      const actor = objects[ai];
      if (!passesScore(actor) || !Array.isArray(actor.bbox)) return;
      const [, py1, px2] = toPixels(actor.bbox, w, h);
      const label = `⚡ ${e.action}`;
      const pad = 5;
      const textW = ctx.measureText(label).width;
      const boxH = fontSize + pad * 2;
      ctx.save();
      ctx.fillStyle = "#c792ea";
      ctx.fillRect(px2 - textW - pad * 2, py1 + 3, textW + pad * 2, boxH);
      ctx.fillStyle = "#1b0e2e";
      ctx.fillText(label, px2 - textW - pad, py1 + 3 + pad);
      ctx.restore();
    });
  }
}

async function selectFile(f) {
  if (!f) return;
  if (!f.type.startsWith("image/")) {
    setStatus("That file is not an image. Pick a JPG/PNG.", "err");
    return;
  }
  file = f;
  lastResult = null;
  hoveredIndex = -1;
  selectedIndex = -1;
  renderObjList();
  renderScene();
  renderRegionsList();
  renderRelList();
  renderEventsList();
  renderTextList();
  renderDescription();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(f);
  thumb.src = objectUrl;
  thumbWrap.hidden = false;
  try {
    loadedImage = await loadImage(objectUrl);
    await redraw();
  } catch (err) {
    setStatus(`Error: ${err.message}`, "err");
    return;
  }
  previewEl.classList.add("show");
  fnameEl.textContent = f.name;
  fsizeEl.textContent = `${(f.size / 1024).toFixed(1)} KB`;
  goBtn.disabled = false;
  setStatus("Ready — hit “Describe image”.", "ok");
}

drop.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => selectFile(e.target.files[0]));
["dragover", "dragenter"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files?.[0];
  selectFile(f);
});

document.querySelectorAll("#overlayControls input[data-layer]").forEach((cb) => {
  cb.addEventListener("change", () => {
    const layer = cb.dataset.layer;
    const panel = PANEL_FOR_LAYER[layer];
    if (panel) panel.style.display = cb.checked ? "" : "none";
    if (CANVAS_LAYERS.has(layer)) redraw();
  });
});
toggleSpotlight.addEventListener("change", redraw);

confRange.addEventListener("input", () => {
  minScore = confRange.value / 100;
  confVal.textContent = minScore.toFixed(2);
  const objs = lastResult?.objects || [];
  const texts = lastResult?.text || [];
  if (hoveredIndex >= 0 && !passesScore(objs[hoveredIndex])) hoveredIndex = -1;
  if (selectedIndex >= 0 && !passesScore(objs[selectedIndex])) selectedIndex = -1;
  if (hoveredTextIndex >= 0 && !passesScore(texts[hoveredTextIndex])) hoveredTextIndex = -1;
  renderObjList();
  renderTextList();
  redraw();
});

copyJsonBtn.addEventListener("click", async () => {
  const ok = await copyString(outEl.textContent);
  const orig = copyJsonBtn.textContent;
  copyJsonBtn.textContent = ok ? "Copied ✓" : "Copy failed";
  setTimeout(() => {
    copyJsonBtn.textContent = orig;
  }, 1200);
});

clearBtn.addEventListener("click", () => {
  file = null;
  fileInput.value = "";
  lastResult = null;
  hoveredIndex = -1;
  selectedIndex = -1;
  renderObjList();
  renderScene();
  renderRegionsList();
  renderRelList();
  renderEventsList();
  renderTextList();
  renderDescription();
  loadedImage = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  thumb.removeAttribute("src");
  thumbWrap.hidden = true;
  minScore = 0;
  confRange.value = "0";
  confVal.textContent = "0.00";
  goBtn.disabled = true;
  previewEl.classList.remove("show");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.removeAttribute("width");
  outEl.innerHTML = '<span class="empty">// Cleared. Pick another image.</span>';
  timingEl.textContent = "—";
  metaEl.textContent = "";
  setStatus("No image selected.");
});

goBtn.addEventListener("click", async () => {
  if (!file) return;
  goBtn.disabled = true;
  const t0 = performance.now();
  setStatus('<span class="spinner"></span>Running cactus.Mirage().describe()…', "loading");
  outEl.textContent = "…";
  try {
    const fd = new FormData();
    fd.append("image", file, file.name);
    const res = await fetch("/api/describe", { method: "POST", body: fd });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text.slice(0, 500) || `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    lastResult = data.result;
    hoveredIndex = -1;
    selectedIndex = -1;
    renderObjList();
    renderScene();
    renderRegionsList();
    renderRelList();
    renderEventsList();
    renderDescription();
    renderTextList();
    await redraw();
    const dt = ((performance.now() - t0) / 1000).toFixed(2);
    outEl.textContent = JSON.stringify(data.result, null, 2);
    timingEl.textContent = `${dt}s`;
    const n = (data.result.objects || []).length;
    metaEl.textContent = `${data.filename} → ${n} object(s) · server ${(data.serverMs / 1000).toFixed(2)}s · ` +
      `CPU ${data.cpuPercent}% · RAM ${data.memUsedMb}/${data.memTotalMb} MB (proc ${data.processRssMb} MB) · NPU: ${data.npu}`;
    setStatus(`Done in ${dt}s — ${n} object(s) boxed on canvas.`, "ok");
  } catch (err) {
    setStatus(`Error: ${err.message || err}`, "err");
    outEl.textContent = `ERROR\n\n${err.message || err}`;
  } finally {
    goBtn.disabled = !file;
  }
});
