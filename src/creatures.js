// Six procedural deep-sea creatures. Each builder returns
// { group, update(t, swim), detail: [x,y,z] (model-space close-up point) }.
// All creatures face +X.
import * as THREE from 'three';
import { surface, Tube, skin, finMat, eye, glow, fan, paddle, aim, TEX, TAU, V3, clamp, lerp, smooth, fbm } from './kit.js';

const Yax = new V3(0, 1, 0), Xax = new V3(1, 0, 0);

// Webbed umbrella (octopus skirt / vampire-squid cloak) hanging along -Y from a base ring.
function umbrellaFn(o) {
  return (u, v, p) => {
    const th = v * TAU;
    const ph = (v * o.arms) % 1, w = 0.5 - 0.5 * Math.cos(ph * TAU);
    const s = u * (1 - o.web * Math.pow(w, 1.2));
    const ang = o.spread * (0.25 + 0.75 * s) + o.curl * s * s;
    const L = o.len * s;
    const rad = o.baseR + L * Math.sin(ang) * (1 + 0.05 * Math.sin(th * 3 + o.t * 1.3));
    p.set(Math.cos(th) * rad, o.baseY - L * Math.cos(ang) + o.ripple * s * s * Math.sin(th * o.arms + o.t * 2), Math.sin(th) * rad);
  };
}

function ellipsoid(nu, nv, c, r, opt = {}) {
  return surface(nu, nv, (u, v, p) => {
    const a = u * Math.PI, th = v * TAU, s = Math.sin(a);
    p.set(c[0] + r[0] * Math.cos(a), c[1] + r[1] * s * Math.cos(th), c[2] + r[2] * s * Math.sin(th));
    if (opt.warp) opt.warp(u, v, p);
  }, { capStart: true, capEnd: true, color: opt.color });
}

function mark(o, noShadow = true) { o.userData.noShadow = noShadow; return o; }

// ============ Dumbo octopus ============
export function dumbo() {
  const g = new THREE.Group();
  const cTop = new THREE.Color('#e5715a'), cMid = new THREE.Color('#f6a888'), cPale = new THREE.Color('#ffe0cc');
  const tint = (k, p, c) => {
    c.copy(cTop).lerp(cMid, smooth(0, 0.75, k));
    c.lerp(cPale, smooth(0.05, 0.45, fbm(p.x * 4 + 3, p.y * 4, p.z * 4, 3)) * 0.55);
  };
  const mat = skin('#ffffff', { vc: true, sheen: 1, sheenColor: '#ffd8c8', r: 0.5, cc: 0.35, bs: 0.35 });
  const head = new THREE.Mesh(surface(40, 48, (u, v, p) => {
    const a = u * Math.PI, th = v * TAU, s = Math.sin(a);
    const rr = 0.6 * Math.pow(s, 0.9) * (1 + 0.04 * Math.cos(th * 2));
    p.set(Math.cos(th) * rr * 1.03, 0.34 + 0.68 * Math.cos(a), Math.sin(th) * rr * 0.96);
  }, { capStart: true, capEnd: true, color: (u, v, p, c) => tint(u * 0.8, p, c) }), mat);
  g.add(head);

  const U = { arms: 8, baseR: 0.47, baseY: -0.02, len: 1.05, spread: 0.4, curl: 0.38, web: 0.1, ripple: 0.05, t: 0 };
  const uf = umbrellaFn(U);
  const ugeo = surface(28, 64, uf, { color: (u, v, p, c) => tint(0.7 + u * 0.3, p, c) });
  g.add(new THREE.Mesh(ugeo, skin('#ffffff', { vc: true, sheen: 1, sheenColor: '#ffd8c8', r: 0.6, side: THREE.DoubleSide, bs: 0.3 })));
  const armMat = skin('#f7b293', { sheen: 1, sheenColor: '#ffe0d0', r: 0.6, bs: 0.3 });
  const arms = Array.from({ length: 8 }, () => { const tb = new Tube(18, 8, armMat); g.add(tb.mesh); return tb; });

  const earGeo = paddle(0.62, 0.58, 0.1);
  const earMat = skin('#f19274', { sheen: 1, sheenColor: '#ffd0c0', r: 0.55, side: THREE.DoubleSide, bs: 0.3 });
  const ears = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(-0.04, 0.66, 0.4 * sd);
    aim(piv, new V3(-0.15, 0.5, sd), Xax);
    const e = new THREE.Mesh(earGeo, earMat); piv.add(e); g.add(piv); return e;
  });
  for (const sd of [-1, 1]) {
    const e = eye(0.13, '#3a2418', { pupil: 0.5, sclera: '#1a0f0c' });
    const d = new V3(0.72, 0.12, 0.68 * sd).normalize();
    e.position.set(d.x * 0.52, 0.3 + d.y * 0.4, d.z * 0.5); aim(e, d); g.add(e);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 16, 0, TAU, 0, Math.PI * 0.3), mat.clone());
    lid.material.vertexColors = false; lid.material.color.set('#e98466');
    lid.position.copy(e.position); aim(lid, new V3(d.x * 0.6, 1, d.z * 0.6), Yax); g.add(lid);
  }
  g.rotation.z = -0.1;
  return {
    group: g, detail: [-0.05, 0.85, 0.55],
    update(t, sw = 1) {
      U.spread = 0.4 + 0.17 * Math.sin(t * 1.5 * sw); U.t = t;
      ugeo.userData.update();
      arms.forEach((tb, k) => tb.update((u, o) => { uf(u * 1.03, k / 8, o); o.x *= 0.965; o.z *= 0.965; o.y += 0.012; }, u => 0.06 * (1 - u) + 0.016));
      ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * 0.5 * Math.sin(t * 3 * sw); });
      g.position.y = 0.07 * Math.sin(t * 1.5 * sw + 1.2);
    },
  };
}

