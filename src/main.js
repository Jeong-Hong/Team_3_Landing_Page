import './style.css';
import members from './members.json';
import { createFluid } from './fluid.js';

const params = new URLSearchParams(location.search);
const LITE = params.has('lite');
const DEBUG = params.has('debug');
// 발표용 페이지라 OS의 '동작 줄이기' 설정과 관계없이 전체 연출을 기본으로 켠다.
// 연출을 줄여야 할 때만 ?reduced 를 붙인다(움직임 최소화, 완성된 화면을 바로 표시).
const REDUCED = params.has('reduced');
if (REDUCED) document.documentElement.classList.add('reduced');
const BASE = import.meta.env.BASE_URL;
const FORCE = 6000;

const $ = (s) => document.querySelector(s);
const els = {
  canvas: $('#fluid'),
  stage: $('#stage'),
  orbs: $('#orbs'),
  label: $('#label'),
  labelNo: $('#label .label-no'),
  labelName: $('#label .label-name'),
  curtain: $('#curtain'),
  viewer: $('#viewer'),
  vNo: $('#viewer-no'),
  vName: $('#viewer-name'),
  vFrame: $('#viewer-frame'),
  vClose: $('#viewer-close'),
  vNew: $('#viewer-newtab'),
  fps: $('#fps'),
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const scale = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const N = members.length;
// 7개의 구체를 화면 아래쪽 완만한 호 위에 고정 배치한다.
const team = members.map((m, i) => {
  const u = i / (N - 1);
  return { ...m, index: i, rgb: hexToRgb(m.color), x: 15 + u * 70, y: 72 - Math.sin(u * Math.PI) * 10 };
});
const toGL = (m) => [m.x / 100, 1 - m.y / 100];
const rainbowAt = (t) => {
  const f = ((t % N) + N) % N;
  const a = team[Math.floor(f)].rgb;
  const b = team[(Math.floor(f) + 1) % N].rgb;
  const k = f - Math.floor(f);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
};

let fluid = null;
try {
  // 성운처럼 퍼지되 화면이 탁해지지 않을 만큼만 남도록 소산·소용돌이 값을 조정한다.
  fluid = createFluid(els.canvas, { lite: LITE, overrides: { DENSITY_DISSIPATION: 0.9, CURL: 18 } });
} catch (err) {
  console.warn('[team3] WebGL 연기를 끄고 대체 배경을 사용합니다:', err);
}
if (!fluid) document.documentElement.classList.add('no-webgl');

/* ---------- state ---------- */
let state = 'intro'; // intro → revealing → select ⇄ opening/open/closing
let active = -1;
let paused = false;
let time = 0;
const tint = { cur: [0, 0, 0], target: [0, 0, 0], amt: 0, targetAmt: 0 };
const emitters = [];
let timers = [];
const later = (ms, fn) => timers.push(setTimeout(fn, REDUCED ? 0 : ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };


/* ---------- orbs ---------- */
const orbButtons = team.map((m) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'orb';
  b.style.setProperty('--x', m.x);
  b.style.setProperty('--y', m.y);
  b.style.setProperty('--c', m.color);
  b.style.setProperty('--i', m.index);
  b.setAttribute('aria-label', `${m.name}의 To-do 열기`);
  b.innerHTML = '<span class="orb-flare"></span><span class="orb-core"></span>';
  b.addEventListener('pointerenter', () => { if (state === 'select') setActive(m.index); });
  b.addEventListener('focus', () => { if (state === 'select') setActive(m.index); });
  b.addEventListener('click', () => {
    if (state !== 'select') return;
    setActive(m.index);
    open(m.index);
  });
  els.orbs.append(b);
  return b;
});

function burst(m, k = 1) {
  if (!fluid || paused) return;
  const [x, y] = toGL(m);
  fluid.splat(x, y, 0, 320 * k, scale(m.rgb, 0.55 * k), 0.28);
}

function setActive(i) {
  if (i === active) return;
  active = i;
  orbButtons.forEach((b, j) => b.classList.toggle('active', j === i));
  els.stage.classList.toggle('has-active', i >= 0);
  if (i < 0) {
    els.label.classList.remove('show');
    tint.targetAmt = 0;
    return;
  }
  const m = team[i];
  els.label.style.setProperty('--x', m.x);
  els.label.style.setProperty('--y', m.y);
  els.label.style.setProperty('--c', m.color);
  els.labelNo.textContent = String(i + 1).padStart(2, '0');
  els.labelName.textContent = m.name;
  els.label.classList.add('show');
  tint.target = m.rgb;
  tint.targetAmt = 1;
  burst(m, 0.45);
}

function select(i) {
  setActive(i);
  orbButtons[i].focus({ preventScroll: true });
}

/* ---------- scenes ---------- */
// 배경에 어두운 작은 별을 깐다. 시드 고정이라 새로고침해도 배치가 같다.
function buildStarfield() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tints = ['255,255,255', '255,244,230', '220,232,255', '255,236,220'];
  const layer = (count, alpha) => {
    const i = document.createElement('i');
    const dots = [];
    for (let k = 0; k < count; k++) {
      const a = (alpha[0] + rnd() * (alpha[1] - alpha[0])).toFixed(2);
      dots.push(`${(rnd() * 100).toFixed(2)}vw ${(rnd() * 100).toFixed(2)}vh rgba(${tints[k % tints.length]},${a})`);
    }
    i.style.boxShadow = dots.join(',');
    return i;
  };
  const field = document.createElement('div');
  field.className = 'starfield';
  field.setAttribute('aria-hidden', 'true');
  field.append(layer(260, [0.12, 0.4]), layer(80, [0.3, 0.7]), layer(22, [0.55, 0.95]));
  els.stage.before(field);
  return field;
}
const starfield = buildStarfield();

