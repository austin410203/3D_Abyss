import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SPECIES, UI } from './data.js';
import { BUILD } from './creatures.js';
import { TEX, clamp, lerp } from './kit.js';

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
let lang = store.get('abyss.lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
let theme = store.get('abyss.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const root = document.documentElement;
root.dataset.theme = theme;

// ---------------- renderer / scene ----------------
const glWrap = $('#gl'), stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
glWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7d74, 0.8);
const key = new THREE.DirectionalLight(0xfff6ee, 2.3);
key.position.set(3, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 1, far: 20 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
const rim = new THREE.DirectionalLight(0xa6e6ff, 1.0);
rim.position.set(-4, 2.5, -5);
const fill = new THREE.DirectionalLight(0xffe7da, 0.5);
fill.position.set(-5, -1, 4);
scene.add(hemi, key, rim, fill);

// soft blob shadow
const blobTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.5, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x0d2a2c }));
blob.rotation.x = -Math.PI / 2; blob.position.y = -1.95; blob.renderOrder = -1;
scene.add(blob);

// marine snow
const snow = (() => {
  const N = 700, p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - .5) * 16; p[i * 3 + 1] = (Math.random() - .5) * 9; p[i * 3 + 2] = (Math.random() - .5) * 8 - 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ size: 0.035, map: TEX.glow(), transparent: true, depthWrite: false, color: 0xcfe9ee, opacity: 0, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.userData.noShadow = true;
  scene.add(pts); return pts;
})();

// ---------------- creatures ----------------
const env = { dark: theme === 'dark' };
const C = SPECIES.map(sp => {
  const m = BUILD[sp.id]();
  m.update(0.5, 1, env);
  const norm = new THREE.Group(); norm.add(m.group);
  m.group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(m.group);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const s = 3.3 / Math.max(size.x, size.y, size.z);
  norm.scale.setScalar(s);
  norm.position.copy(ctr).multiplyScalar(-s);
  const holder = new THREE.Group(); holder.add(norm); holder.visible = false;
  holder.rotation.order = 'XYZ';
  scene.add(holder);
  m.group.traverse(o => {
    if (o.isMesh) { o.castShadow = !o.userData.noShadow && !o.material.transparent; o.receiveShadow = true; }
  });
  if (m.ap) m.ap.updateMatrixWorld(true);
  return { sp, m, holder, norm, w: size.x * s, d: size.z * s, h: size.y * s };
});
const detailPoint = new THREE.Vector3();
function detailWorld(c, out) {
  if (c.sp.id === 'nautilus') {          // eye on the near side of the aperture
    return c.m.ap.localToWorld(out.set(0.2, 0.04, 0.44));
  }
  return c.m.group.localToWorld(out.fromArray(c.m.detail));
}

// ---------------- view state ----------------
const V = {
  cur: -1, prev: -1, ts: 9,
  yaw: 0, yawT: 0, pitch: 0, pitchT: 0, vyaw: 0,
  zoom: 1, zoomT: 1, focus: 0, focusT: 0, base: 9, spin: false, t: 0,
};
const ease = { out: x => 1 - Math.pow(1 - x, 3), inn: x => x * x * x, io: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 };
const ENTER = 1.8, LEAVE = 1.4;

function select(i, opts = {}) {
  if (i === V.cur) return;
  V.prev = V.cur; V.cur = i; V.ts = opts.instant ? 9 : 0;
  V.yaw = V.yawT = 0.0; V.pitch = V.pitchT = 0; V.vyaw = 0;
  V.zoomT = 1; V.focusT = 0;
  C[i].holder.visible = true;
  document.querySelectorAll('.card').forEach((el, k) => el.classList.toggle('on', k === i));
  const card = document.querySelectorAll('.card')[i];
  if (card) card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  renderPanel(!opts.instant);
}