// ============ Vampire squid ============
export function vampire() {
  const g = new THREE.Group(), f = new THREE.Group();
  f.rotation.z = Math.PI / 2; g.add(f); // f-space -Y (arms) -> world +X
  const red = skin('#c8283a', { sheen: 1, sheenColor: '#ff7d80', r: 0.6, cc: 0.12, bs: 0.7 });
  const mantle = new THREE.Mesh(surface(36, 44, (u, v, p) => {
    const th = v * TAU, y = 1.3 - 1.38 * u;
    const r = 0.44 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - u, 3))) * (1 + 0.07 * Math.sin(u * Math.PI));
    p.set(Math.cos(th) * r, y, Math.sin(th) * r * 0.94);
  }, { capStart: true }), red);
  f.add(mantle);
  const finMatV = skin('#d23446', { sheen: 1, sheenColor: '#ff8a8a', r: 0.6, side: THREE.DoubleSide, bs: 0.5 });
  const fins = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(0.05, 0.98, 0.36 * sd);
    aim(piv, new V3(0.25, 0.35, sd), Xax);
    const e = new THREE.Mesh(paddle(0.46, 0.38, 0.05), finMatV); piv.add(e); f.add(piv); return e;
  });
  for (const sd of [-1, 1]) {
    const e = eye(0.15, '#7fb4e8', { pupil: 0.42, sclera: '#d8e6f2' });
    const d = new V3(0.3, 0, 0.95 * sd).normalize();
    e.position.set(d.x * 0.36, 0.14, d.z * 0.36); aim(e, d); f.add(e);
  }
  const U = { arms: 8, baseR: 0.4, baseY: 0.02, len: 1.25, spread: 0.6, curl: 0.35, web: 0.26, ripple: 0.06, t: 0 };
  const uf = umbrellaFn(U);
  const cloak = surface(30, 72, uf);
  f.add(new THREE.Mesh(cloak, skin('#c42638', { sheen: 1, sheenColor: '#ff7d80', r: 0.62, bs: 0.6 })));
  f.add(new THREE.Mesh(cloak, skin('#6a1631', { sheen: 0.8, sheenColor: '#c04a6a', r: 0.7, side: THREE.BackSide, bs: 0.6 })));
  const arms = Array.from({ length: 8 }, () => { const tb = new Tube(22, 8, red); f.add(tb.mesh); return tb; });
  const PER = 12;
  const cone = new THREE.ConeGeometry(0.014, 0.085, 6); cone.translate(0, 0.042, 0);
  const cirri = new THREE.InstancedMesh(cone, new THREE.MeshPhysicalMaterial({ color: '#f6c5c2', roughness: 0.5, sheen: 1, sheenColor: '#fff' }), 8 * PER);
  cirri.frustumCulled = false; f.add(mark(cirri));
  const a = new V3(), b = new V3(), T = new V3(), B = new V3(), N = new V3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new V3(1, 1, 1);
  return {
    group: g, detail: [0.95, 0.45, 0.25],
    update(t, sw = 1) {
      U.spread = 0.6 + 0.3 * Math.sin(t * 0.9 * sw); U.t = t;
      cloak.userData.update();
      arms.forEach((tb, k) => tb.update((u, o) => { uf(u * 1.14, k / 8, o); }, u => 0.078 * (1 - u) + 0.014));
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const th = k / 8 * TAU; B.set(-Math.sin(th), 0, Math.cos(th));
        for (let i = 0; i < PER; i++) {
          const u = 0.22 + 0.82 * i / (PER - 1);
          uf(u, k / 8, a); uf(u + 0.01, k / 8, b); T.subVectors(b, a).normalize();
          N.crossVectors(T, B).normalize();
          const r = 0.078 * (1 - u / 1.14) + 0.014;
          a.addScaledVector(N, r * 0.7);
          q.setFromUnitVectors(Yax, N);
          m.compose(a, q, one.setScalar(1.1 - u * 0.5));
          cirri.setMatrixAt(n++, m);
        }
      }
      cirri.instanceMatrix.needsUpdate = true;
      fins.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * 0.4 * Math.sin(t * 2.2 * sw); });
      g.position.y = 0.06 * Math.sin(t * 0.9 * sw);
    },
  };
}

