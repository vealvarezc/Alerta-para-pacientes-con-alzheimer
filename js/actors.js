// Actores: personas (cuidador, familiar) y mascotas (perro Max, gata Mishi)
import * as THREE from 'three';

function mat(color, rough = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,30,0.75)';
  g.beginPath(); g.roundRect(4, 6, 248, 52, 14); g.fill();
  g.fillStyle = '#fff'; g.font = '700 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(1.1, 0.28, 1);
  return sp;
}

class Person {
  constructor(name, shirt, pants, skin = 0xc98d64) {
    this.g = new THREE.Group();
    this.walkPhase = Math.random() * 6;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), mat(pants));
    legs.position.y = 0.55; legs.castShadow = true; this.g.add(legs);
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), mat(shirt));
    this.torso.position.y = 1.15; this.torso.castShadow = true; this.g.add(this.torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), mat(skin));
    head.position.y = 1.68; head.castShadow = true; this.g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 12, 0, Math.PI*2, 0, 1.4), mat(0x3a2a1e));
    hair.position.y = 1.70; this.g.add(hair);
    this.armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 6), mat(shirt));
    this.armL.position.set(-0.28, 1.15, 0); this.g.add(this.armL);
    this.armR = this.armL.clone(); this.armR.position.x = 0.28; this.g.add(this.armR);
    const tag = nameTag(name); tag.position.y = 2.05; this.g.add(tag);
    this.pos = new THREE.Vector3();
    this.target = null;
    this.waitT = 0;
    this.area = null;
    this.speed = 0.6;
  }
  place(x, z, area, speed = 0.6) {
    this.pos.set(x, 0, z); this.area = area; this.speed = speed;
    this.g.position.copy(this.pos);
    this.pickTarget();
  }
  pickTarget(world) {
    if (!this.area) return;
    for (let i = 0; i < 12; i++) {
      const x = this.area.x1 + Math.random() * (this.area.x2 - this.area.x1);
      const z = this.area.z1 + Math.random() * (this.area.z2 - this.area.z1);
      if (!world || !world.isBlocked(x, z, 0.4)) { this.target = { x, z }; return; }
    }
    this.target = null;
  }
  update(dt, world, playerPos) {
    // mantener distancia del jugador
    const dp = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    let moving = false;
    if (dp < 0.9) {
      const a = Math.atan2(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      const nx = this.pos.x + Math.sin(a) * dt * 0.8;
      const nz = this.pos.z + Math.cos(a) * dt * 0.8;
      if (!world.isBlocked(nx, nz, 0.35)) { this.pos.x = nx; this.pos.z = nz; moving = true; }
    } else if (this.waitT > 0) {
      this.waitT -= dt;
    } else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) { this.waitT = 2 + Math.random() * 4; this.pickTarget(world); }
      else {
        const nx = this.pos.x + dx / d * this.speed * dt;
        const nz = this.pos.z + dz / d * this.speed * dt;
        if (!world.isBlocked(nx, nz, 0.35)) { this.pos.x = nx; this.pos.z = nz; moving = true; this.g.rotation.y = Math.atan2(dx, dz); }
        else this.pickTarget(world);
      }
    }
    if (moving) {
      this.walkPhase += dt * 7;
      const s = Math.sin(this.walkPhase) * 0.5;
      this.armL.rotation.x = s; this.armR.rotation.x = -s;
      this.g.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04;
    } else {
      this.armL.rotation.x *= 0.9; this.armR.rotation.x *= 0.9;
      this.g.position.y *= 0.9;
      // mirar al jugador si está cerca
      if (dp < 4) {
        const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        let d = want - this.g.rotation.y;
        while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2;
        this.g.rotation.y += d * Math.min(1, dt * 3);
      }
    }
    this.g.position.x = this.pos.x; this.g.position.z = this.pos.z;
  }
}