// ---------------- UI ----------------
const ICON = {
  len: '<svg viewBox="0 0 24 24"><path d="M5 19L19 5M8 16l-1.5-1.5M11 13l-1.5-1.5M14 10l-1.5-1.5M17 7l-1.5-1.5"/></svg>',
  dep: '<svg viewBox="0 0 24 24"><path d="M12 4v15M7 14l5 5 5-5M5 4h14"/></svg>',
  diet: '<svg viewBox="0 0 24 24"><path d="M3 12c3-4.5 9-5.5 13-2l5-3v10l-5-3c-4 3.5-10 2.5-13-2z"/></svg>',
  range: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 8c3-2 6 2 9 0s6 2 9 0M3 13c3-2 6 2 9 0s6 2 9 0M3 18c3-2 6 2 9 0s6 2 9 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};
const thumbs = [], closeThumbs = [];
let panelTimer = 0;
function renderPanel(animate) {
  const c = C[V.cur], sp = c.sp, T = sp[lang], U = UI[lang];
  const html = `
    <div class="fam">${sp.family}</div>
    <h1>${T.name}</h1>
    <div class="latin">${sp.latin}</div>
    <div class="tags">${T.tags.map(t => `<span>${t}</span>`).join('')}</div>
    <p class="desc">${T.desc}</p>
    <h3>${U.keyTraits}</h3>
    <dl class="traits">${['len', 'dep', 'diet', 'range'].map((k, j) => `${ICON[k]}<dt>${U.traits[j]}</dt><dd>${T.traits[j]}</dd>`).join('')}</dl>
    <h3>${U.habitat}</h3>
    <p class="hab">${ICON.wave}<span>${T.habitat}</span></p>
    <button class="closeup${V.focusT ? ' on' : ''}" id="closeup"><img src="${closeThumbs[V.cur] || ''}" alt=""><div><b>${T.close[0]}</b><small>${T.close[1]}</small></div>${ICON.chev}</button>`;
  const panel = $('#panel'), cap = $('#caption');
  const apply = () => {
    panel.innerHTML = html;
    panel.classList.remove('out'); panel.classList.remove('in'); void panel.offsetWidth;
    if (animate) panel.classList.add('in');
    panel.scrollTop = 0;
    cap.textContent = T.caption; cap.style.opacity = 1;
    $('#closeup').onclick = toggleCloseup;
    const f = $('#feat');
    f.querySelector('img').src = thumbs[V.cur] || '';
    f.querySelector('h4').textContent = T.feat[0];
    f.querySelector('p').textContent = T.feat[1];
    f.querySelector('a').href = sp.wiki[lang];
  };
  clearTimeout(panelTimer);
  if (animate && panel.innerHTML) {
    panel.classList.add('out'); cap.style.opacity = 0;
    panelTimer = setTimeout(apply, 230);
  } else apply();
}

function toggleCloseup() {
  const f = V.focusT ? 0 : 1;
  V.focusT = f;
  if (f) {
    const fo = C[V.cur].sp.focus;
    V.yawT = nearestAngle(V.yaw, fo.yaw); V.pitchT = fo.pitch; V.zoomT = fo.zoom; V.spin = false; $('#spin').classList.remove('on');
  } else { V.zoomT = 1; V.pitchT = 0; }
  const b = $('#closeup'); if (b) b.classList.toggle('on', !!f);
}
const nearestAngle = (from, to) => to + Math.round((from - to) / (Math.PI * 2)) * Math.PI * 2;

function buildCarousel() {
  const car = $('#carousel');
  car.innerHTML = SPECIES.map((sp, i) => `<button class="card" data-i="${i}"><img alt=""><b></b><i>${sp.latin}</i></button>`).join('');
  car.querySelectorAll('.card').forEach(el => el.addEventListener('click', () => select(+el.dataset.i)));
}

function applyLang() {
  const U = UI[lang];
  root.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = U[el.dataset.t]; });
  document.querySelectorAll('[data-n]').forEach(el => { el.textContent = U.species(SPECIES.filter(s => s.cat === el.dataset.n).length); });
  document.querySelectorAll('[data-tip]').forEach(el => { el.dataset.label = U[el.dataset.tip]; el.setAttribute('aria-label', U[el.dataset.tip]); });
  $('#q').placeholder = U.search;
  $('#lang').textContent = U.lang;
  document.querySelectorAll('.card').forEach((el, i) => { el.querySelector('b').textContent = SPECIES[i][lang].name; });
  if (V.cur >= 0) renderPanel(false);
}

