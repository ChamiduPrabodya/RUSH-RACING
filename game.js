// 2D Car Racing (canvas, no libraries)

const canvas = document.getElementById("game");
const stage = document.getElementById("stage");
const ctx = canvas.getContext("2d", { alpha: false });

const hud = document.getElementById("hud");
const hudScore = document.getElementById("hudScore");
const hudBest = document.getElementById("hudBest");
const pauseBtn = document.getElementById("pauseBtn");

const menu = document.getElementById("menu");
const playBtn = document.getElementById("playBtn");
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");

const gameOver = document.getElementById("gameOver");
const goScore = document.getElementById("goScore");
const goBest = document.getElementById("goBest");
const goNew = document.getElementById("goNew");
const homeBtn = document.getElementById("homeBtn");
const restartBtn = document.getElementById("restartBtn");

const touch = document.getElementById("touch");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, bInclusive) => Math.floor(a + Math.random() * (bInclusive - a + 1));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const STORAGE_BEST = "car_racing_best_v1";
const STORAGE_SOUND = "car_racing_sound_v1";

const view = { w: 1, h: 1, dpr: 1 };
const layout = {
  lanes: 3,
  roadLeft: 0,
  roadRight: 0,
  roadW: 0,
  laneW: 0,
  playerY: 0,
  carW: 0,
  carH: 0,
  curbW: 0,
  sidewalkW: 0,
};

const input = {
  left: false,
  right: false,
  pause: false,
  restart: false,
};
const touchState = { left: false, right: false };
const keysDown = new Set();

const setKey = (key, pressed) => {
  if (pressed) keysDown.add(key);
  else keysDown.delete(key);
};

document.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", " ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  setKey(e.key, true);
});
document.addEventListener("keyup", (e) => setKey(e.key, false));

const bindTouchButton = (btn) => {
  const id = btn.dataset.touch;
  const setPressed = (pressed) => {
    if (id === "left") touchState.left = pressed;
    if (id === "right") touchState.right = pressed;
  };

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    setPressed(true);
  });
  const up = (e) => {
    e.preventDefault();
    setPressed(false);
  };
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
};

for (const btn of touch.querySelectorAll(".touchBtn")) bindTouchButton(btn);

const audio = {
  enabled: true,
  ctx: null,
  master: null,
};

const ensureAudio = () => {
  if (!audio.enabled) return;
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.18;
  audio.master.connect(audio.ctx.destination);
};

