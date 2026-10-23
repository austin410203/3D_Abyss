// Shared geometry + material helpers for the procedural creatures.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const V3 = THREE.Vector3;

// ---------- noise ----------
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let i = 0; i < 8; i++) {
    const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r * 2 - 1;
}
export function fbm(x, y, z, o = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < o; i++) { s += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}

// ---------- parametric surface ----------
// fn(u, v, outVec3), u = rows 0..1, v = around 0..1 (seam duplicated, normals welded when closed).
// opt.closed: v wraps (weld seam normals). opt.capStart/capEnd: row 0 / row nu collapse to a pole.
// opt.orient: auto-flip winding so front faces point away from the centroid (default true).
export function surface(nu, nv, fn, opt = {}) {
  const closed = opt.closed !== false, cols = nv + 1, n = (nu + 1) * cols;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const col = opt.color ? new Float32Array(n * 3) : null;
  const idxA = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idxA.push(a, c, b, b, c, d);
  }
  geo.setIndex(idxA);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new V3(), c = new THREE.Color();
  let colored = false;
  const update = (f = fn) => {
    let k = 0;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      for (let j = 0; j < cols; j++) {
        const v = j / nv;
        f(u, v, p);
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        uv[k * 2] = u; uv[k * 2 + 1] = v;
        if (col && !colored) { opt.color(u, v, p, c); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
        k++;
      }
    }
    colored = true;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    weld(geo, nu, cols, closed, opt.capStart, opt.capEnd);
    geo.computeBoundingSphere();
  };
  update();
  if (opt.orient !== false && facesInward(geo)) {
    const ix = geo.index.array;
    for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
    geo.index.needsUpdate = true;
    update();
  }
  geo.userData.update = update;
  return geo;
}

function facesInward(geo) {
  const p = geo.attributes.position, nr = geo.attributes.normal;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.count; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
  cx /= p.count; cy /= p.count; cz /= p.count;
  let s = 0;
  for (let i = 0; i < p.count; i++) s += (p.getX(i) - cx) * nr.getX(i) + (p.getY(i) - cy) * nr.getY(i) + (p.getZ(i) - cz) * nr.getZ(i);
  return s < 0;
}