function filterCards(fn) {
  let first = -1;
  document.querySelectorAll('.card').forEach((el, i) => {
    const ok = fn(SPECIES[i]); el.classList.toggle('hide', !ok);
    if (ok && first < 0) first = i;
  });
  return first;
}

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
  const cat = b.dataset.cat;
  $('#q').value = '';
  const first = filterCards(sp => cat === 'all' || cat === 'feat' || sp.cat === cat);
  if (cat === 'all') { V.focusT = 0; V.zoomT = 1; V.yawT = nearestAngle(V.yaw, 0); V.pitchT = 0; }
  if (first >= 0 && SPECIES[V.cur].cat !== cat && (cat === 'ceph' || cat === 'fish')) select(first);
});
$('#q').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  filterCards(sp => !q || [sp.en.name, sp.zh.name, sp.latin, sp.family, sp.en.habitat, sp.zh.habitat, sp.en.traits[3], sp.zh.traits[3]].some(s => s.toLowerCase().includes(q)));
});
$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const vis = [...document.querySelectorAll('.card')].findIndex(el => !el.classList.contains('hide'));
  if (vis >= 0) select(vis);
});
$('#lang').onclick = () => { lang = lang === 'zh' ? 'en' : 'zh'; store.set('abyss.lang', lang); applyLang(); };
$('#theme').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
$('#zin').onclick = () => { V.zoomT = clamp(V.zoomT * 0.72, 0.25, 1.6); };
$('#zout').onclick = () => { V.zoomT = clamp(V.zoomT / 0.72, 0.25, 1.6); if (V.zoomT > 0.7) V.focusT = 0; };
$('#focus').onclick = () => { document.body.classList.toggle('focus'); setTimeout(layout, 20); };
$('#rotL').onclick = () => { V.yawT -= Math.PI / 4; };
$('#rotR').onclick = () => { V.yawT += Math.PI / 4; };
$('#spin').onclick = () => { V.spin = !V.spin; $('#spin').classList.toggle('on', V.spin); };

function setTheme(t) {
  theme = t; root.dataset.theme = t; env.dark = t === 'dark'; store.set('abyss.theme', t);
}

// ---------------- interaction ----------------
const ptrs = new Map();
let pinch0 = 0, zoom0 = 1, lastX = 0, lastY = 0, lastT = 0;
stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.classList.add('drag'); $('.hint').classList.add('gone');
  lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); V.vyaw = 0;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = V.zoomT; }
});
stage.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    V.zoomT = clamp(zoom0 * pinch0 / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), 0.25, 1.6);
    return;
  }
  const dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now();
  V.yawT += dx * 0.009; V.pitchT = clamp(V.pitchT + dy * 0.005, -0.8, 0.8);
  V.vyaw = dx * 0.009 / Math.max(0.008, (now - lastT) / 1000);
  lastX = e.clientX; lastY = e.clientY; lastT = now;
});
const up = e => {
  ptrs.delete(e.pointerId);
  if (!ptrs.size) { stage.classList.remove('drag'); if (performance.now() - lastT > 80) V.vyaw = 0; }
};
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
stage.addEventListener('wheel', e => {
  e.preventDefault();
  V.zoomT = clamp(V.zoomT * Math.exp(e.deltaY * 0.0012), 0.25, 1.6);
  if (V.zoomT > 0.75) V.focusT = 0;
  $('.hint').classList.add('gone');
}, { passive: false });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const n = SPECIES.length;
  if (e.key === 'ArrowRight') select((V.cur + 1) % n);
  else if (e.key === 'ArrowLeft') select((V.cur + n - 1) % n);
  else if (e.key === '+' || e.key === '=') $('#zin').click();
  else if (e.key === '-') $('#zout').click();
  else if (e.key.toLowerCase() === 't') $('#theme').click();
  else if (e.key.toLowerCase() === 'f') $('#focus').click();
  else if (e.key === ' ') { e.preventDefault(); $('#spin').click(); }
});