// 인트로에서 한 번만 유성이 지나간다.
function shootingStar() {
  const s = document.createElement('div');
  s.className = 'meteor';
  s.setAttribute('aria-hidden', 'true');
  starfield.append(s);
  s.addEventListener('animationend', () => s.remove());
}

function reveal() {
  if (state !== 'intro') return;
  state = 'revealing';
  els.stage.classList.add('revealed');
  const from = [0.5, 0.56];
  const dur = REDUCED ? 0.01 : 1.15;
  team.forEach((m, i) => {
    const to = toGL(m);
    emitters.push({
      from,
      ctrl: [lerp(from[0], to[0], 0.9), from[1] + 0.02],
      to,
      start: time + (REDUCED ? 0 : 0.25 + i * 0.1),
      dur,
      rgb: m.rgb,
      prev: null,
      done: false,
      onDone: () => { orbButtons[i].classList.add('in'); burst(m, 0.3); },
    });
  });
  later((0.25 + (N - 1) * 0.1 + dur) * 1000 + 150, () => { state = 'select'; });
}

function open(i) {
  if (state !== 'select') return;
  clearTimers();
  state = 'opening';
  const m = team[i];
  const r = orbButtons[i].getBoundingClientRect();
  els.curtain.style.setProperty('--cx', `${r.left + r.width / 2}px`);
  els.curtain.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  els.curtain.style.setProperty('--c', m.color);
  els.curtain.classList.add('open');

  if (fluid) {
    const [x, y] = toGL(m);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      fluid.splat(x, y, Math.cos(a) * 1100, Math.sin(a) * 1100, scale(m.rgb, 0.35), 0.4);
    }
  }

  const url = BASE + m.path;
  els.viewer.style.setProperty('--c', m.color);
  els.vNo.textContent = String(i + 1).padStart(2, '0');
  els.vName.textContent = `${m.name}의 To-do`;
  els.vFrame.title = `${m.name}의 To-do`;
  els.vNew.href = url;
  els.vFrame.src = url;

  later(420, () => {
    els.viewer.hidden = false;
    requestAnimationFrame(() => els.viewer.classList.add('show'));
    els.viewer.focus({ preventScroll: true });
  });
  later(900, () => { state = 'open'; paused = true; });
}