function weld(geo, nu, cols, closed, capStart, capEnd) {
  const nr = geo.attributes.normal.array;
  const avg = (ids) => {
    let x = 0, y = 0, z = 0;
    for (const i of ids) { x += nr[i * 3]; y += nr[i * 3 + 1]; z += nr[i * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of ids) { nr[i * 3] = x / l; nr[i * 3 + 1] = y / l; nr[i * 3 + 2] = z / l; }
  };
  if (closed) for (let i = 0; i <= nu; i++) avg([i * cols, i * cols + cols - 1]);
  const row = (i) => Array.from({ length: cols }, (_, j) => i * cols + j);
  if (capStart) avg(row(0));
  if (capEnd) avg(row(nu));
}

// ---------- animated tube along a centreline ----------
const _t = new V3(), _n = new V3(), _b = new V3(), _q = new V3();
export class Tube {
  constructor(rings, sides, mat, squash = 1) {
    this.R = rings; this.S = sides; this.squash = squash;
    const cols = sides + 1, n = rings * cols + 2;
    this.cols = cols;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < rings; i++) for (let j = 0; j < cols; j++) { uv[(i * cols + j) * 2] = i / (rings - 1); uv[(i * cols + j) * 2 + 1] = j / sides; }
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const s0 = rings * cols, s1 = s0 + 1, last = (rings - 1) * cols;
    for (let j = 0; j < sides; j++) { idx.push(s0, j + 1, j); idx.push(s1, last + j, last + j + 1); }
    uv[s1 * 2] = 1;
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo = geo;
    this.c = Array.from({ length: rings }, () => new V3());
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
  // center(u, out) ; radius(u) -> number
  update(center, radius) {
    const { R, S, c, pos, cols } = this;
    for (let i = 0; i < R; i++) center(i / (R - 1), c[i]);
    _t.subVectors(c[1], c[0]).normalize();
    _q.set(0, 1, 0); if (Math.abs(_t.y) > 0.9) _q.set(1, 0, 0);
    _n.copy(_q).addScaledVector(_t, -_q.dot(_t)).normalize();
    let r0 = 0, rl = 0;
    for (let i = 0; i < R; i++) {
      if (i === 0) _t.subVectors(c[1], c[0]); else if (i === R - 1) _t.subVectors(c[i], c[i - 1]); else _t.subVectors(c[i + 1], c[i - 1]);
      _t.normalize();
      _n.addScaledVector(_t, -_n.dot(_t)).normalize();
      _b.crossVectors(_t, _n);
      const r = radius(i / (R - 1));
      if (i === 0) r0 = r; if (i === R - 1) rl = r;
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r * this.squash, k = (i * cols + j) * 3;
        pos[k] = c[i].x + _n.x * ca + _b.x * sa;
        pos[k + 1] = c[i].y + _n.y * ca + _b.y * sa;
        pos[k + 2] = c[i].z + _n.z * ca + _b.z * sa;
      }
    }
    const s0 = R * cols * 3;
    _t.subVectors(c[1], c[0]).normalize();
    pos[s0] = c[0].x - _t.x * r0 * 0.4; pos[s0 + 1] = c[0].y - _t.y * r0 * 0.4; pos[s0 + 2] = c[0].z - _t.z * r0 * 0.4;
    _t.subVectors(c[R - 1], c[R - 2]).normalize();
    pos[s0 + 3] = c[R - 1].x + _t.x * rl * 0.9; pos[s0 + 4] = c[R - 1].y + _t.y * rl * 0.9; pos[s0 + 5] = c[R - 1].z + _t.z * rl * 0.9;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    const nr = this.geo.attributes.normal.array;
    for (let i = 0; i < R; i++) {
      const a = i * cols * 3, b = (i * cols + S) * 3;
      for (let q = 0; q < 3; q++) { const m = (nr[a + q] + nr[b + q]) / 2; nr[a + q] = m; nr[b + q] = m; }
    }
  }
}

// ---------- textures ----------
function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function pixels(ctx, w, h, f) {
  const img = ctx.createImageData(w, h), d = img.data, o = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o[3] = 255; f(x / w, y / h, o); const k = (y * w + x) * 4;
    d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
  }
  ctx.putImageData(img, 0, 0);
}

const cache = {};
export const TEX = {
  grain() {
    return cache.grain ||= canvasTex(256, 256, (ctx, w, h) => pixels(ctx, w, h, (x, y, o) => {
      // tileable: sample noise on a torus
      const a = x * TAU, b = y * TAU;
      const n = fbm(Math.cos(a) * 2 + 9, Math.sin(a) * 2, Math.cos(b) * 2 + Math.sin(b) * 2 + 3, 5);
      const v = 128 + n * 160; o[0] = o[1] = o[2] = clamp(v, 0, 255);
    }), { repeat: true, srgb: false });
  },
  scales() {
    return cache.scales ||= canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
      const s = 32;
      for (let row = -1; row < h / (s / 2) + 1; row++) for (let i = -1; i < w / s + 1; i++) {
        const cx = i * s + (row % 2) * s / 2, cy = row * s / 2;
        const g = ctx.createRadialGradient(cx - s * 0.2, cy, 2, cx, cy, s * 0.62);
        g.addColorStop(0, '#d0d0d0'); g.addColorStop(0.75, '#8a8a8a'); g.addColorStop(1, '#3a3a3a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 0.6, -Math.PI / 2, Math.PI / 2); ctx.fill();
      }
    }, { repeat: true, srgb: false });
  },
  fin() {
    // x = along ray (root -> edge), y = across rays
    return cache.fin ||= canvasTex(256, 256, (ctx, w, h) => pixels(ctx, w, h, (x, y, o) => {
      const rays = 15, ry = Math.abs(Math.sin(y * rays * Math.PI));
      const line = Math.pow(1 - ry, 10);
      const edge = x + 0.06 * noise3(y * 40, 1, 2) + 0.04 * Math.sin(y * rays * TAU + 1.6);
      const a = (1 - smooth(0.8, 1.0, edge)) * (0.62 + 0.38 * line) * (0.85 + 0.15 * (1 - x));
      const v = 235 - 110 * line - 40 * x;
      o[0] = o[1] = o[2] = v; o[3] = clamp(a * 255, 0, 255);
    }));
  },
  glow() {
    return cache.glow ||= canvasTex(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  },
  eye(iris, pupil, sclera) {
    const key = 'eye' + iris + pupil + sclera;
    return cache[key] ||= canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = sclera; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = w * 0.36;
      const g = ctx.createRadialGradient(cx, cy, R * pupil, cx, cy, R);
      g.addColorStop(0, iris); g.addColorStop(0.7, iris); g.addColorStop(1, sclera);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.strokeStyle = '#000';
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU; ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * pupil, cy + Math.sin(a) * R * pupil);
        ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#050505';
      ctx.beginPath(); ctx.arc(cx, cy, R * pupil, 0, TAU); ctx.fill();
    });
  },
};

