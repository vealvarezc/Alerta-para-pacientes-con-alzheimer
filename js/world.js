// Mundo: casa (sala, cocina, cuarto, baño, habitación), muebles,
// colisionadores, obstáculos y marcadores de ruta.
import * as THREE from 'three';

const WALL_H = 2.8, WALL_T = 0.25;

function mat(color, rough = 0.9, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02, ...extra });
}
function box(w, h, d, m) {
  const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  ms.castShadow = true; ms.receiveShadow = true;
  return ms;
}
function labelSprite(text, bg = '#ffb347', fg = '#2a1c05', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.arc(size/2, size/2, size/2 - 6, 0, 7); g.fill();
  g.fillStyle = fg; g.font = `900 ${size*0.55}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, size/2, size/2 + size*0.03);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.6, 0.6, 1);
  return sp;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];   // {x1,z1,x2,z2}
    this.obstacles = [];   // {x,z,r,kind}
    this.checkpointMeshes = [];
    this.hologramMats = [];
    this._build();
  }

  addCollider(x1, z1, x2, z2) {
    this.colliders.push({ x1: Math.min(x1,x2), z1: Math.min(z1,z2), x2: Math.max(x1,x2), z2: Math.max(z1,z2) });
  }

  // Pared recta con huecos de puerta: axis 'x' (fija z) o 'z' (fija x)
  wall(axis, fixed, from, to, gaps = [], material = null) {
    const m = material || mat(0xe8e0d0);
    const segs = [];
    let cur = from;
    const sorted = [...gaps].sort((a,b) => a[0]-b[0]);
    for (const [g1,g2] of sorted) { segs.push([cur, g1]); cur = g2; }
    segs.push([cur, to]);
    for (const [a,b] of segs) {
      if (b - a < 0.05) continue;
      const len = b - a, mid = (a + b) / 2;
      const w = axis === 'x' ? len : WALL_T;
      const d = axis === 'x' ? WALL_T : len;
      const mesh = box(w, WALL_H, d, m);
      mesh.position.set(axis === 'x' ? mid : fixed, WALL_H/2, axis === 'x' ? fixed : mid);
      this.group.add(mesh);
      this.hologramMats.push(m);
      const hx = w/2, hz = d/2;
      this.addCollider(mesh.position.x - hx, mesh.position.z - hz, mesh.position.x + hx, mesh.position.z + hz);
    }
    // marcos + dintel en cada puerta
    const frameM = mat(0x8a5a33, 0.7);
    for (const [g1,g2] of sorted) {
      const mid = (g1+g2)/2, doorW = g2-g1;
      const lintel = box(axis==='x'?doorW:WALL_T+0.1, WALL_H-2.1, axis==='x'?WALL_T+0.1:doorW, frameM);
      lintel.position.set(axis==='x'?mid:fixed, 2.1+(WALL_H-2.1)/2, axis==='x'?fixed:mid);
      this.group.add(lintel);
      for (const e of [g1+0.06, g2-0.06]) {
        const post = box(axis==='x'?0.12:WALL_T+0.1, 2.1, axis==='x'?WALL_T+0.1:0.12, frameM);
        post.position.set(axis==='x'?e:fixed, 1.05, axis==='x'?fixed:e);
        this.group.add(post);
      }
      // puerta abierta (panel girado)
      const panel = box(doorW-0.15, 2.0, 0.06, mat(0xa06a3a, 0.6));
      if (axis === 'x') panel.position.set(g1 + 0.1, 1.0, fixed + 0.35);
      else panel.position.set(fixed + 0.35, 1.0, g1 + 0.1);
      panel.rotation.y = axis === 'x' ? 0.5 : -0.5 + Math.PI/2;
      this.group.add(panel);
    }
  }

  solid(mesh, x, z, w, d, y = null) {
    mesh.position.x = x; mesh.position.z = z;
    if (y !== null) mesh.position.y = y;
    this.group.add(mesh);
    this.addCollider(x - w/2, z - d/2, x + w/2, z + d/2);
    return mesh;
  }

  _build() {
    this._floors();
    this._walls();
    this._furniture();
    this._lights();
    this._checkpointProps();
  }

  _floors() {
    const floorM = mat(0xb98a5a, 0.8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 10.5), floorM);
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true;
    this.group.add(floor);
    this.hologramMats.push(floorM);
    // tablones: líneas sutiles
    const lineM = new THREE.MeshBasicMaterial({ color: 0x8f6238 });
    for (let i = -6; i <= 6; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 10.5), lineM);
      l.rotation.x = -Math.PI/2; l.position.set(i, 0.005, 0);
      this.group.add(l);
    }
    // baldosa cocina y baño
    const tileM = mat(0xcfd8dc, 0.5);
    const kc = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), tileM);
    kc.rotation.x = -Math.PI/2; kc.position.set(-3, 0.01, -2.5); kc.receiveShadow = true;
    this.group.add(kc);
    const bt = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), mat(0xbfe3ea, 0.4));
    bt.rotation.x = -Math.PI/2; bt.position.set(5.5, 0.012, -3); bt.receiveShadow = true;
    this.group.add(bt);
    // césped exterior
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0x5d8f5f, 1));
    grass.rotation.x = -Math.PI/2; grass.position.y = -0.05;
    this.group.add(grass);
  }

  _walls() {
    const ext = mat(0xded5c2);
    // exteriores (x: -7..7, z: -5..5)
    this.wall('x', -5, -7, 7, [], ext);   // norte
    this.wall('x', 5, -7, 7, [], ext);    // sur
    this.wall('z', -7, -5, 5, [], ext);   // oeste
    this.wall('z', 7, -5, 5, [], ext);    // este
    // interiores
    this.wall('z', 1, -5, 3.4, [[-3,-2],[0,1.4]]);        // A: separa izq/der
    this.wall('x', 0, -7, 1, [[-3.2,-1.8]]);             // B: sala/cocina
    this.wall('x', -1, 1, 7, [[3.5,5.0]]);               // C: baño/habitación
    this.wall('z', 4, -5, -1, [[-3.5,-2.5]]);            // D: cuarto/baño
    // puerta principal (visual) en muro sur
    const door = box(1.2, 2.2, 0.12, mat(0x7a4a24, 0.6));
    door.position.set(-5.8, 1.1, 4.9); this.group.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05), mat(0xd9c27a, 0.3));
    knob.position.set(-5.4, 1.05, 4.8); this.group.add(knob);
    const mat_ = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), mat(0x8a2f2f, 1));
    mat_.rotation.x = -Math.PI/2; mat_.position.set(-5.8, 0.02, 4.2); this.group.add(mat_);
    // ventanas con luz
    const winM = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x9fd4ff, emissiveIntensity: 0.7 });
    const frameM = mat(0xffffff, 0.6);
    const win = (x, z, ry) => {
      const g = new THREE.Group();
      const f = box(1.6, 1.2, 0.1, frameM); g.add(f);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), winM); p.position.z = 0.06; g.add(p);
      const bar1 = box(1.3, 0.06, 0.02, frameM); bar1.position.z = 0.07; g.add(bar1);
      const bar2 = box(0.06, 0.95, 0.02, frameM); bar2.position.z = 0.07; g.add(bar2);
      g.position.set(x, 1.6, z); g.rotation.y = ry;
      this.group.add(g);
    };
    win(-2, 4.93, Math.PI); win(3, 4.93, Math.PI); win(-4, -4.93, 0); win(5.5, -4.93, 0);
    // zócalos
    const trimM = mat(0x7a6a55, 0.8);
    const trim = (w,d,x,z) => { const t = box(w,0.12,d,trimM); t.position.set(x,0.06,z); this.group.add(t); };
    trim(13.8,0.06,0,4.85); trim(13.8,0.06,0,-4.85); trim(0.06,9.8,-6.85,0); trim(0.06,9.8,6.85,0);
  }

  _sofa(x, z, ry, color = 0x4a6fa5) {
    const g = new THREE.Group();
    const m = mat(color, 0.95);
    const base = box(2.2, 0.5, 0.95, m); base.position.y = 0.35; g.add(base);
    const back = box(2.2, 0.7, 0.25, m); back.position.set(0, 0.85, -0.4); g.add(back);
    for (const s of [-0.95, 0.95]) { const arm = box(0.25, 0.65, 0.95, m); arm.position.set(s, 0.6, 0); g.add(arm); }
    for (const s of [-0.55, 0.55]) { const c = box(1.0, 0.18, 0.8, mat(0x5d84bd, 0.95)); c.position.set(s, 0.65, 0.05); g.add(c); }
    g.position.set(x, 0, z); g.rotation.y = ry;
    this.group.add(g);
    const alongX = Math.abs(Math.cos(ry)) > 0.5;
    this.addCollider(x - (alongX?1.15:0.55), z - (alongX?0.55:1.15), x + (alongX?1.15:0.55), z + (alongX?0.55:1.15));
  }

  _table(x, z, w = 1.6, d = 0.9, h = 0.75, top = 0x8a5a33) {
    const g = new THREE.Group();
    const tm = mat(top, 0.6);
    const t = box(w, 0.08, d, tm); t.position.y = h; g.add(t);
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const leg = box(0.08, h, 0.08, tm); leg.position.set(sx*(w/2-0.08), h/2, sz*(d/2-0.08)); g.add(leg);
    }
    g.position.set(x, 0, z); this.group.add(g);
    this.addCollider(x-w/2, z-d/2, x+w/2, z+d/2);
    return g;
  }

  _chair(x, z, ry) {
    const g = new THREE.Group();
    const m = mat(0x9a6a40, 0.7);
    const seat = box(0.45, 0.07, 0.45, m); seat.position.y = 0.46; g.add(seat);
    const back = box(0.45, 0.55, 0.07, m); back.position.set(0, 0.75, -0.2); g.add(back);
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const leg = box(0.06, 0.46, 0.06, m); leg.position.set(sx*0.18, 0.23, sz*0.18); g.add(leg);
    }
    g.position.set(x, 0, z); g.rotation.y = ry; this.group.add(g);
    this.addCollider(x-0.25, z-0.25, x+0.25, z+0.25);
  }

  _bed(x, z, w = 2.0, d = 1.7) {
    const g = new THREE.Group();
    const frame = box(w, 0.35, d, mat(0x6b4a2f, 0.7)); frame.position.y = 0.25; g.add(frame);
    const head = box(w, 1.0, 0.15, mat(0x6b4a2f, 0.7)); head.position.set(0, 0.7, d/2); g.add(head);
    const sheet = box(w-0.15, 0.18, d-0.15, mat(0xe8f0ff, 0.95)); sheet.position.y = 0.5; g.add(sheet);
    const blanket = box(w-0.15, 0.1, d*0.55, mat(0xc65b7c, 0.95)); blanket.position.set(0, 0.55, -d*0.15); g.add(blanket);
    for (const s of [-1,1]) { const p = box(0.6, 0.15, 0.35, mat(0xffffff, 0.95)); p.position.set(s*w*0.25, 0.6, d/2-0.3); g.add(p); }
    g.position.set(x, 0, z); this.group.add(g);
    this.addCollider(x-w/2, z-d/2, x+w/2, z+d/2);
  }

  _lamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.6), mat(0x444a55, 0.5));
    pole.position.y = 0.8; pole.castShadow = true; g.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.35, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf5e6c4, emissive: 0xffe2a8, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
    shade.position.y = 1.7; g.add(shade);
    g.position.set(x, 0, z); this.group.add(g);
    this.addCollider(x-0.15, z-0.15, x+0.15, z+0.15);
  }

  _plant(x, z, s = 1) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18*s, 0.14*s, 0.3*s, 10), mat(0xa8542f, 0.8));
    pot.position.y = 0.15*s; pot.castShadow = true; g.add(pot);
    const leafM = mat(0x3f7a3f, 1);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12*s, 0.7*s, 6), leafM);
      leaf.position.set((Math.random()-0.5)*0.3*s, (0.55+Math.random()*0.25)*s, (Math.random()-0.5)*0.3*s);
      leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, 0, z); this.group.add(g);
    this.addCollider(x-0.2*s, z-0.2*s, x+0.2*s, z+0.2*s);
  }

  _rug(x, z, w, d, color) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 1));
    r.rotation.x = -Math.PI/2; r.position.set(x, 0.015, z); r.receiveShadow = true;
    this.group.add(r);
  }

  _furniture() {
    // ===== SALA =====
    this._sofa(-6.2, 2.4, Math.PI/2);
    this._sofa(-5.0, 0.9, Math.PI/2 + 0.5, 0x7a5fa0); // sillón
    this._table(-5.3, 2.4, 1.1, 0.6, 0.4, 0x6b4a2f); // mesa centro
    this._rug(-5.4, 2.4, 2.6, 2.0, 0xa03a3a);
    // TV + mueble en muro A
    const tvStand = box(0.4, 0.5, 1.8, mat(0x4a3628, 0.7)); this.solid(tvStand, 0.65, 2.4, 0.4, 1.8, 0.25);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0x3a6fd8, emissiveIntensity: 0.8 }));
    this.tvScreen.rotation.y = -Math.PI/2; this.tvScreen.position.set(0.42, 1.15, 2.4);
    this.group.add(this.tvScreen);
    const tvBase = box(0.15, 0.45, 0.3, mat(0x222222, 0.6)); tvBase.position.set(0.5, 0.7, 2.4); this.group.add(tvBase);
    // librero
    const shelf = new THREE.Group();
    const shM = mat(0x7a5230, 0.7);
    const frame = box(1.4, 1.9, 0.35, shM); frame.position.y = 0.95; shelf.add(frame);
    const bookCols = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
      const bk = box(0.12, 0.4, 0.22, mat(bookCols[(r+i)%5], 0.8));
      bk.position.set(-0.5 + i*0.2, 0.55 + r*0.55, 0.05); shelf.add(bk);
    }
    shelf.position.set(-0.6, 0, 0.45); this.group.add(shelf);
    this.addCollider(-1.35, 0.25, 0.15, 0.65);
    this._plant(-6.5, 4.5); this._lamp(-0.3, 4.5);
    this._rug(-4.0, 4.0, 1.4, 1.0, 0x3f6fa0);
    // juguetes (OBSTÁCULO)
    const toyG = new THREE.Group();
    const toyCols = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db];
    [[0,0],[0.35,0.1],[0.15,0.35],[-0.2,0.25]].forEach(([ox,oz], i) => {
      const b = box(0.3, 0.3, 0.3, mat(toyCols[i], 0.7));
      b.position.set(ox, 0.15, oz); b.rotation.y = i * 0.5; toyG.add(b);
    });
    toyG.position.set(-4.8, 0, 2.6); this.group.add(toyG);
    this.obstacles.push({ x: -4.8, z: 2.6, r: 0.95, kind: 'juguete' });
    const toySign = labelSprite('🧸', '#fff', '#000'); toySign.position.set(-4.8, 1.1, 2.6); toySign.scale.set(0.45,0.45,1); this.group.add(toySign);

    // ===== COCINA =====
    const counterM = mat(0xd8d8d8, 0.5);
    const counter = box(6.0, 0.9, 0.65, counterM); this.solid(counter, -3.5, -4.55, 6.0, 0.65, 0.45);
    const counterTop = box(6.1, 0.06, 0.7, mat(0x8a8f96, 0.4)); counterTop.position.set(-3.5, 0.93, -4.55); this.group.add(counterTop);
    const stove = box(0.9, 0.06, 0.6, mat(0x222831, 0.4)); stove.position.set(-2.2, 0.97, -4.55); this.group.add(stove);
    const sink = box(0.8, 0.08, 0.5, mat(0x9fb3c0, 0.3)); sink.position.set(-4.5, 0.96, -4.55); this.group.add(sink);
    const fridge = box(0.9, 1.9, 0.8, mat(0xe8ecef, 0.35)); this.solid(fridge, -0.4, -4.4, 0.9, 0.8, 0.95);
    this._table(-5.0, -1.6, 1.5, 1.0, 0.74);
    this._chair(-5.6, -1.6, Math.PI/2); this._chair(-4.4, -1.6, -Math.PI/2);
    this._chair(-5.0, -2.3, 0); this._chair(-5.0, -0.9, Math.PI);
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(0xe67e22, 0.6));
    fruit.position.set(-5.0, 0.95, -1.6); fruit.castShadow = true; this.group.add(fruit);
    // suelo mojado (OBSTÁCULO)
    const wet = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshStandardMaterial({ color: 0x7fc4e8, transparent: true, opacity: 0.55, roughness: 0.1 }));
    wet.rotation.x = -Math.PI/2; wet.position.set(-4.4, 0.02, -3.4); this.group.add(wet);
    this.wetMesh = wet;
    this.obstacles.push({ x: -4.4, z: -3.4, r: 1.0, kind: 'mojado' });
    const wetSign = labelSprite('⚠️', '#ffd23f', '#000'); wetSign.position.set(-4.4, 1.2, -3.4); wetSign.scale.set(0.45,0.45,1); this.group.add(wetSign);

    // ===== CUARTO / ESTUDIO =====
    this._table(2.5, -4.4, 1.4, 0.7, 0.74, 0x5a4632);
    this._chair(2.5, -3.7, Math.PI);
    const monitor = box(0.55, 0.36, 0.06, mat(0x1a1a22, 0.4)); monitor.position.set(2.5, 1.05, -4.5); this.group.add(monitor);
    const mScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x061018, emissive: 0x2fd8a8, emissiveIntensity: 0.7 }));
    mScreen.position.set(2.5, 1.05, -4.46); this.group.add(mScreen);
    const shelf2 = box(0.9, 1.8, 0.35, mat(0x7a5230, 0.7)); this.solid(shelf2, 3.5, -4.6, 0.9, 0.35, 0.9);
    this._rug(2.6, -2.6, 1.8, 1.6, 0x3f8f6f);
    this._plant(3.5, -1.5, 0.8);

    // ===== BAÑO =====
    const toilet = new THREE.Group();
    const tb = box(0.5, 0.4, 0.6, mat(0xf4f6f8, 0.3)); tb.position.y = 0.2; toilet.add(tb);
    const tt = box(0.5, 0.5, 0.18, mat(0xf4f6f8, 0.3)); tt.position.set(0, 0.55, -0.28); toilet.add(tt);
    toilet.position.set(6.3, 0, -4.2); this.group.add(toilet);
    this.addCollider(6.0, -4.6, 6.6, -3.9);
    const sinkB = box(0.7, 0.5, 0.5, mat(0xf4f6f8, 0.3)); this.solid(sinkB, 5.2, -4.5, 0.7, 0.5, 0.45);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.6 }));
    mirror.position.set(5.2, 1.6, -4.85); this.group.add(mirror);
    const tub = box(1.7, 0.55, 0.85, mat(0xeaf4f8, 0.3)); this.solid(tub, 6.0, -1.9, 1.7, 0.85, 0.28);
    const tubW = box(1.5, 0.1, 0.65, mat(0x9fd4e8, 0.2)); tubW.position.set(6.0, 0.5, -1.9); this.group.add(tubW);

    // ===== HABITACIÓN =====
    this._bed(5.5, 3.8);
    for (const nx of [4.2, 6.8]) {
      const ns = box(0.5, 0.5, 0.45, mat(0x6b4a2f, 0.7)); this.solid(ns, nx, 4.55, 0.5, 0.45, 0.25);
      const lampS = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffdf9e, emissiveIntensity: 1 }));
      lampS.position.set(nx, 0.65, 4.55); this.group.add(lampS);
    }
    const ward = box(1.6, 2.1, 0.6, mat(0x5a3d26, 0.7)); this.solid(ward, 1.9, 4.6, 1.6, 0.6, 1.05);
    const dress = box(1.2, 0.9, 0.5, mat(0x7a5230, 0.7)); this.solid(dress, 6.4, 0.6, 1.2, 0.5, 0.45);
    this._rug(4.6, 2.6, 2.4, 1.8, 0x8f6fb0);
    this._plant(1.5, -0.4, 0.9);
    // cama de la mascota
    const petBed = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.16, 8, 16), mat(0xb5651d, 0.95));
    petBed.rotation.x = -Math.PI/2; petBed.position.set(2.2, 0.1, 3.6); this.group.add(petBed);

    // lámparas de techo (visuales)
    const ceilM = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe9b8, emissiveIntensity: 1 });
    for (const [lx, lz] of [[-3,2.5],[-3,-2.5],[2.6,-3],[5.5,-3],[4,2]]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), mat(0x333333, 0.6));
      cable.position.set(lx, 2.6, lz); this.group.add(cable);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), ceilM);
      bulb.position.set(lx, 2.3, lz); this.group.add(bulb);
    }
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a6a4a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(6, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
    sun.shadow.camera.far = 30;
    this.scene.add(sun);
    for (const [lx, lz] of [[-3,2.5],[-3,-2.5],[2.6,-3],[5.5,-3],[4,2]]) {
      const p = new THREE.PointLight(0xffe2b0, 12, 9, 1.8);
      p.position.set(lx, 2.2, lz);
      this.scene.add(p);
    }
  }

  _checkpointProps() {
    // anillos flotantes por punto de ruta (se crean vía setRoute)
    this.cpGroup = new THREE.Group();
    this.group.add(this.cpGroup);
  }

  setRoute(route) {
    while (this.cpGroup.children.length) this.cpGroup.remove(this.cpGroup.children[0]);
    this.checkpointMeshes = [];
    route.forEach((cp, i) => {
      const g = new THREE.Group();
      const ringM = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 28), ringM);
      ring.rotation.x = Math.PI/2; g.add(ring);
      const beamM = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18, depthWrite: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 16, 1, true), beamM);
      beam.position.y = 1.3; g.add(beam);
      const tag = labelSprite(String(cp.id)); tag.position.y = 2.2; g.add(tag);
      g.position.set(cp.x, 1.1, cp.z);
      g.userData = { ringM, beamM, tag };
      this.cpGroup.add(g);
      this.checkpointMeshes.push(g);
    });
    this.setNextCheckpoint(0);
  }

  setNextCheckpoint(idx) {
    this.nextCp = idx;
    this.checkpointMeshes.forEach((g, i) => {
      const done = i < idx, next = i === idx;
      g.visible = !done;
      g.userData.ringM.emissiveIntensity = next ? 1.6 : 0.4;
      g.userData.beamM.opacity = next ? 0.22 : 0.07;
      g.scale.setScalar(next ? 1 : 0.7);
    });
  }

  // Resolver colisión de un círculo (jugador) contra AABBs
  resolveCircle(pos, radius) {
    let collided = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        const cx = Math.max(c.x1, Math.min(pos.x, c.x2));
        const cz = Math.max(c.z1, Math.min(pos.z, c.z2));
        let dx = pos.x - cx, dz = pos.z - cz;
        let d = Math.hypot(dx, dz);
        if (d < radius) {
          collided = true;
          if (d < 0.0001) {
            // centro dentro: empujar por el lado más cercano
            const l = pos.x - c.x1, r = c.x2 - pos.x, t = pos.z - c.z1, b = c.z2 - pos.z;
            const m = Math.min(l, r, t, b);
            if (m === l) pos.x = c.x1 - radius;
            else if (m === r) pos.x = c.x2 + radius;
            else if (m === t) pos.z = c.z1 - radius;
            else pos.z = c.z2 + radius;
          } else {
            const push = (radius - d) / d;
            pos.x += dx * push; pos.z += dz * push;
          }
        }
      }
    }
    // límites absolutos
    pos.x = Math.max(-6.7, Math.min(6.7, pos.x));
    pos.z = Math.max(-4.7, Math.min(4.7, pos.z));
    return collided;
  }

  isBlocked(x, z, r = 0.3) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x1, Math.min(x, c.x2));
      const cz = Math.max(c.z1, Math.min(z, c.z2));
      if (Math.hypot(x - cx, z - cz) < r) return true;
    }
    return false;
  }

  setHologram(on) {
    for (const m of this.hologramMats) {
      m.transparent = on;
      m.opacity = on ? 0.35 : 1;
      m.needsUpdate = true;
    }
  }

  update(dt, t) {
    // anillos de ruta
    for (let i = 0; i < this.checkpointMeshes.length; i++) {
      const g = this.checkpointMeshes[i];
      if (!g.visible) continue;
      g.position.y = 1.1 + Math.sin(t * 2 + i) * 0.12;
      g.rotation.y += dt * (i === this.nextCp ? 1.6 : 0.4);
    }
    // TV parpadeante
    if (this.tvScreen) {
      this.tvScreen.material.emissiveIntensity = 0.6 + Math.random() * 0.4;
    }
    // suelo mojado: brillo pulsante
    if (this.wetMesh) {
      this.wetMesh.material.opacity = 0.45 + Math.sin(t * 3) * 0.15;
    }
  }
}