const beep = (freq, duration = 0.08, type = "sine") => {
  if (!audio.enabled) return;
  ensureAudio();
  if (!audio.ctx || !audio.master) return;
  const t0 = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1.0, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

const sfx = {
  click() {
    beep(420, 0.06, "square");
  },
  move() {
    beep(620, 0.05, "triangle");
  },
  crash() {
    beep(140, 0.12, "sawtooth");
    setTimeout(() => beep(90, 0.14, "sawtooth"), 20);
  },
};

const state = {
  mode: "menu", // menu | countdown | playing | paused | gameover
  sound: true,
  best: 0,

  time: 0,
  speed: 0,
  distance: 0,
  scroll: 0,
  score: 0,
  passed: 0,

  lane: 1,
  x: 0,
  crashT: 0,
  shakeT: 0,
  shakeMag: 0,

  countdownT: 0,
  countdownLast: 0,
  pauseReturnMode: "playing",

  spawnT: 0,
  objects: [], // traffic
  particles: [],
  popups: [],
  bonus: 0,
};

const loadPrefs = () => {
  const best = Number.parseInt(localStorage.getItem(STORAGE_BEST) || "0", 10);
  state.best = Number.isFinite(best) ? best : 0;
  const snd = localStorage.getItem(STORAGE_SOUND);
  state.sound = snd === null ? true : snd === "1";
  audio.enabled = state.sound;
  soundIcon.textContent = state.sound ? "🔊" : "🔇";
  hudBest.textContent = String(state.best);
  goBest.textContent = String(state.best);
};

const saveBest = () => localStorage.setItem(STORAGE_BEST, String(state.best));
const saveSound = () => localStorage.setItem(STORAGE_SOUND, state.sound ? "1" : "0");

const laneCenterX = (lane) => layout.roadLeft + layout.laneW * (lane + 0.5);

const resize = () => {
  const rect = stage.getBoundingClientRect();
  view.w = Math.max(1, rect.width);
  view.h = Math.max(1, rect.height);
  view.dpr = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = Math.floor(view.w * view.dpr);
  canvas.height = Math.floor(view.h * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  layout.roadW = clamp(view.w * 0.64, 260, view.w - 60);
  layout.roadLeft = (view.w - layout.roadW) / 2;
  layout.roadRight = layout.roadLeft + layout.roadW;
  layout.laneW = layout.roadW / layout.lanes;

  const s = clamp(view.w / 430, 0.95, 1.35);
  layout.carW = 50 * s;
  layout.carH = 100 * s;
  layout.playerY = view.h - layout.carH * 0.62 - 22 * s;
  layout.curbW = 8 * s;
  layout.sidewalkW = 36 * s;

  state.x = laneCenterX(state.lane);

  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  touch.classList.toggle("hidden", !(coarse || view.w < 520));
};

window.addEventListener("resize", resize);
window.addEventListener("load", resize);
resize();

const rectOverlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
  Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const lanesBlockedSoon = () => {
  // "Soon" window above the player: if all lanes are blocked here, the player has no escape.
  const blocked = new Set();
  const yMin = -layout.carH * 3.2;
  const yMax = layout.playerY - layout.carH * 0.35;
  for (const o of state.objects) {
    if (o.y < yMin || o.y > yMax) continue;
    blocked.add(o.lane);
  }
  return blocked;
};

const laneHasNearbyObject = (lane, y, h) => {
  for (const o of state.objects) {
    if (o.lane !== lane) continue;
    const pad = (o.h + h) * 0.55;
    if (o.y < y + pad && o.y > y - pad) return true;
  }
  return false;
};

const pickSafeLane = (spawnY, spawnH) => {
  const blocked = lanesBlockedSoon();
  const lanes = shuffle([...Array(layout.lanes).keys()]);
  for (const lane of lanes) {
    // Don't stack objects too close in the same lane.
    if (laneHasNearbyObject(lane, spawnY, spawnH)) continue;

    // Never create a full "wall": keep at least one lane open soon.
    const wouldBlockAll = blocked.size >= layout.lanes - 1 && !blocked.has(lane);
    if (wouldBlockAll) continue;
    return lane;
  }
  return null;
};

const spawnTraffic = (difficulty01 = 0) => {
  const d = clamp(difficulty01, 0, 1);
  const vehicleTypes = [
    { type: "car", w: 1.0, h: 1.0, weight: lerp(7.2, 3.4, d) },
    { type: "police", w: 1.0, h: 1.0, weight: lerp(1.4, 2.2, d) },
    { type: "ambulance", w: 1.02, h: 1.04, weight: lerp(1.3, 2.0, d) },
    { type: "truck", w: 1.08, h: 1.22, weight: lerp(1.1, 3.1, d) },
  ];
  const totalW = vehicleTypes.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * totalW;
  let picked = vehicleTypes[0];
  for (const vt of vehicleTypes) {
    r -= vt.weight;
    if (r <= 0) {
      picked = vt;
      break;
    }
  }

  const h = layout.carH * picked.h;
  const w = layout.carW * picked.w;
  const y = -h * rand(1.25, 2.35);
  const lane = pickSafeLane(y, h);
  if (lane === null) return false;
  const x = laneCenterX(lane);
  let color = "#ff8a00";
  let outline = "rgba(255,255,255,0.35)";
  if (picked.type === "car") {
    const palette = ["#ff8a00", "#22c55e", "#60a5fa", "#a78bfa", "#fb7185", "#fbbf24"];
    color = palette[randInt(0, palette.length - 1)];
    outline = "rgba(255,255,255,0.30)";
  } else if (picked.type === "police") {
    color = "#f8fafc";
    outline = "rgba(17,24,39,0.55)";
  } else if (picked.type === "ambulance") {
    color = "#f8fafc";
    outline = "rgba(17,24,39,0.55)";
  } else if (picked.type === "truck") {
    const palette = ["#f97316", "#22c55e", "#60a5fa"];
    color = palette[randInt(0, palette.length - 1)];
    outline = "rgba(255,255,255,0.28)";
  }

  state.objects.push({
    kind: "traffic",
    vehicle: picked.type,
    lane,
    x,
    y,
    w,
    h,
    color,
    outline,
    scored: false,
    near: false,
  });
  return true;
};

const addPopup = (x, y, text, color = "rgba(255,255,255,0.95)") => {
  state.popups.push({
    x,
    y,
    text,
    color,
    life: 0.9,
    max: 0.9,
    vy: -38,
  });
};

const addParticles = (x, y, count, baseColor) => {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(80, 520);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(2, 5),
      life: rand(0.35, 0.85),
      max: 1,
      color: baseColor,
    });
  }
};