// ---------- materials ----------
export function skin(color, o = {}) {
  const grain = TEX.grain();
  return new THREE.MeshPhysicalMaterial({
    color, roughness: o.r ?? 0.55, metalness: 0,
    sheen: o.sheen ?? 0.6, sheenRoughness: 0.45,
    sheenColor: new THREE.Color(o.sheenColor ?? color),
    clearcoat: o.cc ?? 0.15, clearcoatRoughness: 0.35,
    bumpMap: o.bump ?? grain, bumpScale: o.bs ?? 1,
    side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc,
    ...(o.extra || {}),
  });
}
export function finMat(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, map: TEX.fin(), transparent: true, side: THREE.DoubleSide, depthWrite: false,
    roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(color), alphaTest: 0.02, opacity: o.opacity ?? 1,
  });
}

// ---------- parts ----------
const ZA = new V3(0, 0, 1);
export function aim(obj, dir, from = ZA) { obj.quaternion.setFromUnitVectors(from, dir.clone().normalize()); return obj; }

export function eye(r, iris = '#222', o = {}) {
  const geo = new THREE.SphereGeometry(r, 32, 24);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / r * 0.5 + 0.5, p.getY(i) / r * 0.5 + 0.5);
  const mat = new THREE.MeshPhysicalMaterial({
    map: TEX.eye(iris, o.pupil ?? 0.45, o.sclera ?? '#141010'),
    roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, emissive: o.glow ? new THREE.Color(o.glow) : 0x000000,
    emissiveIntensity: o.glow ? 0.25 : 0,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.noShadow = true;
  return m;
}

export function glow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  s.scale.setScalar(size); s.userData.noShadow = true;
  return s;
}

// Fin fan: root segment along local Y at x=0, rays fan out toward -X.
// u = along ray, v = across. a0/a1 = ray angles (rad, + = up), fork = notch depth at the middle.
export function fan(o) {
  const geo = surface(10, 16, (u, v, p) => {
    const a = lerp(o.a0, o.a1, v);
    let L = o.len * (1 - (o.fork || 0) * Math.exp(-Math.pow((v - 0.5) / 0.2, 2)));
    if (o.round) L *= 0.55 + 0.45 * Math.sin(Math.PI * v);
    const ry = lerp(-o.span / 2, o.span / 2, v);
    p.set(-u * L * Math.cos(a), ry + u * L * Math.sin(a), (o.cup || 0) * Math.sin(Math.PI * v) * u + (o.twist || 0) * u * (v - 0.5));
  }, { closed: false, orient: false });
  return geo;
}

// Paddle (ear fin): along +X, width across Y, cupped in Z.
export function paddle(len, wid, cup) {
  return surface(12, 14, (u, v, p) => {
    const w = wid * Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.06 + 0.94 * u)))) * (0.5 + 0.5 * u);
    p.set(u * len, (v - 0.5) * w, cup * Math.sin(Math.PI * v) * (0.3 + u));
  }, { closed: false, orient: false });
}