// ============ Barreleye ============
export function barreleye() {
  const g = new THREE.Group();
  const prof = u => {
    let r;
    if (u < 0.5) { const k = u / 0.5; r = 0.07 + 0.35 * Math.pow(0.5 - 0.5 * Math.cos(Math.PI * k), 0.85); }
    else { const k = (u - 0.5) / 0.5; r = 0.42 * Math.sqrt(Math.max(0, 1 - Math.pow(k, 2.6))); }
    return r * Math.sqrt(smooth(0, 0.04, u));
  };
  const sc = TEX.scales().clone(); sc.repeat.set(9, 4); sc.needsUpdate = true;
  const body = skin('#2c221e', { r: 0.42, sheen: 0.5, sheenColor: '#6b5a50', cc: 0.5, bump: sc, bs: 0.5 });
  const bodyGeo = surface(72, 48, (u, v, p) => {
    const th = v * TAU, r = prof(u);
    const yc = -0.02 * Math.sin(Math.PI * u) + 0.05 * smooth(0.7, 1, u);
    p.set(-1.05 + 2.0 * u, yc + Math.cos(th) * r, Math.sin(th) * r * 0.6);
  }, { capStart: true, capEnd: true });
  g.add(new THREE.Mesh(bodyGeo, body));

  const dome = new THREE.Mesh(ellipsoid(32, 40, [0.6, 0.25, 0], [0.4, 0.27, 0.205]), new THREE.MeshPhysicalMaterial({
    color: '#e6fff8', transmission: 1, thickness: 0.35, roughness: 0.06, ior: 1.3,
    attenuationColor: new THREE.Color('#7fe0c2'), attenuationDistance: 0.7, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 0.4, iridescenceIOR: 1.3, specularIntensity: 1,
  }));
  g.add(mark(dome));
  const tubeM = new THREE.MeshPhysicalMaterial({ color: '#2f6a4f', roughness: 0.35, clearcoat: 0.6 });
  const lensM = new THREE.MeshPhysicalMaterial({ color: '#8dffbe', emissive: '#2fd47e', emissiveIntensity: 0.9, roughness: 0.1, clearcoat: 1 });
  const eyes = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(0.62, 0.1, 0.075 * sd);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.2, 20), tubeM); c.position.y = 0.1;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 16), lensM); l.position.y = 0.21;
    piv.add(c, l); g.add(piv); return piv;
  });
  const nostrilM = new THREE.MeshStandardMaterial({ color: '#0a0706', roughness: 0.9 });
  for (const sd of [-1, 1]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), nostrilM); n.position.set(0.91, 0.17, 0.06 * sd); g.add(n); }

  const blue = finMat('#6f88b0'), olive = finMat('#5a5426');
  const tail = new THREE.Group(); tail.position.set(-1.0, 0.0, 0);
  tail.add(new THREE.Mesh(fan({ span: 0.12, len: 0.66, a0: -0.8, a1: 0.8, fork: 0.32 }), blue)); g.add(tail);
  const dorsal = new THREE.Mesh(fan({ span: 0.32, len: 0.36, a0: -0.55, a1: 0.25, round: true }), olive);
  dorsal.rotation.z = -Math.PI / 2; dorsal.position.set(-0.28, 0.34, 0); g.add(dorsal);
  const anal = new THREE.Mesh(fan({ span: 0.26, len: 0.3, a0: -0.2, a1: 0.5, round: true }), olive);
  anal.rotation.z = Math.PI / 2; anal.position.set(-0.5, -0.24, 0); g.add(anal);
  const pecs = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(0.32, -0.12, 0.2 * sd);
    piv.rotation.set(sd * 0.5, -sd * 0.5, -0.4);
    piv.add(new THREE.Mesh(fan({ span: 0.1, len: 0.38, a0: -0.5, a1: 0.5, round: true, cup: 0.03 }), olive)); g.add(piv); return piv;
  });
  const pelv = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(-0.02, -0.3, 0.1 * sd);
    piv.rotation.set(sd * 0.45, 0, -0.7);
    piv.add(new THREE.Mesh(fan({ span: 0.08, len: 0.36, a0: -0.4, a1: 0.4, round: true }), olive)); g.add(piv); return piv;
  });
  return {
    group: g, detail: [0.62, 0.32, 0.0],
    update(t, sw = 1) {
      tail.rotation.y = 0.28 * Math.sin(t * 2.6 * sw);
      g.rotation.y = -0.05 * Math.sin(t * 2.6 * sw - 0.6);
      pecs.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * (0.5 + 0.25 * Math.sin(t * 3.1 * sw + i)); });
      pelv.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * 0.15 * Math.sin(t * 2.4 * sw); });
      const look = 0.35 + 0.35 * Math.sin(t * 0.7);
      eyes.forEach(e => { e.rotation.z = -look; });
      g.position.y = 0.05 * Math.sin(t * 1.2 * sw);
    },
  };
}