const crash = () => {
  if (state.mode !== "playing") return;
  state.mode = "gameover";
  state.crashT = 0.85;
  state.shakeT = 0.25;
  state.shakeMag = 16;
  addParticles(state.x, layout.playerY - layout.carH * 0.1, 36, "#ffd43b");
  addParticles(state.x, layout.playerY, 18, "#ff2a2a");
  sfx.crash();

  // Update best score.
  let isNew = false;
  if (state.score > state.best) {
    state.best = state.score;
    saveBest();
    isNew = true;
  }
  goNew.classList.toggle("hidden", !isNew);
  goScore.textContent = String(state.score);
  goBest.textContent = String(state.best);
  hudBest.textContent = String(state.best);
  gameOver.classList.remove("hidden");
  hud.classList.add("hidden");
};

const startGame = () => {
  state.mode = "countdown";
  state.time = 0;
  state.speed = 560;
  state.distance = 0;
  state.scroll = 0;
  state.score = 0;
  state.passed = 0;
  state.bonus = 0;
  state.lane = 1;
  state.x = laneCenterX(state.lane);
  state.spawnT = 0;
  state.objects = [];
  state.particles = [];
  state.popups = [];
  state.crashT = 0;
  state.shakeT = 0;
  state.shakeMag = 0;
  state.countdownT = 3.0;
  state.countdownLast = 3;
  state.pauseReturnMode = "countdown";

  menu.classList.add("hidden");
  gameOver.classList.add("hidden");
  hud.classList.remove("hidden");
  hudScore.textContent = "0";
  hudBest.textContent = String(state.best);

  // Seed
  for (let i = 0; i < 3; i++) spawnTraffic(0);
};

const goHome = () => {
  state.mode = "menu";
  menu.classList.remove("hidden");
  gameOver.classList.add("hidden");
  hud.classList.add("hidden");
};

const togglePause = () => {
  if (state.mode === "playing" || state.mode === "countdown") {
    state.pauseReturnMode = state.mode;
    state.mode = "paused";
  } else if (state.mode === "paused") {
    state.mode = state.pauseReturnMode || "playing";
  }
};

const updateInput = () => {
  const down = (k) => keysDown.has(k);
  input.left = touchState.left || down("ArrowLeft") || down("a") || down("A");
  input.right = touchState.right || down("ArrowRight") || down("d") || down("D");
  input.pause = down("p") || down("P");
  input.restart = down("r") || down("R");
};

let lastLeft = false;
let lastRight = false;
let lastPause = false;
let lastRestart = false;

const handleOneShots = () => {
  const leftNow = input.left;
  const rightNow = input.right;
  const pauseNow = input.pause;
  const restartNow = input.restart;

  if (state.mode === "playing" || state.mode === "paused" || state.mode === "countdown") {
    if (pauseNow && !lastPause) togglePause();
  }

  if (restartNow && !lastRestart) {
    if (state.mode === "playing" || state.mode === "paused" || state.mode === "countdown") startGame();
  }

  if (state.mode === "playing" || state.mode === "countdown") {
    if (leftNow && !lastLeft) {
      state.lane = clamp(state.lane - 1, 0, layout.lanes - 1);
      sfx.move();
    }
    if (rightNow && !lastRight) {
      state.lane = clamp(state.lane + 1, 0, layout.lanes - 1);
      sfx.move();
    }
  }

  lastLeft = leftNow;
  lastRight = rightNow;
  lastPause = pauseNow;
  lastRestart = restartNow;
};

playBtn.addEventListener("click", () => {
  sfx.click();
  startGame();
});
restartBtn.addEventListener("click", () => {
  sfx.click();
  startGame();
});
homeBtn.addEventListener("click", () => {
  sfx.click();
  goHome();
});
pauseBtn.addEventListener("click", () => {
  sfx.click();
  togglePause();
});
soundBtn.addEventListener("click", () => {
  state.sound = !state.sound;
  audio.enabled = state.sound;
  soundIcon.textContent = state.sound ? "🔊" : "🔇";
  saveSound();
  sfx.click();
});

