// Director de juego: estados, ruta con waypoints, peligros, puntuación.
import { CONFIG, ROUTE } from './config.js';

// Puntos intermedios (puertas) por tramo para guiar la flecha
const VIA = {
  1: [{ x: -2.5, z: 0 }],
  2: [{ x: 1, z: -2.5 }],
  3: [{ x: 4, z: -3 }],
  4: [{ x: 4.2, z: -1 }],
  5: [{ x: 1, z: 0.7 }],
  6: [],
};

export class Game {
  constructor(deps) {
    this.ui = deps.ui; this.belt = deps.belt; this.player = deps.player;
    this.world = deps.world; this.actors = deps.actors; this.input = deps.input;
    this.sound = deps.sound;
    this.state = 'menu';
    this.mode = 'ruta';
    this.time = 0;
    this.score = 100;
    this.nextCp = 0;
    this.viaIdx = 0;
    this.counts = { brusco: 0, erratica: 0, tropiezo: 0, caida: 0 };
    this.fallLeft = 0;
    this.sosSent = false;
    this.belt.onAlert = (tipo, info) => this.handleAlert(tipo, info);
  }

  start(mode) {
    this.mode = mode;
    this.state = 'playing';
    this.time = 0;
    this.score = 100;
    this.nextCp = 0;
    this.viaIdx = 0;
    this.counts = { brusco: 0, erratica: 0, tropiezo: 0, caida: 0 };
    this.sosSent = false;
    this.belt.reset();
    this.player.spawn(CONFIG.START_POS?.x ?? -2.2, CONFIG.START_POS?.z ?? 2.8, CONFIG.START_POS?.yaw ?? 0.2);
    this.player.stunned = 0;
    this.world.setRoute(ROUTE);
    this.world.cpGroup.visible = (mode === 'ruta');
    this.ui.setFreeMode(mode === 'libre');
    this.ui.showMenu(false);
    this.ui.showEnd(false);
    this.ui.hideFallModal();
    this.ui.showHUD(true);
    this.ui.renderTracker(ROUTE, 0);
    this.ui.setScore(100);
    this.ui.setTimer(0);
    this.ui.el.feed.innerHTML = '';
    if (mode === 'ruta') {
      this.ui.setObjective(`Ve al punto 1 · ${ROUTE[0].name} — ${ROUTE[0].hint}`);
      this.ui.toast('Sigue la flecha ➤ y el minimapa. ¡Camina con calma!');
    } else {
      this.ui.setObjective('Explora la casa a tu ritmo');
      this.ui.toast('Paseo libre: explora y cuida tu estabilidad');
    }
    this.input.setEnabled(true);
    this.sound.click();
  }

  toMenu() {
    this.state = 'menu';
    this.input.setEnabled(false);
    this.ui.showHUD(false);
    this.ui.showEnd(false);
    this.ui.hideFallModal();
    this.ui.showMenu(true);
    this.sound.stopAlarm();
  }