// ============ Anglerfish ============
export function angler() {
  const g = new THREE.Group();
  const cDark = new THREE.Color('#1e1716'), cMid = new THREE.Color('#3d302b'), cMouth = new THREE.Color('#2a0b10'), cGum = new THREE.Color('#5a1b22');
  const upper = b => 0.12 - 0.08 * b * b, lower = b => -0.5 + 0.38 * b * b;
  const mouthMask = (d) => {
    if (d.x <= 0.05) return 0;
    const al = Math.atan2(d.y, Math.hypot(d.x, d.z)), be = Math.atan2(d.z, d.x);
    const ab = Math.abs(be);
    const s = (x, w) => smooth(-w, w, x);
    return s(al - lower(be), 0.06) * s(upper(be) - al, 0.05) * s(1.15 - ab, 0.12);
  };
  const dir = new V3();
  const shapeAt = (u, v, p) => {
    const a = Math.PI * u, th = v * TAU;
    dir.set(-Math.cos(a), Math.sin(a) * Math.cos(th), Math.sin(a) * Math.sin(th));
    let R = 1 + 0.05 * fbm(dir.x * 3, dir.y * 3, dir.z * 3, 3);
    R *= 1 + 0.16 * smooth(0.1, 0.8, dir.x) * smooth(-0.05, -0.6, dir.y); // underbite
    const m = mouthMask(dir);
    R *= 1 - 0.55 * m;
    p.set(dir.x * 0.86 * R, dir.y * 0.7 * R + 0.02, dir.z * 0.62 * R);
    return m;
  };
  const geo = surface(96, 96, shapeAt, {
    capStart: true, capEnd: true,
    color: (u, v, p, c) => {
      const m = mouthMask(dir.set(-Math.cos(Math.PI * u), Math.sin(Math.PI * u) * Math.cos(v * TAU), Math.sin(Math.PI * u) * Math.sin(v * TAU)));
      c.copy(cMid).lerp(cDark, smooth(-0.2, 0.6, p.y) * 0.8 + 0.2 * smooth(-0.2, 0.4, fbm(p.x * 6, p.y * 6, p.z * 6, 3)));
      c.lerp(cGum, smooth(0.0, 0.25, m)); c.lerp(cMouth, smooth(0.3, 0.9, m));
    },
  });
  const bodyM = skin('#ffffff', { vc: true, r: 0.6, sheen: 0.5, sheenColor: '#8a7a74', bs: 3, cc: 0.25 });
  g.add(new THREE.Mesh(geo, bodyM));

  // teeth
  const toothGeo = new THREE.ConeGeometry(1, 1, 8); toothGeo.translate(0, 0.5, 0);
  const toothM = new THREE.MeshPhysicalMaterial({ color: '#f4efe4', roughness: 0.2, transmission: 0.35, thickness: 0.05, clearcoat: 1 });
  const teeth = new THREE.InstancedMesh(toothGeo, toothM, 64); mark(teeth);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new V3(), tip = new V3();
  let n = 0;
  const placeLip = (lipFn, sign, count, off) => {
    for (let i = 0; i < count; i++) {
      const be = lerp(-0.95, 0.95, (i + 0.5) / count);
      const al = lipFn(be) + off;
      dir.set(Math.cos(al) * Math.cos(be), Math.sin(al), Math.cos(al) * Math.sin(be)).normalize();
      let R = 1 + 0.16 * smooth(0.1, 0.8, dir.x) * smooth(-0.05, -0.6, dir.y);
      pp.set(dir.x * 0.86 * R * 0.97, dir.y * 0.7 * R + 0.02, dir.z * 0.62 * R * 0.97);
      const len = (0.1 + 0.12 * Math.pow(Math.cos(be), 3)) * (0.7 + 0.6 * ((i * 7) % 5) / 5);
      tip.set(-dir.x * 0.25, sign, -dir.z * 0.25).normalize();
      q.setFromUnitVectors(Yax, tip);
      m4.compose(pp, q, new V3(0.016 + len * 0.1, len, 0.016 + len * 0.1));
      teeth.setMatrixAt(n++, m4);
    }
  };
  placeLip(upper, -1, 16, -0.015); placeLip(lower, 1, 14, 0.04);
  teeth.count = n; g.add(teeth);

  // tail stalk + fins
  const tailM = skin('#3a2f2b', { r: 0.6, sheen: 0.5, sheenColor: '#7a6a64', bs: 2 });
  const stalk = new Tube(10, 16, tailM);
  stalk.update((u, o) => o.set(-0.6 - 0.55 * u, 0.03 * u, 0), u => 0.3 * (1 - u) + 0.07);
  g.add(stalk.mesh);
  const finC = finMat('#4a3c37');
  const tail = new THREE.Group(); tail.position.set(-1.12, 0.03, 0);
  tail.add(new THREE.Mesh(fan({ span: 0.12, len: 0.45, a0: -0.7, a1: 0.7, round: true }), finC)); g.add(tail);
  const pecs = [-1, 1].map(sd => {
    const piv = new THREE.Group(); piv.position.set(-0.05, -0.12, 0.55 * sd);
    piv.rotation.set(sd * 0.3, -sd * 0.7, 0);
    piv.add(new THREE.Mesh(fan({ span: 0.12, len: 0.28, a0: -0.6, a1: 0.6, round: true }), finC)); g.add(piv); return piv;
  });
  const dors = new THREE.Mesh(fan({ span: 0.3, len: 0.2, a0: -0.6, a1: 0.0, round: true }), finC);
  dors.rotation.z = -Math.PI / 2; dors.position.set(-0.62, 0.38, 0); g.add(dors);
  const an = new THREE.Mesh(fan({ span: 0.24, len: 0.2, a0: 0, a1: 0.6, round: true }), finC);
  an.rotation.z = Math.PI / 2; an.position.set(-0.62, -0.32, 0); g.add(an);

  // eyes
  for (const sd of [-1, 1]) {
    const be = 0.62 * sd, al = 0.42;
    dir.set(Math.cos(al) * Math.cos(be), Math.sin(al), Math.cos(al) * Math.sin(be));
    const e = eye(0.05, '#9aa8a8', { pupil: 0.55, sclera: '#1c1a1a' });
    e.position.set(dir.x * 0.84, dir.y * 0.68 + 0.02, dir.z * 0.6); aim(e, dir); g.add(e);
  }
  // illicium + lure
  const rodM = skin('#4a3b35', { r: 0.6, bs: 0.5, sheen: 0.4, sheenColor: '#8a7a74' });
  const rod = new Tube(20, 8, rodM); g.add(rod.mesh);
  const lure = new THREE.Group();
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), new THREE.MeshPhysicalMaterial({
    color: '#dffcff', emissive: '#9ff4ff', emissiveIntensity: 2.2, roughness: 0.2, transmission: 0.3, thickness: 0.1, clearcoat: 1,
  }));
  const halo = glow('#8ff0ff', 0.75);
  const light = new THREE.PointLight('#a8f4ff', 1.2, 2.6, 1.6);
  lure.add(mark(bulb), halo, light); g.add(lure);
  const rodPt = (u, t, o) => {
    const sway = 0.06 * Math.sin(t * 1.7);
    return o.set(0.42 + 0.6 * u + sway * u * u, 0.58 + 0.62 * Math.sin(Math.PI * 0.62 * u) - 0.1 * u * u, 0.05 * Math.sin(t * 1.1) * u);
  };
  const jaw = { v: 0 };
  return {
    group: g, detail: [1.0, 0.95, 0], lure: { halo, light, bulb },
    update(t, sw = 1, env) {
      rod.update((u, o) => rodPt(u, t, o), u => 0.024 * (1 - u) + 0.011);
      rodPt(1.04, t, lure.position);
      const pulse = 0.8 + 0.2 * Math.sin(t * 4.3) * Math.sin(t * 1.7);
      const dark = env && env.dark;
      bulb.material.emissiveIntensity = (dark ? 3.2 : 1.6) * pulse;
      halo.material.opacity = (dark ? 1 : 0.55) * pulse;
      light.intensity = (dark ? 2.5 : 0.8) * pulse;
      tail.rotation.y = 0.32 * Math.sin(t * 2.2 * sw);
      pecs.forEach((p, i) => { p.rotation.y = (i ? 0.7 : -0.7) + 0.3 * Math.sin(t * 2.8 * sw + i); });
      g.rotation.z = 0.04 * Math.sin(t * 1.1);
      g.position.y = 0.05 * Math.sin(t * 1.1 * sw);
      jaw.v = t;
    },
  };
}