const drawRoundedRect = (x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const drawRoad = (scroll, tNow) => {
  const curveDir = Math.sin(tNow * 0.17);
  const curveMag = curveDir * clamp(view.w * 0.10, 14, 46);
  const curveAt = (y) => curveMag * Math.pow(clamp(y / view.h, 0, 1), 2);

  // Background base (sidewalk tone)
  ctx.fillStyle = "#2b2f3a";
  ctx.fillRect(0, 0, view.w, view.h);

  // Sidewalk tile pattern
  const tile = 26;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let y = 0; y < view.h + tile; y += tile) {
    for (let x = 0; x < layout.roadLeft; x += tile) {
      if (((x / tile) ^ (y / tile)) & 1) ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
    for (let x = layout.roadRight; x < view.w; x += tile) {
      if (((x / tile) ^ (y / tile)) & 1) ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }

  // Road shape (slight curve)
  const segs = 18;
  const leftXs = [];
  const rightXs = [];
  for (let i = 0; i <= segs; i++) {
    const y = (i / segs) * view.h;
    const off = curveAt(y);
    leftXs.push(layout.roadLeft + off);
    rightXs.push(layout.roadRight + off);
  }

  const rg = ctx.createLinearGradient(layout.roadLeft, 0, layout.roadRight, 0);
  rg.addColorStop(0, "#1a1d26");
  rg.addColorStop(0.5, "#171a22");
  rg.addColorStop(1, "#1a1d26");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(leftXs[0], 0);
  for (let i = 1; i < leftXs.length; i++) ctx.lineTo(leftXs[i], (i / segs) * view.h);
  for (let i = rightXs.length - 1; i >= 0; i--) ctx.lineTo(rightXs[i], (i / segs) * view.h);
  ctx.closePath();
  ctx.fill();

  // Curbs + edge lines (segmented so they follow the curve)
  const stripeStep = 14;
  for (let y = 0; y < view.h + stripeStep; y += stripeStep) {
    const off = curveAt(y + stripeStep * 0.5);
    ctx.fillStyle = "#111318";
    ctx.fillRect(layout.roadLeft - layout.curbW + off, y, layout.curbW, stripeStep);
    ctx.fillRect(layout.roadRight + off, y, layout.curbW, stripeStep);
    ctx.fillStyle = "rgba(255,215,0,0.35)";
    ctx.fillRect(layout.roadLeft + 2 + off, y, 2, stripeStep);
    ctx.fillRect(layout.roadRight - 4 + off, y, 2, stripeStep);
  }

  // Lane lines
  const period = 78;
  const dash = 36;
  const offset = scroll % period;
  for (let i = 1; i < layout.lanes; i++) {
    const x = layout.roadLeft + layout.laneW * i;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let y = -period + offset; y < view.h + period; y += period) {
      const off = curveAt(y + dash * 0.5);
      ctx.fillRect(x - 2 + off, y, 4, dash);
    }
  }
};

const sportCarBodyPath = (left, top, w, h) => {
  const cx = left + w / 2;
  const capW = w * 0.30;
  const yTop = top + h * 0.03;
  const yBottom = top + h * 0.97;

  const shoulderY = top + h * 0.18;
  const waistY = top + h * 0.52;
  const tailY = top + h * 0.84;

  const halfShoulder = w * 0.46;
  const halfWaist = w * 0.36;
  const halfTail = w * 0.44;

  ctx.beginPath();
  ctx.moveTo(cx - capW / 2, yTop);
  ctx.lineTo(cx + capW / 2, yTop);
  ctx.bezierCurveTo(cx + w * 0.52, yTop + h * 0.02, cx + halfShoulder, top + h * 0.08, cx + halfShoulder, shoulderY);
  ctx.bezierCurveTo(cx + halfShoulder, top + h * 0.30, cx + halfWaist, top + h * 0.36, cx + halfWaist, waistY);
  ctx.bezierCurveTo(cx + halfWaist, top + h * 0.68, cx + halfTail, top + h * 0.72, cx + halfTail, tailY);
  ctx.bezierCurveTo(cx + halfTail, top + h * 0.92, cx + w * 0.22, yBottom, cx + capW / 2, yBottom);
  ctx.lineTo(cx - capW / 2, yBottom);
  ctx.bezierCurveTo(cx - w * 0.22, yBottom, cx - halfTail, top + h * 0.92, cx - halfTail, tailY);
  ctx.bezierCurveTo(cx - halfTail, top + h * 0.72, cx - halfWaist, top + h * 0.68, cx - halfWaist, waistY);
  ctx.bezierCurveTo(cx - halfWaist, top + h * 0.36, cx - halfShoulder, top + h * 0.30, cx - halfShoulder, shoulderY);
  ctx.bezierCurveTo(cx - halfShoulder, top + h * 0.08, cx - w * 0.52, yTop + h * 0.02, cx - capW / 2, yTop);
  ctx.closePath();
};

const drawSportCar = (x, y, w, h) => {
  const left = x - w / 2;
  const top = y - h / 2;
  const s = w / 50; // reference is 50x100

  ctx.save();

  // Shadow (no glow/blur)
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  sportCarBodyPath(left + 4 * s, top + 6 * s, w, h);
  ctx.fill();

  // Main body
  const bodyGrad = ctx.createLinearGradient(left, top, left, top + h);
  bodyGrad.addColorStop(0, "#ff4d4d");
  bodyGrad.addColorStop(0.5, "#ff0000");
  bodyGrad.addColorStop(1, "#990000");
  ctx.fillStyle = bodyGrad;
  sportCarBodyPath(left, top, w, h);
  ctx.fill();

  // Body outline
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(1.5, 2.2 * s);
  ctx.stroke();

  // Windshield
  const glass = "rgba(10,12,16,0.85)";
  ctx.fillStyle = glass;
  const winW = w * 0.64;
  const winX = left + (w - winW) / 2;
  const winH = h * 0.20;
  const winY = top + h * 0.20;
  drawRoundedRect(winX, winY, winW, winH, 10 * s);
  ctx.fill();

  // Back glass
  const backH = h * 0.18;
  const backY = top + h * 0.66;
  drawRoundedRect(winX, backY, winW, backH, 10 * s);
  ctx.fill();

  // Inner highlight (depth)
  const innerGrad = ctx.createLinearGradient(left, top, left, top + h);
  innerGrad.addColorStop(0, "rgba(255,255,255,0.30)");
  innerGrad.addColorStop(1, "rgba(255,255,255,0.0)");
  ctx.fillStyle = innerGrad;
  sportCarBodyPath(left + w * 0.06, top + h * 0.04, w * 0.88, h * 0.92);
  ctx.fill();

  // Side shadows (3D look)
  ctx.fillStyle = "rgba(0,0,0,0.40)";
  ctx.fillRect(left + 6 * s, top + 22 * s, 4 * s, h - 44 * s);
  ctx.fillRect(left + w - 10 * s, top + 22 * s, 4 * s, h - 44 * s);

  // Wheels
  ctx.fillStyle = "#0b0d12";
  const wheelW = Math.max(7 * s, w * 0.12);
  const wheelH = h * 0.18;
  const wheelX1 = left - wheelW * 0.55;
  const wheelX2 = left + w - wheelW * 0.45;
  const wheelY1 = top + h * 0.24;
  const wheelY2 = top + h * 0.62;
  drawRoundedRect(wheelX1, wheelY1, wheelW, wheelH, wheelW * 0.45);
  ctx.fill();
  drawRoundedRect(wheelX2, wheelY1, wheelW, wheelH, wheelW * 0.45);
  ctx.fill();
  drawRoundedRect(wheelX1, wheelY2, wheelW, wheelH, wheelW * 0.45);
  ctx.fill();
  drawRoundedRect(wheelX2, wheelY2, wheelW, wheelH, wheelW * 0.45);
  ctx.fill();

  // Center highlight panel
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  drawRoundedRect(left + w * 0.30, top + h * 0.32, w * 0.40, h * 0.16, 10 * s);
  ctx.fill();

  ctx.restore();
};

const drawCar = (x, y, w, h, body, outline, isPlayer = false, vehicle = "car", blinkT = 0) => {
  const left = x - w / 2;
  const top = y - h / 2;
  const r = Math.min(14, w * 0.34);
  const s = w / 50;

  // Player uses the sport sprite; traffic cars keep the simpler style.
  if (vehicle === "car" && isPlayer) {
    drawSportCar(x, y, w, h);
    return;
  }

  if (vehicle !== "truck") {
    // Shadow (no glow/blur)
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    sportCarBodyPath(left + 3 * s, top + 5 * s, w, h);
    ctx.fill();

    // Body
    sportCarBodyPath(left, top, w, h);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = body;
    ctx.fillRect(left - 2, top - 2, w + 4, h + 4);

    const shade = ctx.createLinearGradient(0, top, 0, top + h);
    shade.addColorStop(0, "rgba(255,255,255,0.20)");
    shade.addColorStop(0.42, "rgba(255,255,255,0.04)");
    shade.addColorStop(1, "rgba(0,0,0,0.26)");
    ctx.fillStyle = shade;
    ctx.fillRect(left - 2, top - 2, w + 4, h + 4);

    // Decals
    if (vehicle === "police") {
      ctx.fillStyle = "rgba(29,78,216,0.95)";
      ctx.fillRect(left + w * 0.12, top + h * 0.52, w * 0.76, h * 0.12);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(left + w * 0.12, top + h * 0.50, w * 0.76, h * 0.02);
      ctx.fillRect(left + w * 0.12, top + h * 0.64, w * 0.76, h * 0.02);
    }
    if (vehicle === "ambulance") {
      ctx.fillStyle = "rgba(239,68,68,0.95)";
      ctx.fillRect(left + w * 0.12, top + h * 0.56, w * 0.76, h * 0.10);
      ctx.fillStyle = "rgba(29,78,216,0.95)";
      const cx = left + w * 0.72;
      const cy = top + h * 0.36;
      ctx.fillRect(cx - w * 0.06, cy - h * 0.04, w * 0.12, h * 0.08);
      ctx.fillRect(cx - w * 0.03, cy - h * 0.09, w * 0.06, h * 0.18);
    }

    // Hood ridge highlight
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    drawRoundedRect(left + w * 0.32, top + h * 0.28, w * 0.36, h * 0.44, 10 * s);
    ctx.fill();

    ctx.restore();

    // Outline
    sportCarBodyPath(left, top, w, h);
    ctx.strokeStyle = outline;
    ctx.lineWidth = isPlayer ? 3 : 2;
    ctx.stroke();

    // Windows
    ctx.fillStyle = "rgba(12,14,18,0.78)";
    const winW = w * 0.64;
    const winX = left + (w - winW) / 2;
    const winH = h * 0.20;
    drawRoundedRect(winX, top + h * 0.20, winW, winH, 10 * s);
    ctx.fill();
    drawRoundedRect(winX, top + h * 0.66, winW, h * 0.18, 10 * s);
    ctx.fill();

    // Headlights + tail lights
    const lw = w * 0.16;
    const lh = Math.max(2, h * 0.035);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillRect(left + w * 0.18, top + h * 0.06, lw, lh);
    ctx.fillRect(left + w * 0.66, top + h * 0.06, lw, lh);
    ctx.fillStyle = "rgba(239,68,68,0.72)";
    ctx.fillRect(left + w * 0.18, top + h * 0.91, lw, lh);
    ctx.fillRect(left + w * 0.66, top + h * 0.91, lw, lh);

    // Wheels (rounded)
    ctx.fillStyle = "#0b0d12";
    const wheelW = Math.max(7 * s, w * 0.12);
    const wheelH = h * 0.18;
    const wheelX1 = left - wheelW * 0.55;
    const wheelX2 = left + w - wheelW * 0.45;
    const wheelY1 = top + h * 0.24;
    const wheelY2 = top + h * 0.62;
    drawRoundedRect(wheelX1, wheelY1, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();
    drawRoundedRect(wheelX2, wheelY1, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();
    drawRoundedRect(wheelX1, wheelY2, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();
    drawRoundedRect(wheelX2, wheelY2, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();

    // Light bars
    if (vehicle === "police") {
      const blink = Math.sin(blinkT * 12) > 0 ? 1 : 0;
      ctx.fillStyle = blink ? "rgba(96,165,250,0.95)" : "rgba(239,68,68,0.95)";
      drawRoundedRect(left + w * 0.28, top + h * 0.12, w * 0.44, h * 0.07, 6);
      ctx.fill();
    }
    if (vehicle === "ambulance") {
      const blink = Math.sin(blinkT * 10) > 0 ? 1 : 0;
      ctx.fillStyle = blink ? "rgba(239,68,68,0.95)" : "rgba(96,165,250,0.95)";
      drawRoundedRect(left + w * 0.30, top + h * 0.12, w * 0.40, h * 0.065, 6);
      ctx.fill();
    }

    return;
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.40)";
  drawRoundedRect(left + 4, top + 6, w, h, r);
  ctx.fill();

  // Truck body (cabin front + trailer rear)
  const cabinH = h * 0.34;
  const trailerH = h - cabinH;
  const cabinY = top;
  const trailerY = top + cabinH - 2;

  // Trailer
  const tg = ctx.createLinearGradient(0, trailerY, 0, trailerY + trailerH);
  tg.addColorStop(0, body);
  tg.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = tg;
  drawRoundedRect(left, trailerY, w, trailerH + 2, r);
  ctx.fill();

  // Cabin
  const cg = ctx.createLinearGradient(0, cabinY, 0, cabinY + cabinH);
  cg.addColorStop(0, "#111827");
  cg.addColorStop(1, "#0b0f18");
  ctx.fillStyle = cg;
  drawRoundedRect(left, cabinY, w, cabinH + 2, r);
  ctx.fill();

  // Cabin windshield
  ctx.fillStyle = "rgba(12,14,18,0.78)";
  drawRoundedRect(left + w * 0.18, cabinY + cabinH * 0.18, w * 0.64, cabinH * 0.34, r * 0.6);
  ctx.fill();

  // Trailer panel lines
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left + w * 0.18, trailerY + trailerH * 0.16);
  ctx.lineTo(left + w * 0.18, trailerY + trailerH * 0.92);
  ctx.moveTo(left + w * 0.82, trailerY + trailerH * 0.16);
  ctx.lineTo(left + w * 0.82, trailerY + trailerH * 0.92);
  ctx.stroke();

  // Headlights + rear lights
  const lw = w * 0.14;
  const lh = Math.max(2, h * 0.03);
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fillRect(left + w * 0.16, cabinY + cabinH * 0.06, lw, lh);
  ctx.fillRect(left + w * 0.70, cabinY + cabinH * 0.06, lw, lh);
  ctx.fillStyle = "rgba(239,68,68,0.72)";
  ctx.fillRect(left + w * 0.16, trailerY + trailerH * 0.92, lw, lh);
  ctx.fillRect(left + w * 0.70, trailerY + trailerH * 0.92, lw, lh);

  // Outline
  ctx.strokeStyle = outline;
  ctx.lineWidth = isPlayer ? 3 : 2;
  drawRoundedRect(left, cabinY, w, cabinH + 2, r);
  ctx.stroke();
  drawRoundedRect(left, trailerY, w, trailerH + 2, r);
  ctx.stroke();

  // Wheels
  ctx.fillStyle = "#0b0d12";
  const wheelW = Math.max(7 * s, w * 0.11);
  const wheelH = h * 0.14;
  const wheelX1 = left - wheelW * 0.55;
  const wheelX2 = left + w - wheelW * 0.45;
  const ax1 = cabinY + cabinH * 0.70;
  const ax2 = trailerY + trailerH * 0.56;
  const ax3 = trailerY + trailerH * 0.78;
  for (const wy of [ax1, ax2, ax3]) {
    drawRoundedRect(wheelX1, wy, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();
    drawRoundedRect(wheelX2, wy, wheelW, wheelH, wheelW * 0.45);
    ctx.fill();
  }
};

const render = () => {
  const tNow = performance.now() / 1000;
  let ox = 0;
  let oy = 0;
  if (state.shakeT > 0) {
    const mag = state.shakeMag * (0.3 + state.shakeT * 0.7);
    ox = rand(-mag, mag);
    oy = rand(-mag, mag);
  }
  ctx.save();
  ctx.translate(ox, oy);

  drawRoad(state.scroll, tNow);

  // Objects
  for (const o of state.objects) {
    if (o.kind !== "traffic") continue;
    drawCar(o.x, o.y, o.w, o.h, o.color, o.outline || "rgba(255,255,255,0.35)", false, o.vehicle || "car", tNow);
  }

  // Player
  const px = state.x;
  const py = layout.playerY;
  drawCar(px, py, layout.carW, layout.carH, "#ff2a2a", "rgba(255,255,255,0.70)", true, "car", tNow);

  // Particles
  for (const p of state.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color === "#ffd43b" ? `rgba(255,212,59,${a})` : `rgba(255,42,42,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Day/night tint (keeps UI/popups readable by drawing before them)
  const day = (Math.sin(tNow * 0.06) + 1) / 2;
  const night = smoothstep(0.18, 0.85, 1 - day);
  if (night > 0.001) {
    ctx.fillStyle = `rgba(10,12,24,${night * 0.34})`;
    ctx.fillRect(0, 0, view.w, view.h);

    const vg = ctx.createRadialGradient(view.w / 2, view.h * 0.55, Math.min(view.w, view.h) * 0.25, view.w / 2, view.h * 0.55, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, `rgba(0,0,0,${night * 0.0})`);
    vg.addColorStop(1, `rgba(0,0,0,${night * 0.42})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  // Popups
  for (const p of state.popups) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = "900 18px ui-sans-serif, system-ui, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }

  // Paused label
  if (state.mode === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "900 40px ui-sans-serif, system-ui, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", view.w / 2, view.h / 2);
  }

  // Countdown label
  if (state.mode === "countdown") {
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(0, 0, view.w, view.h);

    const n = Math.ceil(state.countdownT);
    const label = n <= 0 ? "GO!" : String(n);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 96px ui-sans-serif, system-ui, Arial";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(205,0,0,0.95)";
    ctx.strokeText(label, view.w / 2, view.h * 0.42);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(label, view.w / 2, view.h * 0.42);

    ctx.font = "800 16px ui-sans-serif, system-ui, Arial";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText("GET READY", view.w / 2, view.h * 0.42 + 74);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("GET READY", view.w / 2, view.h * 0.42 + 74);
  }

  ctx.restore();
};

const update = (dt) => {
  updateInput();
  handleOneShots();

  // Smooth x to lane center (so the car is always visible and aligned).
  const targetX = laneCenterX(state.lane);
  state.x = lerp(state.x, targetX, clamp(dt * 14, 0, 1));

  state.shakeT = Math.max(0, state.shakeT - dt);
  state.shakeMag = Math.max(0, state.shakeMag - 28 * dt);

  if (state.mode === "paused" || state.mode === "menu") return;

  // Game over crash animation time
  if (state.mode === "gameover") {
    state.crashT = Math.max(0, state.crashT - dt);
  }

  if (state.mode === "countdown") {
    state.countdownT = Math.max(0, state.countdownT - dt);
    const nowN = Math.ceil(state.countdownT);
    if (nowN !== state.countdownLast) {
      state.countdownLast = nowN;
      if (nowN > 0) beep(520, 0.07, "square");
      else beep(820, 0.10, "square");
    }
    if (state.countdownT <= 0) {
      state.mode = "playing";
      state.pauseReturnMode = "playing";
    }
    return;
  }

  if (state.mode !== "playing") return;

  state.time += dt;

  // Speed ramps up a bit over time.
  // Smooth speed-up every 500 score (no sudden jump).
  const stepScore = 500;
  const boostPerStep = 90; // px/s per 500 points
  const rampWidth = 320; // points within each 500 to reach full boost
  const stepIndex = Math.floor(state.score / stepScore); // 0..∞
  const withinStep = state.score - stepIndex * stepScore; // 0..499
  const baseBoost = Math.max(0, (stepIndex - 1) * boostPerStep);
  const ramp = stepIndex <= 0 ? 0 : smoothstep(0, rampWidth, withinStep);
  const scoreBoost = baseBoost + ramp * boostPerStep;

  const targetSpeed = clamp(560 + state.time * 6.5 + scoreBoost, 560, 1100);
  state.speed = lerp(state.speed, targetSpeed, clamp(dt * 1.2, 0, 1));
  state.scroll += state.speed * dt;
  state.distance += state.speed * dt * 0.001;

  const difficulty01 = clamp(1 - Math.exp(-state.score / 2600), 0, 1);

  // Spawn traffic
  state.spawnT -= dt;
  if (state.spawnT <= 0) {
    let spawned = false;
    for (let attempts = 0; attempts < 4 && !spawned; attempts++) {
      spawned = spawnTraffic(difficulty01);
    }
    const minGap = lerp(0.58, 0.32, difficulty01);
    const maxGap = lerp(0.98, 0.55, difficulty01);
    state.spawnT = spawned ? rand(minGap, maxGap) : 0.16;
  }

  // Move objects down
  for (const o of state.objects) o.y += state.speed * dt;
  state.objects = state.objects.filter((o) => o.y < view.h + 200);

  // Score: distance + overtakes
  const playerY = layout.playerY;
  for (const o of state.objects) {
    if (o.kind !== "traffic" || o.scored) continue;
    if (o.y > playerY + layout.carH * 0.65) {
      o.scored = true;
      state.passed += 1;
      addPopup(o.x, playerY - layout.carH * 0.35, "+7", "rgba(34,197,94,0.95)");
    }
  }
  const baseScore = Math.floor(state.distance * 100) + state.passed * 7;

  // Collision
  const pw = layout.carW * 0.86;
  const ph = layout.carH * 0.86;
  const px = state.x;
  const nearPadX = Math.max(10, layout.laneW * 0.06);
  const nearPadY = layout.carH * 0.10;
  for (const o of state.objects) {
    if (o.kind !== "traffic") continue;
    const ow = o.w * 0.86;
    const oh = o.h * 0.86;

    const hit = rectOverlap(px, playerY, pw, ph, o.x, o.y, ow, oh);
    if (hit) {
      state.score = baseScore + state.bonus;
      crash();
      break;
    }

    if (!o.near) {
      const yOk = o.y > playerY - oh * 0.35 && o.y < playerY + ph * 0.55;
      if (yOk) {
        const near = rectOverlap(
          px,
          playerY,
          pw + nearPadX * 2,
          ph + nearPadY * 2,
          o.x,
          o.y,
          ow + nearPadX * 2,
          oh + nearPadY * 2,
        );
        if (near) {
          o.near = true;
          const bonus = 18;
          state.bonus += bonus;
          addPopup(o.x, playerY - layout.carH * 0.55, `+${bonus} NEAR`, "rgba(96,165,250,0.95)");
          beep(980, 0.05, "triangle");
        }
      }
    }
  }

  state.score = baseScore + state.bonus;
  hudScore.textContent = String(state.score);
};

let lastTs = 0;
const loop = (ts) => {
  const now = ts || 0;
  const rawDt = (now - lastTs) / 1000 || 0;
  lastTs = now;
  const dt = clamp(rawDt, 0, 1 / 24);

  update(dt);

  // Particles update (always)
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  // Popups update (always)
  if (state.mode !== "paused" && state.mode !== "menu") {
    for (const p of state.popups) {
      p.life -= dt;
      p.y += p.vy * dt;
    }
    state.popups = state.popups.filter((p) => p.life > 0);
  }

  render();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

loadPrefs();
goHome();