// ---------------- layout ----------------
const mq = matchMedia('(max-width: 860px)');
function layout() {
  const mobile = mq.matches;
  if (mobile && glWrap.parentElement !== stage) stage.prepend(glWrap);
  if (!mobile && glWrap.parentElement !== document.body) document.body.prepend(glWrap);
  const r = glWrap.getBoundingClientRect(), s = stage.getBoundingClientRect();
  const W = Math.max(1, r.width), H = Math.max(1, r.height);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const focusMode = document.body.classList.contains('focus');
  const sx = focusMode ? r.left + W / 2 : s.left + s.width / 2, sy = focusMode ? r.top + H / 2 : s.top + s.height / 2;
  const sw = focusMode ? W : s.width, sh = focusMode ? H : s.height;
  camera.setViewOffset(W, H, W / 2 - (sx - r.left), H / 2 - (sy - r.top), W, H);
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  const px = Math.min(sh * 0.95, sw * 0.9);                  // pixels the creature may span
  V.base = clamp(3.0 * H / (tanH * px), 4.5, 22);
}
addEventListener('resize', layout);
mq.addEventListener('change', layout);

// ---------------- snapshots (card thumbnails) ----------------
function snap(c, opt) {
  const pr = renderer.getPixelRatio(), cv = renderer.domElement;
  const px = Math.floor(Math.min(opt.size, cv.width, cv.height)), css = px / pr;
  const vis = C.map(o => o.holder.visible);
  C.forEach(o => { o.holder.visible = false; });
  blob.visible = snow.visible = false;
  c.holder.visible = true; c.holder.position.set(0, 0, 0); c.holder.rotation.set(opt.pitch, opt.yaw, 0);
  c.holder.updateMatrixWorld(true);
  const target = opt.detail ? detailWorld(c, new THREE.Vector3()) : new THREE.Vector3();
  camera.clearViewOffset(); camera.aspect = 1; camera.updateProjectionMatrix();
  camera.position.set(target.x, target.y + 0.2, target.z + opt.dist); camera.lookAt(target);
  renderer.setScissorTest(true); renderer.setViewport(0, 0, css, css); renderer.setScissor(0, 0, css, css);
  renderer.clear(); renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = out.height = px;
  out.getContext('2d').drawImage(cv, 0, cv.height - px, px, px, 0, 0, px, px);
  renderer.setScissorTest(false);
  C.forEach((o, i) => { o.holder.visible = vis[i]; });
  blob.visible = snow.visible = true;
  return out.toDataURL('image/png');
}
let thumbsDone = false;
function makeThumbs() {
  const cv = renderer.domElement;
  if (thumbsDone || cv.width < 160 || cv.height < 160) return;
  thumbsDone = true;
  C.forEach((c, i) => {
    thumbs[i] = snap(c, { ...c.sp.thumb, size: 220 });
    const f = c.sp.focus;
    closeThumbs[i] = snap(c, { yaw: f.yaw, pitch: f.pitch, dist: 2.3, detail: true, size: 160 });
  });
  document.querySelectorAll('.card img').forEach((img, i) => { img.src = thumbs[i]; });
  layout();
  if (V.cur >= 0) {
    $('#feat img').src = thumbs[V.cur];
    const ci = $('#closeup img'); if (ci) ci.src = closeThumbs[V.cur];
  }
}