function close() {
  if (state !== 'open' && state !== 'opening') return;
  clearTimers();
  state = 'closing';
  paused = false;
  const i = active;
  els.viewer.classList.remove('show');
  later(260, () => {
    els.viewer.hidden = true;
    els.vFrame.src = 'about:blank';
    els.curtain.classList.remove('open');
    if (i >= 0) burst(team[i], 0.9);
  });
  later(1000, () => {
    state = 'select';
    if (i >= 0) orbButtons[i].focus({ preventScroll: true });
  });
}

els.vClose.addEventListener('click', close);

// iframe 안에서 누른 Esc는 storage-scope.js가 postMessage로 전달한다.
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== els.vFrame.contentWindow) return;
  if (e.data && e.data.type === 'team3:escape') close();
});

/* ---------- input ---------- */
const NEXT = ['ArrowRight', 'ArrowDown', 'PageDown'];
const PREV = ['ArrowLeft', 'ArrowUp', 'PageUp'];

window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (state === 'open' || state === 'opening') {
    if (k === 'Escape') { e.preventDefault(); close(); }
    return;
  }
  if (state === 'intro') {
    if ([...NEXT, 'Enter', ' '].includes(k)) { e.preventDefault(); reveal(); }
    return;
  }
  if (state !== 'select') return;
  if (NEXT.includes(k)) { e.preventDefault(); select(active < 0 ? 0 : (active + 1) % N); }
  else if (PREV.includes(k)) { e.preventDefault(); select(active < 0 ? N - 1 : (active - 1 + N) % N); }
  else if ((k === 'Enter' || k === ' ') && active >= 0) { e.preventDefault(); open(active); }
  else if (/^[1-7]$/.test(k)) { select(Number(k) - 1); }
  else if (k === 'Escape') { setActive(-1); document.activeElement?.blur(); }
});

window.addEventListener('pointerdown', (e) => {
  if (state === 'intro' && e.button === 0) reveal();
});

let lastPointer = null;
window.addEventListener('pointermove', (e) => {
  const p = [e.clientX / innerWidth, 1 - e.clientY / innerHeight];
  if (lastPointer && fluid && !paused) {
    const dx = p[0] - lastPointer[0];
    const dy = p[1] - lastPointer[1];
    if (Math.abs(dx) + Math.abs(dy) > 0.0004) {
      const rgb = active >= 0 ? team[active].rgb : rainbowAt(time * 0.35);
      fluid.splat(p[0], p[1], dx * FORCE, dy * FORCE, scale(rgb, 0.16), 0.22);
    }
  }
  lastPointer = p;
});
document.addEventListener('pointerleave', () => { lastPointer = null; });

// 마우스 위치에 따라 별 층이 조금씩 다르게 움직인다(시차).
if (!REDUCED) {
  window.addEventListener('pointermove', (e) => {
    const px = (e.clientX / innerWidth - 0.5) * 2;
    const py = (e.clientY / innerHeight - 0.5) * 2;
    starfield.style.setProperty('--px', px.toFixed(3));
    starfield.style.setProperty('--py', py.toFixed(3));
  });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => fluid && fluid.resize(), 150);
});

/* ---------- ambient smoke ---------- */
let swirlDone = false;
let ambientIn = 0.6;
let ambientIdx = 0;
let activeIn = 0;
let nebulaAmt = 0;
let meteorDone = false;

// 은하 띠: 셰이더의 nebula()와 같은 방향(왼쪽 아래 → 오른쪽 위).
const BAND = { cx: 0.5, cy: 0.48, dx: 0.94, dy: 0.34 };
function bandPoint(t, spread) {
  const aspect = innerWidth / innerHeight;
  const nx = -BAND.dy;
  const ny = BAND.dx;
  const off = (Math.random() - 0.5) * spread;
  return [BAND.cx + ((BAND.dx * t + nx * off) / aspect), BAND.cy + BAND.dy * t + ny * off];
}