// ============ Gulper eel ============
export function gulper() {
  const g = new THREE.Group();
  const dark = skin('#272a39', { r: 0.42, sheen: 0.8, sheenColor: '#7c83a8', cc: 0.45, bs: 0.6 });
  const head = new THREE.Mesh(surface(24, 32, (u, v, p) => {
    const th = v * TAU, x = -0.32 + 0.6 * u, r = 0.18 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.5)));
    p.set(x, 0.02 + Math.cos(th) * r * 0.85 - 0.04 * u, Math.sin(th) * r);
  }, { capEnd: true }), dark);
  g.add(head);
  for (const sd of [-1, 1]) {
    const e = eye(0.035, '#cfd6e6', { pupil: 0.6, sclera: '#20232e' });
    e.position.set(0.14, 0.1, 0.105 * sd); aim(e, new V3(0.4, 0.3, sd)); g.add(e);
  }
  const jawLine = (u) => ({ x: 0.12 + 1.38 * u, y: -0.04 - 0.16 * u });
  const upperJaw = new Tube(16, 8, dark, 0.45);
  upperJaw.update((u, o) => { const j = jawLine(u); o.set(j.x, j.y + 0.03, 0); }, u => 0.06 * (1 - u) + 0.012);
  g.add(upperJaw.mesh);

  const P = { open: 1, t: 0 };
  const pouchFn = (u, v, p) => {
    const j = jawLine(u), sv = Math.sin(Math.PI * v);
    const w = 0.08 + 0.56 * Math.sin(Math.PI * Math.pow(u, 0.8));
    const D = P.open * (0.1 + 0.85 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 1.3)) * (1 + 0.05 * Math.sin(u * 7 - P.t * 2.4) * sv);
    p.set(j.x - 0.22 * sv * D, j.y - D * sv, w * Math.cos(Math.PI * v) * (1 + 0.3 * sv));
  };
  const pouch = surface(40, 36, pouchFn, { closed: false });
  g.add(new THREE.Mesh(pouch, skin('#3c3549', { r: 0.5, sheen: 0.9, sheenColor: '#9a86b0', cc: 0.3, bs: 0.5 })));
  g.add(new THREE.Mesh(pouch, skin('#c08aa2', { r: 0.55, sheen: 1, sheenColor: '#ffd0e4', side: THREE.BackSide, bs: 0.5 })));
  const toothGeo = new THREE.ConeGeometry(0.012, 0.05, 6); toothGeo.translate(0, 0.025, 0);
  const teeth = new THREE.InstancedMesh(toothGeo, new THREE.MeshPhysicalMaterial({ color: '#f1ece0', roughness: 0.3, clearcoat: 1 }), 48);
  mark(teeth);
  const m4 = new THREE.Matrix4(), pp = new V3();
  let n = 0;
  for (const v of [0, 1]) for (let i = 0; i < 22; i++) {
    const u = 0.08 + 0.88 * i / 21;
    pouchFn(u, v, pp); pp.y += 0.01;
    m4.makeTranslation(pp.x, pp.y, pp.z); teeth.setMatrixAt(n++, m4);
  }
  teeth.count = n; g.add(teeth);

  const body = new Tube(70, 12, dark); g.add(body.mesh);
  const pts = Array.from({ length: 70 }, () => new V3());
  const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd1ea', emissive: '#ff5fae', emissiveIntensity: 2.5 }));
  const tipGlow = glow('#ff6fb8', 0.4);
  g.add(mark(tipLight), tipGlow);
  return {
    group: g, detail: [0.55, -0.45, 0.4],
    update(t, sw = 1, env) {
      P.open = 1 + 0.1 * Math.sin(t * 1.3 * sw); P.t = t * sw;
      pouch.userData.update();
      const L = 4.4 / 69;
      let x = -0.16, y = 0.02, z = 0;
      for (let i = 0; i < 70; i++) {
        const u = i / 69;
        pts[i].set(x, y, z);
        const ph = Math.PI - 1.45 * smooth(0, 0.35, u) - 2.0 * smooth(0.45, 0.97, u) + 0.2 * Math.sin(u * 9 - t * 2.6 * sw) * u;
        x += L * Math.cos(ph); y += L * Math.sin(ph);
        z = 0.12 * Math.sin(u * 5 - t * 1.8 * sw) * u;
      }
      body.update((u, o) => o.copy(pts[Math.round(u * 69)]), u => 0.12 * Math.pow(1 - u, 1.3) + 0.007);
      tipLight.position.copy(pts[69]); tipGlow.position.copy(pts[69]);
      tipGlow.material.opacity = (env && env.dark ? 1 : 0.5) * (0.75 + 0.25 * Math.sin(t * 3));
      g.position.y = 0.05 * Math.sin(t * 1.0 * sw);
    },
  };
}