class Dog {
  constructor() {
    this.g = new THREE.Group();
    this.phase = 0;
    const m = mat(0xb07a45);
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.35, 4, 8), m);
    this.body.rotation.z = Math.PI/2; this.body.position.y = 0.32; this.body.castShadow = true; this.g.add(this.body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), m);
    head.position.set(0.32, 0.48, 0); head.castShadow = true; this.g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), mat(0x8a5a30));
    snout.position.set(0.45, 0.43, 0); this.g.add(snout);
    for (const s of [-1,1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), mat(0x8a5a30));
      ear.position.set(0.28, 0.62, s*0.09); this.g.add(ear);
    }
    this.legs = [];
    for (const [lx, lz] of [[0.18,0.1],[0.18,-0.1],[-0.18,0.1],[-0.18,-0.1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.28), m);
      leg.position.set(lx, 0.14, lz); this.g.add(leg); this.legs.push(leg);
    }
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.3), m);
    this.tail.position.set(-0.32, 0.45, 0); this.tail.rotation.z = 0.8; this.g.add(this.tail);
    const tag = nameTag('🐶 Max'); tag.position.y = 0.85; this.g.add(tag);
    this.pos = new THREE.Vector3(2.2, 0, 3.0);
    this.target = null; this.waitT = 0;
    this.speed = 1.1;
  }
  update(dt, world, playerPos) {
    // A veces se cruza delante del jugador (peligro), a veces deambula
    const dp = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    let goal = this.target;
    if (dp < 6 && Math.random() < dt * 0.25) {
      // cruzar cerca del jugador
      goal = { x: playerPos.x + (Math.random()-0.5)*4, z: playerPos.z + (Math.random()-0.5)*4 };
      this.target = goal;
    }
    let moving = false;
    if (this.waitT > 0) this.waitT -= dt;
    else {
      if (!goal) {
        const spots = [{x:-4,z:3},{x:-1,z:4},{x:0,z:2.5},{x:2.5,z:2},{x:4.5,z:1},{x:2.2,z:3.6},{x:-5.5,z:1.5}];
        goal = spots[Math.floor(Math.random()*spots.length)];
        this.target = goal;
      }
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) { this.waitT = 1 + Math.random()*3; this.target = null; }
      else {
        const sp = this.speed * (dp < 3 ? 1.6 : 1);
        const nx = this.pos.x + dx/d*sp*dt, nz = this.pos.z + dz/d*sp*dt;
        if (!world.isBlocked(nx, nz, 0.3) && nx > -6.6 && nx < 6.6 && nz > -0.5 && nz < 4.6) {
          this.pos.x = nx; this.pos.z = nz; moving = true;
          this.g.rotation.y = Math.atan2(dx, dz) - Math.PI/2;
        } else this.target = null;
      }
    }
    this.phase += dt * (moving ? 12 : 3);
    this.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(this.phase + i*Math.PI/2)*0.6 : 0; });
    this.tail.rotation.x = Math.sin(this.phase*1.5)*0.5;
    this.g.position.copy(this.pos);
    return { x: this.pos.x, z: this.pos.z, moving, speed: moving ? this.speed : 0 };
  }
}

class Cat {
  constructor() {
    this.g = new THREE.Group();
    const m = mat(0x3a3f4a);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 8), m);
    body.position.y = 0.25; body.castShadow = true; this.g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), m);
    head.position.y = 0.5; this.g.add(head);
    for (const s of [-1,1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 5), m);
      ear.position.set(0, 0.6, s*0.06); this.g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshBasicMaterial({ color: 0xaef25a }));
      eye.position.set(0.09, 0.52, s*0.045); this.g.add(eye);
    }
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.35), m);
    this.tail.position.set(-0.12, 0.3, 0); this.tail.rotation.z = 0.5; this.g.add(this.tail);
    const tag = nameTag('🐈 Mishi'); tag.position.y = 0.8; this.g.add(tag);
    this.pos = new THREE.Vector3(5.5, 0, 4.6);
    this.base = this.pos.clone();
    this.t = 0;
    this.spot = 0;
    this.spots = [new THREE.Vector3(5.5,0,4.6), new THREE.Vector3(4.6,0,2.0), new THREE.Vector3(3.0,0,0.2), new THREE.Vector3(6.2,0,2.8)];
  }
  update(dt, world, playerPos) {
    this.t += dt;
    // se traslada de vez en cuando a otro rincón de la habitación
    if (this.t > 14) {
      this.t = 0;
      this.spot = (this.spot + 1) % this.spots.length;
      const s = this.spots[this.spot];
      if (!world.isBlocked(s.x, s.z, 0.3)) this.base.copy(s);
    }
    const dx = this.base.x - this.pos.x, dz = this.base.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const nx = this.pos.x + dx/d*0.5*dt, nz = this.pos.z + dz/d*0.5*dt;
      if (!world.isBlocked(nx, nz, 0.25)) { this.pos.x = nx; this.pos.z = nz; }
      this.g.rotation.y = Math.atan2(dx, dz) - Math.PI/2;
    } else {
      const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z) - Math.PI/2;
      this.g.rotation.y += (want - this.g.rotation.y) * Math.min(1, dt*2);
    }
    this.tail.rotation.x = Math.sin(this.t*2.5)*0.4;
    this.g.position.copy(this.pos);
  }
}

export class Actors {
  constructor(scene, world) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.caregiver = new Person('👩‍⚕️ Ana · cuidadora', 0x3fa7a0, 0x2c3e50);
    this.caregiver.place(-1.0, 4.0, { x1: -6, x2: 0, z1: 2.8, z2: 4.5 }, 0.55);
    this.relative = new Person('👨 Carlos · familiar', 0xa04a4a, 0x33415c);
    this.relative.place(-1.5, -1.5, { x1: -6.2, x2: 0, z1: -4, z2: -0.7 }, 0.5);
    this.dog = new Dog();
    this.cat = new Cat();
    this.group.add(this.caregiver.g, this.relative.g, this.dog.g, this.cat.g);
    this.world = world;
    this.dogState = { x: 2.2, z: 3.0, moving: false, speed: 0 };
  }
  update(dt, playerPos) {
    this.caregiver.update(dt, this.world, playerPos);
    this.relative.update(dt, this.world, playerPos);
    this.dogState = this.dog.update(dt, this.world, playerPos);
    this.cat.update(dt, this.world, playerPos);
  }
  // círculos para colisión suave con el jugador
  bodies() {
    return [
      { x: this.caregiver.pos.x, z: this.caregiver.pos.z, r: 0.35 },
      { x: this.relative.pos.x, z: this.relative.pos.z, r: 0.35 },
    ];
  }
}