// ---------------- frame ----------------
const tmp = new THREE.Vector3(), look = new THREE.Vector3();
let snowA = 0;
function frame(dt) {
  if (!thumbsDone) { layout(); makeThumbs(); }
  V.t += dt; V.ts += dt;
  const k = 1 - Math.exp(-dt * 7);
  if (V.spin) V.yawT += dt * 0.55;
  if (!ptrs.size && Math.abs(V.vyaw) > 0.01) { V.yawT += V.vyaw * dt; V.vyaw *= Math.exp(-dt * 3.2); }
  V.yaw += (V.yawT - V.yaw) * k; V.pitch += (V.pitchT - V.pitch) * k;
  V.zoom += (V.zoomT - V.zoom) * (1 - Math.exp(-dt * 4));
  V.focus += (V.focusT - V.focus) * (1 - Math.exp(-dt * 3.5));

  let blobX = 0, blobW = 0, blobA = 0;
  C.forEach((c, i) => {
    const h = c.holder;
    if (i === V.cur) {
      const e = ease.out(clamp(V.ts / ENTER, 0, 1));
      const sw = 1 + 1.6 * (1 - e);
      h.position.set(lerp(-8, 0, e), Math.sin(e * Math.PI) * 0.25, lerp(-3, 0, e));
      h.rotation.set(V.pitch * e + c.sp.view.pitch * e, lerp(-0.15, c.sp.view.yaw, e) + V.yaw, Math.sin(e * Math.PI) * 0.12);
      c.m.update(V.t, sw, env);
      blobX = h.position.x; blobW = c.w; blobA = e;
    } else if (i === V.prev && h.visible) {
      const e = ease.inn(clamp(V.ts / LEAVE, 0, 1));
      h.position.set(lerp(0, 10, e), lerp(0, 0.3, e), lerp(0, 1.5, e));
      h.rotation.y += (lerp(c.sp.view.yaw, -0.1, e) - h.rotation.y) * k;
      h.rotation.x *= 1 - k; h.rotation.z = -e * 0.1;
      c.m.update(V.t, 1 + 2 * e, env);
      if (e >= 1) h.visible = false;
    } else h.visible = false;
  });
  blob.position.x = blobX * 0.9; blob.scale.set(Math.max(1.6, blobW * 1.05), Math.max(0.5, blobW * 0.28), 1);
  blob.material.opacity = blobA * (env.dark ? 0.55 : 0.3) * (1 - V.focus);

  // lights / mood
  const dk = env.dark ? 1 : 0;
  snowA += (dk - snowA) * (1 - Math.exp(-dt * 2));
  hemi.intensity = lerp(0.8, 0.3, snowA); scene.environmentIntensity = lerp(1, 0.45, snowA);
  key.intensity = lerp(2.3, 1.7, snowA); rim.intensity = lerp(1.0, 2.6, snowA); fill.intensity = lerp(0.5, 0.15, snowA);
  rim.color.setHSL(0.52, lerp(0.6, 0.85, snowA), lerp(0.82, 0.62, snowA));
  snow.material.opacity = 0.12 + 0.6 * snowA;
  const sp = snow.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let y = sp.getY(i) - dt * (0.05 + (i % 7) * 0.012);
    if (y < -4.5) y += 9;
    sp.setY(i, y); sp.setX(i, sp.getX(i) + Math.sin(V.t * 0.3 + i) * dt * 0.02);
  }
  sp.needsUpdate = true;

  // camera
  const c = C[V.cur];
  look.set(0, 0, 0);
  if (V.focus > 0.001) { c.holder.updateMatrixWorld(true); look.lerp(detailWorld(c, tmp), V.focus); }
  const dist = V.base * V.zoom;
  camera.position.set(look.x, look.y + 0.35 * (1 - V.focus) * V.zoom, look.z + dist);
  camera.lookAt(look);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

let last = performance.now();
function loop(now) {
  frame(Math.min(0.05, (now - last) / 1000));
  last = now;
  requestAnimationFrame(loop);
}

// ---------------- boot ----------------
buildCarousel();
applyLang();
layout();
makeThumbs();
const startId = new URLSearchParams(location.search).get('s');
select(Math.max(0, SPECIES.findIndex(s => s.id === startId)) || 0);
requestAnimationFrame(t => { last = t; loop(t); setTimeout(() => $('#loader').classList.add('done'), 150); });
setTimeout(() => $('.hint').classList.add('gone'), 9000);

// test hook (hidden panes throttle rAF)
window.__abyss = { frame: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); }, select, V, C, setTheme, camera };
