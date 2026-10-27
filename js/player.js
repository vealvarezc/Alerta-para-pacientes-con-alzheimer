// Jugador: movimiento primera persona, colisiones, head-bob y modo XR.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Player {
  constructor(scene, camera) {
    this.rig = new THREE.Group();      // pies del jugador en el mundo
    scene.add(this.rig);
    this.camera = camera;
    // En XR la cámara la controla el visor; fuera de XR la manejamos aquí.
    this.rig.add(camera);
    camera.position.set(0, CONFIG.eyeHeight, 0);
    this.pos = new THREE.Vector3();    // duplica rig.position (pies)
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.bobPhase = 0;
    this.speed = 0;
    this.collided = false;
    this.collidedSpeed = 0;
    this.stunned = 0;                  // sin control tras caída
    this.inXR = false;
    this._lastHeadLocal = new THREE.Vector3();
    this._headInit = false;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.syncRig();
  }

  syncRig() {
    this.rig.position.copy(this.pos);
    if (!this.inXR) {
      this.rig.rotation.set(0, this.yaw, 0);
      this.camera.position.set(0, CONFIG.eyeHeight, 0);
      this.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
    } else {
      this.rig.rotation.set(0, 0, 0);
    }
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt, input, world, actors, xrMove = null) {
    this.stunned = Math.max(0, this.stunned - dt);
    const canMove = this.stunned <= 0;

    // --- mirada ---
    if (!this.inXR) {
      const look = input.consumeLook();
      this.yaw -= look.dx;
      this.pitch -= look.dy;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
      this.yaw += input.keyTurn(dt);
    }

    // --- dirección deseada ---
    let mx = 0, mz = 0, sprint = false;
    if (canMove) {
      const mv = input.moveVector();
      sprint = input.isSprint();
      if (this.inXR) {
        // En XR el "adelante" lo da la orientación de la cabeza
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir); dir.y = 0;
        if (dir.lengthSq() < 0.001) dir.set(0, 0, -1); dir.normalize();
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        let ax = mv.x, ay = mv.y;
        if (xrMove) { ax += xrMove.x; ay += xrMove.y; }
        const m = Math.hypot(ax, ay);
        if (m > 1) { ax /= m; ay /= m; }
        mx = dir.x * ay + right.x * ax;
        mz = dir.z * ay + right.z * ax;
        this.yaw = Math.atan2(-dir.x, -dir.z);
      } else {
        const f = this.forward();
        const r = new THREE.Vector3(-f.z, 0, f.x);
        mx = f.x * mv.y + r.x * mv.x;
        mz = f.z * mv.y + r.z * mv.x;
      }
    }
    const maxSpeed = sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;

    // --- integracion con aceleracion humana realista (m/s2) ---
    // Arrancar/parar con calma NO dispara el cinturon; los picos vienen
    // de giros bruscos a velocidad, choques y tropiezos.
    const target = new THREE.Vector3(mx * maxSpeed, 0, mz * maxSpeed);
    const accel = (mx !== 0 || mz !== 0) ? 2.8 : 4.0;
    const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z;
    const dv = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dv <= maxDv) { this.vel.x = target.x; this.vel.z = target.z; }
    else { this.vel.x += dvx / dv * maxDv; this.vel.z += dvz / dv * maxDv; }

    const preSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // --- caminar fisico en XR: sumar desplazamiento del visor 1:1 ---
    // OJO: se usa la pose LOCAL del visor (relativa al rig). Usar la posicion
    // mundial crea retroalimentacion positiva (el rig se persigue a si mismo),
    // el mundo "nada" y marea. Zona muerta anti-ruido + tope anti-saltos.
    if (this.inXR) {
      const hx = this.camera.position.x, hz = this.camera.position.z;
      if (!this._headInit) { this._lastHeadLocal.set(hx, 0, hz); this._headInit = true; }
      const dx = hx - this._lastHeadLocal.x;
      const dz = hz - this._lastHeadLocal.z;
      const stepLen = Math.hypot(dx, dz);
      if (stepLen > 0.0015 && stepLen < 0.3) { this.pos.x += dx; this.pos.z += dz; }
      this._lastHeadLocal.set(hx, 0, hz);
    }

    // --- colisiones con el mundo ---
    this.collided = world.resolveCircle(this.pos, CONFIG.playerRadius);
    this.collidedSpeed = this.collided ? preSpeed : 0;
    if (this.collided && preSpeed > 1.2) {
      // golpe: corte brusco de velocidad (el cinturón lo siente)
      this.vel.multiplyScalar(0.25);
    } else if (this.collided) {
      // roce suave al deslizarse por la pared
      this.vel.multiplyScalar(0.7);
    }

    // --- colisión suave con personas ---
    if (actors) {
      for (const b of actors.bodies()) {
        const dx = this.pos.x - b.x, dz = this.pos.z - b.z;
        const d = Math.hypot(dx, dz), min = b.r + CONFIG.playerRadius;
        if (d < min && d > 0.001) {
          this.pos.x = b.x + dx / d * min;
          this.pos.z = b.z + dz / d * min;
        }
      }
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.inXR) {
      // en XR la velocidad real incluye el caminar físico: estimarla por desplazamiento
      this._xrPrev = this._xrPrev || this.pos.clone();
      const est = Math.hypot(this.pos.x - this._xrPrev.x, this.pos.z - this._xrPrev.z) / Math.max(dt, 0.001);
      this.speed = this.speed * 0.4 + Math.min(est, 6) * 0.6;
      this._xrPrev.copy(this.pos);
    }

    // --- head bob ---
    if (!this.inXR && this.speed > 0.3) {
      this.bobPhase += dt * (4 + this.speed * 1.8);
    }
    this.syncRig();
    if (!this.inXR) {
      this.camera.position.y = CONFIG.eyeHeight + Math.sin(this.bobPhase) * 0.035 * Math.min(1, this.speed / 2);
      this.camera.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.004;
    }
  }

  heading() { return this.yaw; }

  setXR(on) {
    this.inXR = on;
    this._headInit = false;
    this.rig.rotation.set(0, 0, 0);
  }
}