  finishRun() {
    this.state = 'end';
    this.input.setEnabled(false);
    this.sound.success();
    const st = this.belt.getState();
    const timeBonus = Math.max(0, Math.round(240 - this.time));
    this.score += timeBonus * 0.2 + this.nextCp * 10;
    const mm = String(Math.floor(this.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(this.time % 60)).padStart(2, '0');
    this.ui.fillResults(
      this.mode === 'ruta' ? '🏁 ¡Ruta completada!' : '🚶 ¡Paseo terminado!',
      this.counts.caida === 0 ? 'El cinturón Guardián te mantuvo a salvo. ¡Buen andar!' : 'Hubo caídas: practica un andar más pausado y estable.',
      [
        ['Puntuación', Math.round(this.score)],
        ['Tiempo', `${mm}:${ss}`],
        ['Distancia', `${st.distance} m`],
        ['Pasos', st.steps],
        ['Puntos visitados', `${this.nextCp} / ${ROUTE.length}`],
        ['Mov. bruscos', this.counts.brusco],
        ['Marcha errática', this.counts.erratica],
        ['Tropiezos', this.counts.tropiezo],
        ['Caídas', this.counts.caida],
        ['Estabilidad final', `${st.stability}%`],
      ]
    );
    this.ui.showHUD(false);
    this.ui.showEnd(true);
  }

  handleAlert(tipo, info) {
    if (this.state !== 'playing' && tipo !== 'caida') return;
    if (tipo === 'brusco') {
      this.counts.brusco++;
      this.score -= 4;
      this.ui.pushAlert('warn', `⚠️ ${info.title}`, `${info.msg} <small>(a=${info.accel} m/s²)</small>`);
      this.ui.banner('⚠️ ¡Más suave!', 'warn', 1200);
    } else if (tipo === 'erratica') {
      this.counts.erratica++;
      this.score -= 6;
      this.ui.pushAlert('warn', `🌀 ${info.title}`, info.msg);
      this.ui.banner('🌀 Marcha errática: reduce el ritmo', 'warn', 2000);
    } else if (tipo === 'tropiezo') {
      this.counts.tropiezo++;
      this.score -= 8;
      this.ui.pushAlert('danger', `🧸 ${info.title}`, info.msg);
      this.ui.banner(`🧸 ¡Tropiezo! ${info.msg}`, '', 2200);
      this.ui.hurtFlash();
      this.player.vel.multiplyScalar(0.25);
      this.player.stunned = Math.max(this.player.stunned, 0.35);
    } else if (tipo === 'caida') {
      if (this.state !== 'playing') return;
      this.counts.caida++;
      this.score -= 20;
      this.state = 'fall';
      this.fallLeft = CONFIG.sosCountdown;
      this.player.stunned = 9999;
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.pushAlert('danger', `🚨 ${info.title}`, info.msg);
      this.ui.hurtFlash();
      this.ui.banner('🚨 ¡CAÍDA DETECTADA!', '', 2500);
      this.ui.showFallModal();
      this.ui.setFallCount(this.fallLeft);
    }
  }

  resolveFall(ok, auto = false) {
    this.belt.resolveFall(ok);
    this.player.stunned = 1.5;
    this.ui.hideFallModal();
    if (!ok) {
      this.sosSent = true;
      this.ui.pushAlert('info', '📞 Cuidador avisado', auto
        ? 'No hubo respuesta: se notificó a Ana (simulado).'
        : 'Solicitaste ayuda: Ana viene en camino (simulado).');
      this.ui.toast('📞 Cuidador notificado (simulación)');
    } else {
      this.ui.pushAlert('info', '💚 Recuperación', 'Confirmaste que estás bien. Estabilidad restaurada al 60%.');
    }
    this.state = 'playing';
  }

  currentTarget() {
    if (this.mode !== 'ruta' || this.nextCp >= ROUTE.length) return null;
    const vias = VIA[ROUTE[this.nextCp].id] || [];
    if (this.viaIdx < vias.length) return vias[this.viaIdx];
    return ROUTE[this.nextCp];
  }

  update(dt) {
    if (this.state !== 'playing' && this.state !== 'fall') return;
    if (this.state === 'fall') {
      this.fallLeft -= dt;
      this.ui.setFallCount(Math.max(0, this.fallLeft));
      if (this.fallLeft <= 0) this.resolveFall(false, true);
      return;
    }
    this.time += dt;

    // --- cinturón ---
    this.belt.update({
      dt,
      vx: this.player.vel.x,
      vz: this.player.vel.z,
      speed: this.player.speed,
      heading: this.player.heading(),
      moving: this.player.speed > 0.25,
      collided: this.player.collided,
      collidedSpeed: this.player.collidedSpeed,
    });

    // --- colisiones fuertes ---
    if (this.player.collided && this.player.collidedSpeed > 1.5) {
      this.belt.registerCollision(this.player.collidedSpeed);
      if (this.player.collidedSpeed > 1.9) this.ui.hurtFlash();
    }

    // --- obstáculos estáticos (solo si vas deprisa o inestable) ---
    const sp = this.player.speed;
    if (sp > 1.85 && !this.belt.fallActive) {
      for (const o of this.world.obstacles) {
        const d = Math.hypot(this.player.pos.x - o.x, this.player.pos.z - o.z);
        if (d < o.r + 0.25) {
          this.belt.registerHazard(o.kind, sp);
          break;
        }
      }
    }
    // --- la mascota se cruza ---
    const dog = this.actors.dogState;
    if (dog.moving && sp > 1.85 && !this.belt.fallActive) {
      const d = Math.hypot(this.player.pos.x - dog.x, this.player.pos.z - dog.z);
      if (d < 0.8) this.belt.registerHazard('mascota', sp);
    }

    // --- ruta ---
    if (this.mode === 'ruta' && this.nextCp < ROUTE.length) {
      const t = this.currentTarget();
      const d = Math.hypot(this.player.pos.x - t.x, this.player.pos.z - t.z);
      const isCp = t.id !== undefined;
      const radius = isCp ? CONFIG.checkpointRadius : 1.0;
      if (d < radius) {
        if (isCp) {
          const cp = ROUTE[this.nextCp];
          this.nextCp++;
          this.viaIdx = 0;
          this.sound.checkpoint();
          this.score += 10;
          this.world.setNextCheckpoint(this.nextCp);
          this.ui.renderTracker(ROUTE, this.nextCp);
          if (this.nextCp >= ROUTE.length) {
            this.ui.banner('🏁 ¡Ruta completada!', 'good', 2500);
            setTimeout(() => { if (this.state === 'playing') this.finishRun(); }, 1200);
          } else {
            const nx = ROUTE[this.nextCp];
            this.ui.setObjective(`Ve al punto ${nx.id} · ${nx.name} — ${nx.hint}`);
            this.ui.banner(`✓ Punto ${cp.id} · ${cp.name}`, 'good', 1800);
            this.ui.pushAlert('info', `✓ Punto ${cp.id} alcanzado`, `Ahora: ${nx.name}. ${nx.hint}`);
          }
        } else {
          this.viaIdx++;
        }
      }
      // flecha guía
      const tgt = this.currentTarget();
      if (tgt) {
        const dx = tgt.x - this.player.pos.x, dz = tgt.z - this.player.pos.z;
        const bearing = Math.atan2(dx, dz);
        const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
        const camB = Math.atan2(fx, fz);
        let rel = (bearing - camB) * 180 / Math.PI;
        while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
        this.ui.setRouteArrow(rel, Math.hypot(dx, dz));
      }
    }

    // --- HUD ---
    this.ui.setTimer(this.time);
    this.ui.setScore(this.score);
    this.ui.updateBelt(this.belt.getState());
    this.ui.drawMinimap(this.world, this.player, this.actors, ROUTE, this.nextCp);
  }
}