// ============ Nautilus ============
function shellTexture() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 256;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(2048, 256), d = img.data;
  const cream = [244, 232, 214], s1 = [186, 62, 38], s2 = [214, 104, 58];
  for (let y = 0; y < 256; y++) for (let x = 0; x < 2048; x++) {
    const u = x / 2048, phi = y / 256 * TAU;
    const th = -5.5 * Math.PI * (1 - u);
    const out = Math.cos(phi);                                    // 1 = venter (outer edge), -1 = umbilical side
    const zig = 0.22 * Math.abs(((phi / TAU * 7) % 1) * 2 - 1) + 0.1 * Math.sin(phi * 2);
    const phase = -th * 2.6 / TAU * 6 + zig + 0.15 * fbm(u * 40, phi, 1, 2);
    const sv = Math.sin(phase * TAU);
    let k = smooth(-0.25, 0.25, sv);
    k *= 1 - smooth(-1.4, -0.35, th);                               // newest growth is plain
    k *= 0.55 + 0.45 * smooth(-1, 0.2, -out);                       // a little softer on the venter
    const n = fbm(u * 80, y / 30, 3, 3) * 0.1;
    const c = s1.map((a, i) => lerp(a, s2[i], 0.5 + n * 3));
    const k2 = clamp(k, 0, 1), o = (y * 2048 + x) * 4;
    for (let i = 0; i < 3; i++) d[o + i] = clamp(lerp(cream[i] * (1 + n * 0.5), c[i], k2), 0, 255);
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function nautilus() {
  const g = new THREE.Group();
  const shell = new THREE.Group(); g.add(shell);
  const A = 0.9, b = 0.18, k = 0.56, th0 = -5.5 * Math.PI;
  const sg = surface(220, 48, (u, v, p) => {
    const th = lerp(th0, 0, u), R = A * Math.exp(b * th), rho = k * R, phi = v * TAU;
    const rr = R + rho * Math.cos(phi);
    p.set(rr * Math.cos(th), rr * Math.sin(th), rho * 1.02 * Math.sin(phi));
  }, { capStart: true, orient: false });
  const shellM = new THREE.MeshPhysicalMaterial({ map: shellTexture(), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15, side: THREE.DoubleSide, bumpMap: TEX.grain(), bumpScale: 0.3 });
  shell.add(new THREE.Mesh(sg, shellM));

  // aperture frame: x = forward (tangent), y = venter (outward), z = side
  const tn = new V3(b, 1, 0).normalize(), er = new V3(1, 0, 0), ez = new V3(0, 0, 1);
  const ap = new THREE.Group();
  ap.matrixAutoUpdate = false;
  ap.matrix.makeBasis(tn, er, ez).setPosition(A, 0, 0);
  shell.add(ap);
  const cHood = new THREE.Color('#a9572f'), cSpot = new THREE.Color('#f2e2cc'), cFlesh = new THREE.Color('#f3d2b4');
  const hood = new THREE.Mesh(ellipsoid(32, 40, [0.12, -0.3, 0], [0.42, 0.2, 0.46], {
    warp: (u, v, p) => { p.y -= 0.12 * Math.pow(Math.abs(p.z) / 0.46, 2); },
    color: (u, v, p, c) => { c.copy(cHood).lerp(cSpot, smooth(0.08, 0.3, fbm(p.x * 7, p.y * 7, p.z * 7, 3))); },
  }), skin('#ffffff', { vc: true, r: 0.55, sheen: 0.6, sheenColor: '#e0a080', bs: 1.5 }));
  ap.add(hood);
  const fleshM = skin('#f0cba8', { r: 0.5, sheen: 1, sheenColor: '#ffe6d0', bs: 0.5 });
  ap.add(new THREE.Mesh(ellipsoid(24, 32, [0.0, 0.06, 0], [0.3, 0.42, 0.44]), fleshM));
  for (const sd of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), fleshM);
    stalk.position.set(0.17, 0.04, 0.38 * sd); ap.add(stalk);
    const e = eye(0.105, '#9a9aa0', { pupil: 0.35, sclera: '#5a5560' });
    e.position.set(0.19, 0.04, 0.44 * sd); aim(e, new V3(0.3, 0.05, sd)); ap.add(e);
  }
  const tentM = skin('#eab48a', { r: 0.5, sheen: 1, sheenColor: '#fff0e0', bs: 0.4 });
  const tents = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 38; i++) {
    const zz = (rnd() * 2 - 1) * 0.3, yy = -0.02 + rnd() * 0.36;
    const base = new V3(0.24, yy, zz);
    const d = new V3(1, 0.2 + rnd() * 0.5, zz * 1.4 + (rnd() - 0.5) * 0.4).normalize();
    const tb = new Tube(12, 6, tentM);
    tents.push({ tb, base, d, L: 0.5 + rnd() * 0.4, ph: rnd() * TAU, r: 0.022 + rnd() * 0.012 });
    ap.add(tb.mesh);
  }
  shell.rotation.z = -1.62;
  const side = new V3(), up = new V3();
  return {
    group: g, detail: [0.0, 0.0, 0.0], ap,
    update(t, sw = 1) {
      for (const T of tents) {
        side.set(0, 1, 0).cross(T.d).normalize(); up.crossVectors(T.d, side);
        T.tb.update((u, o) => {
          const w = Math.sin(u * 4 + t * 1.8 * sw + T.ph) * 0.09 * u, w2 = Math.cos(u * 3 + t * 1.3 * sw + T.ph) * 0.07 * u;
          o.copy(T.base).addScaledVector(T.d, u * T.L).addScaledVector(side, w).addScaledVector(up, w2 + 0.12 * u * u);
        }, u => T.r * (1 - u * 0.7));
      }
      g.rotation.z = 0.05 * Math.sin(t * 0.8);
      g.position.y = 0.07 * Math.sin(t * 0.8 * sw);
    },
  };
}

export const BUILD = { dumbo, angler, vampire, barreleye, gulper, nautilus };
