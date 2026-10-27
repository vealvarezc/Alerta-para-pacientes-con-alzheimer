// Cinturón Guardián: monitor de movimiento, detección de brusquedad,
// marcha errática, tropiezos y caídas. Fusiona movimiento del juego
// con sensores reales (acelerómetro del móvil / visor XR) si existen.
import { CONFIG, TEXTS } from './config.js';

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BeltMonitor {
  constructor(sound) {
    this.sound = sound;
    this.sensName = 'media';
    this.onAlert = null; // (tipo, info) => {}
    this.reset();
    // Sensor real (móvil)
    this.realAccel = 0;         // magnitud filtrada m/s^2 (sin gravedad idealmente)
    this.realActive = false;
    this._motionHandler = null;
  }

  setSensitivity(name) {
    if (CONFIG.sensitivity[name]) this.sensName = name;
  }
  get sens() { return CONFIG.sensitivity[this.sensName]; }

  reset() {
    this.stability = 100;
    this.steps = 0;
    this.distance = 0;
    this.speed = 0;
    this.speedSmooth = 0;
    this.accelSmooth = 0;
    this.jerkSmooth = 0;
    this.lastVel = { x: 0, z: 0 };
    this.lastAccel = 0;
    this.lastHeading = 0;
    this.gait = 'Estable';
    this.moving = false;
    // ventana deslizante para marcha errática
    this.turnAccum = 0;
    this.windowTime = 0;
    this.reversals = 0;
    this.lastLatSign = 0;
    this.latCooldown = 0;
    this.erraticLevel = 0; // 0..100
    // cooldowns
    this.cool = { brusco: 0, erratica: 0, tropiezo: 0 };
    // detección de caída: impacto -> inmovilidad
    this.impactAt = -10;
    this.impactMag = 0;
    this.stillTime = 0;
    this.fallActive = false;
    this.wasUnstableNotified = false;
    this.stepAccum = 0;
    this.gaitLabel = 'Estable';
  }

  // ---- sensores reales del móvil ----
  async attachDeviceMotion() {
    if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') return 'denied';
      }
      if (this._motionHandler) return 'ok';
      this._motionHandler = (e) => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        if (!a) return;
        const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
        // quitar gravedad aproximada (9.8) para quedarnos con la dinámica
        const dyn = Math.abs(mag - 9.8);
        this.realAccel += (dyn - this.realAccel) * 0.25;
        this.realActive = true;
      };
      window.addEventListener('devicemotion', this._motionHandler);
      return 'ok';
    } catch { return 'error'; }
  }

  emit(tipo, extra = {}) {
    const t = TEXTS[tipo] || { title: tipo, msg: '' };
    if (this.onAlert) this.onAlert(tipo, { ...t, ...extra });
  }

  vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* noop */ }
  }

  // sample: {dt, vx, vz, speed, heading, moving, collided, collidedSpeed}
  update(sample) {
    const dt = Math.min(Math.max(sample.dt, 0.001), 0.1);
    const s = this.sens;

    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);

    const vx = sample.vx || 0, vz = sample.vz || 0;
    const speed = sample.speed ?? Math.hypot(vx, vz);
    this.speed = speed;
    this.moving = speed > 0.25;
    this.speedSmooth += (speed - this.speedSmooth) * Math.min(1, dt * 6);

    // distancia y pasos estimados
    const d = speed * dt;
    this.distance += d;
    this.stepAccum += d;
    if (this.stepAccum >= CONFIG.strideLength && speed > 0.3) {
      this.stepAccum = 0;
      this.steps++;
      this.sound.step(speed > 3);
    }

    // aceleración y jerk (del movimiento del juego + sensor real)
    const ax = (vx - this.lastVel.x) / dt;
    const az = (vz - this.lastVel.z) / dt;
    this.lastVel = { x: vx, z: vz };
    let aMag = Math.hypot(ax, az);
    if (this.realActive) aMag = Math.max(aMag, this.realAccel * 1.2);
    // Aceleracion centripeta al girar: a = turnRate * speed
    const headingNow = sample.heading ?? 0;
    const spinRate = Math.abs(angDiff(headingNow, this.lastHeading)) / dt;
    if (speed > 0.8) aMag = Math.max(aMag, spinRate * speed);
    const aRaw = aMag;
    // colisión fuerte = pico de aceleración (golpe)
    if (sample.collided) aMag = Math.max(aMag, 4 + sample.collidedSpeed * 2.2);

    const jerk = Math.abs(aMag - this.lastAccel) / dt;
    this.lastAccel = aMag;
    this.accelSmooth += (aMag - this.accelSmooth) * Math.min(1, dt * 7);
    this.jerkSmooth += (Math.min(jerk, 120) - this.jerkSmooth) * Math.min(1, dt * 6);

    // ---- 1) movimiento brusco ----
    if ((this.accelSmooth > s.accel || this.jerkSmooth > s.jerk) && this.cool.brusco <= 0 && !this.fallActive) {
      this.cool.brusco = 2.5;
      const sev = Math.min(30, (this.accelSmooth - s.accel) * 3 + (this.jerkSmooth - s.jerk) * 0.25);
      this.damageStability(8 + sev * 0.5, 'brusco');
      this.sound.warn();
      this.vibrate(80);
      this.emit('brusco', { sev, accel: this.accelSmooth.toFixed(1), jerk: this.jerkSmooth.toFixed(0) });
    }

    // ---- 2) marcha errática (ventana de 6 s) ----
    const heading = sample.heading ?? 0;
    if (this.moving && !this.fallActive) {
      const dh = Math.abs(angDiff(heading, this.lastHeading));
      // giro total acumulado en radianes (no contar micro-ruido)
      if (dh > 0.004) this.turnAccum += dh;
      // velocidad lateral (zigzag): componente perpendicular al rumbo
      const latV = vx * Math.cos(heading) - vz * Math.sin(heading);
      const sign = latV > 0.5 ? 1 : latV < -0.5 ? -1 : 0;
      this.latCooldown -= dt;
      if (sign !== 0 && this.lastLatSign !== 0 && sign !== this.lastLatSign && this.latCooldown <= 0) {
        this.reversals++;
        this.latCooldown = 0.35;
      }
      if (sign !== 0) this.lastLatSign = sign;
      this.windowTime += dt;
      if (this.windowTime >= 6) {
        const turnRate = (this.turnAccum / this.windowTime) * (180 / Math.PI); // °/s promedio
        const score = turnRate + this.reversals * 8;
        this.erraticLevel += ((score > s.erratic ? 100 : Math.max(0, (score / s.erratic) * 100 - 25)) - this.erraticLevel) * 0.5;
        if (score > s.erratic && this.cool.erratica <= 0) {
          this.cool.erratica = 8;
          this.damageStability(15, 'erratica');
          this.sound.warn();
          this.vibrate([100, 60, 100]);
          this.emit('erratica', { score: Math.round(score) });
        }
        this.turnAccum = 0; this.reversals = 0; this.windowTime = 0;
      }
    } else {
      this.windowTime = Math.max(0, this.windowTime - dt * 2);
      this.erraticLevel = Math.max(0, this.erraticLevel - dt * 20);
    }
    this.lastHeading = heading;

    // etiqueta de marcha
    this.gaitLabel = this.erraticLevel > 60 ? 'Errática' : this.erraticLevel > 30 ? 'Inestable' : 'Estable';

    // ---- 3) caída: impacto fuerte + inmovilidad posterior ----
    // Para evitar falsos positivos: el pico crudo debe ser alto y
    // (la estabilidad ya esta comprometida o el impacto es enorme).
    const rawBar = this.realActive ? 12 : 30; // sensores reales: picos mas bajos
    if (!this.fallActive && aRaw > rawBar && this.accelSmooth > s.fallImpact &&
        (this.stability < 55 || this.accelSmooth > s.fallImpact * 1.8)) {
      this.impactAt = performance.now() / 1000;
      this.impactMag = this.accelSmooth;
    }
    const sinceImpact = performance.now() / 1000 - this.impactAt;
    if (!this.fallActive && sinceImpact < 4) {
      if (!this.moving && this.accelSmooth < 1.2) this.stillTime += dt;
      else this.stillTime = Math.max(0, this.stillTime - dt * 2);
      if (this.stillTime >= CONFIG.fallStillTime) {
        this.triggerFall('Impacto seguido de inmovilidad');
      }
    } else if (!this.fallActive) {
      this.stillTime = 0;
    }

    // recuperación de estabilidad al caminar con calma
    if (!this.fallActive && this.moving && speed < 2.6 && this.jerkSmooth < s.jerk * 0.5) {
      this.stability = Math.min(100, this.stability + dt * s.recover);
    } else if (!this.fallActive && !this.moving) {
      this.stability = Math.min(100, this.stability + dt * s.recover * 0.7);
    }
  }

  damageStability(n, cause) {
    if (this.fallActive) return;
    this.stability = Math.max(0, this.stability - n);
    if (this.stability <= 0 && cause !== 'fall') {
      // estabilidad agotada: la persona se viene abajo
      this.triggerFall('Estabilidad agotada por movimientos inseguros');
    }
  }

  // Peligro del entorno (juguete, suelo mojado, mascota)
  registerHazard(kind, speed) {
    if (this.fallActive || this.cool.tropiezo > 0) return 'ignorado';
    this.cool.tropiezo = 2.0;
    const names = { juguete: 'juguetes en el suelo', mojado: 'suelo mojado', mascota: 'la mascota se cruzó' };
    if (speed > 3.1 || this.stability < 30) {
      this.stability = Math.max(0, this.stability - 20);
      this.sound.stumble();
      this.vibrate([120, 50, 120]);
      this.triggerFall(`Tropiezo grave con ${names[kind] || kind} a ${speed.toFixed(1)} m/s`);
      return 'caida';
    }
    this.damageStability(12 + speed * 2, 'tropiezo');
    this.sound.stumble();
    this.vibrate(120);
    this.emit('tropiezo', { msg: `Tropezaste con ${names[kind] || kind}. ¡Más despacio!` });
    return 'tropiezo';
  }

  // Colisión contra muebles/paredes
  registerCollision(speed) {
    if (this.fallActive) return;
    if (speed > 3.4) {
      this.cool.tropiezo = 2.0;
      this.damageStability(18, 'choque');
      this.sound.stumble();
      this.vibrate(150);
      this.emit('tropiezo', { msg: `¡Choque contra un mueble a ${speed.toFixed(1)} m/s!` });
      if (this.stability < 25) this.triggerFall('Choque con estabilidad crítica');
    } else if (speed > 1.5 && this.cool.brusco <= 0) {
      this.damageStability(4, 'roce');
      this.sound.click();
    }
  }

  simulateStumble() {
    if (this.fallActive) return;
    this.accelSmooth = Math.max(this.accelSmooth, this.sens.accel * 1.4);
    this.jerkSmooth = Math.max(this.jerkSmooth, this.sens.jerk * 1.3);
    this.cool.brusco = 0; // forzar evaluación inmediata
    this.damageStability(10, 'sim');
    this.sound.stumble();
    this.vibrate(100);
    this.emit('tropiezo', { msg: 'Tropiezo simulado (prueba del cinturón).' });
  }

  triggerFall(reason) {
    if (this.fallActive) return;
    this.fallActive = true;
    this.stability = Math.max(0, Math.min(this.stability, 20));
    this.sound.startAlarm();
    this.vibrate([200, 100, 200, 100, 400]);
    this.emit('caida', { msg: `${TEXTS.caida.msg} ${reason}` });
  }

  resolveFall(ok) {
    this.fallActive = false;
    this.sound.stopAlarm();
    this.impactAt = -10;
    this.stillTime = 0;
    this.stability = ok ? 60 : 45;
    this.erraticLevel = 0;
  }

  getState() {
    return {
      stability: Math.round(this.stability),
      steps: this.steps,
      distance: Math.round(this.distance),
      speed: this.speedSmooth,
      gait: this.gaitLabel,
      erratic: Math.round(this.erraticLevel),
      fall: this.fallActive,
      sensorReal: this.realActive,
    };
  }
}