function openingSwirl() {
  // 첫 장면: 은하 띠를 따라 7색 성운이 차례로 피어난다.
  team.forEach((m, i) => {
    const t = -0.95 + (i / (N - 1)) * 1.9;
    const [x, y] = bandPoint(t, 0.06);
    const sp = 380;
    later(i * 220, () => fluid && fluid.splat(x, y, BAND.dx * sp, BAND.dy * sp, scale(m.rgb, 0.55), 0.55));
  });
}

function ambient() {
  const m = team[ambientIdx++ % N];
  // 은하 띠 위에서 띠 방향으로 천천히 흐르는 성운
  const [x, y] = bandPoint((Math.random() - 0.5) * 2.0, 0.14);
  const sp = (120 + Math.random() * 160) * (Math.random() < 0.5 ? -1 : 1);
  fluid.splat(x, y, BAND.dx * sp, BAND.dy * sp, scale(m.rgb, state === 'intro' ? 0.4 : 0.22), 0.35);
}

function update(dt) {
  const k = 1 - Math.exp(-dt * 3);
  for (let c = 0; c < 3; c++) tint.cur[c] = lerp(tint.cur[c], tint.target[c], k);
  tint.amt = lerp(tint.amt, tint.targetAmt, k);

  for (const e of emitters) {
    if (e.done || time < e.start) continue;
    const t = Math.min(1, (time - e.start) / e.dur);
    const q = ease(t);
    const p = [
      (1 - q) * (1 - q) * e.from[0] + 2 * (1 - q) * q * e.ctrl[0] + q * q * e.to[0],
      (1 - q) * (1 - q) * e.from[1] + 2 * (1 - q) * q * e.ctrl[1] + q * q * e.to[1],
    ];
    if (e.prev && fluid && !paused) {
      fluid.splat(p[0], p[1], (p[0] - e.prev[0]) * FORCE, (p[1] - e.prev[1]) * FORCE, scale(e.rgb, 0.045), 0.08);
    }
    e.prev = p;
    if (t >= 1) { e.done = true; e.onDone(); }
  }
  if (emitters.length && emitters.every((e) => e.done)) emitters.length = 0;

  if (!fluid || paused) return;
  // 성운 배경은 서서히 밝아진다.
  nebulaAmt = Math.min(1, nebulaAmt + dt / (REDUCED ? 0.01 : 3.5));
  if (!meteorDone && state === 'intro' && time > 3.2) { meteorDone = true; if (!REDUCED) shootingStar(); }
  if (!swirlDone && time > 0.6) { swirlDone = true; openingSwirl(); }
  ambientIn -= dt;
  if (ambientIn <= 0) {
    ambientIn = (state === 'intro' ? 0.5 : 0.6) * (REDUCED ? 3 : 1);
    ambient();
  }
  if (state === 'select' && active >= 0) {
    activeIn -= dt;
    if (activeIn <= 0) {
      activeIn = 0.12;
      const m = team[active];
      const [x, y] = toGL(m);
      fluid.splat(x + (Math.random() - 0.5) * 0.01, y + 0.02, (Math.random() - 0.5) * 60, 260, scale(m.rgb, 0.07), 0.08);
    }
  }
}

/* ---------- loop ---------- */
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let fpsValue = 0;
if (DEBUG) els.fps.hidden = false;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  time += dt;
  update(dt);
  if (fluid && !paused && !document.hidden) {
    fluid.step(Math.min(dt, 1 / 60));
    fluid.render(tint.cur, tint.amt, time, nebulaAmt);
  }
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsValue = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    if (DEBUG) els.fps.textContent = `${fpsValue} fps · ${fluid ? fluid.info : 'no-webgl'} · ${state}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 스타일이 적용된 상태가 두 프레임 그려진 뒤에 전환 효과를 켠다(index.html의 html.preload 참고).
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('preload')));

if (DEBUG) {
  window.__team3 = {
    get state() { return state; },
    get active() { return active; },
    get fps() { return fpsValue; },
    get webgl() { return !!fluid; },
  };
}
