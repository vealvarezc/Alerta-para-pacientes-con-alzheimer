// Entrada unificada: teclado + ratón (pointer lock / arrastre) + táctil
// (palanca virtual izquierda y zona de mirada derecha).
import { CONFIG } from './config.js';

export class InputManager {
  constructor(container) {
    this.container = container;
    this.keys = {};
    this.joy = { x: 0, y: 0, active: false };
    this.lookDX = 0; this.lookDY = 0;
    this.pointerLocked = false;
    this.enabled = false;
    this.onFirstTouch = null;
    this._dragging = false;
    this._lastTX = 0; this._lastTY = 0;
    this._joyId = null;
    this._lookId = null;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.container;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.lookDX += e.movementX; this.lookDY += e.movementY;
      } else if (this._dragging) {
        this.lookDX += e.clientX - this._lastTX;
        this.lookDY += e.clientY - this._lastTY;
        this._lastTX = e.clientX; this._lastTY = e.clientY;
      }
    });
    // Arrastrar con ratón para mirar (sin pointer lock)
    this.container.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._dragging = true; this._lastTX = e.clientX; this._lastTY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    // Click en escritorio = capturar ratón
    this.container.addEventListener('click', () => {
      if (this.enabled && !this.isTouch() && !this.pointerLocked && this.container.requestPointerLock) {
        try { this.container.requestPointerLock(); } catch { /* noop */ }
      }
    });

    // ---- táctil ----
    const joyEl = document.getElementById('joystick');
    const stickEl = document.getElementById('stick');
    const setStick = (dx, dy) => {
      stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    window.addEventListener('touchstart', (e) => {
      document.body.classList.add('touch');
      if (this.onFirstTouch) { this.onFirstTouch(); this.onFirstTouch = null; }
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const r = joyEl.getBoundingClientRect();
        const inJoy = t.clientX >= r.left - 30 && t.clientX <= r.right + 30 &&
                      t.clientY >= r.top - 30 && t.clientY <= r.bottom + 30;
        if (inJoy && this._joyId === null) {
          this._joyId = t.identifier;
          this._joyCX = r.left + r.width / 2; this._joyCY = r.top + r.height / 2;
          this._joyR = r.width / 2;
        } else if (this._lookId === null && t.clientX > window.innerWidth * 0.35) {
          this._lookId = t.identifier; this._lastTX = t.clientX; this._lastTY = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          let dx = t.clientX - this._joyCX, dy = t.clientY - this._joyCY;
          const m = Math.hypot(dx, dy), max = this._joyR || 60;
          if (m > max) { dx = dx / m * max; dy = dy / m * max; }
          setStick(dx, dy);
          this.joy.x = dx / max; this.joy.y = dy / max; this.joy.active = true;
          e.preventDefault();
        } else if (t.identifier === this._lookId) {
          this.lookDX += (t.clientX - this._lastTX) * 2.2;
          this.lookDY += (t.clientY - this._lastTY) * 2.2;
          this._lastTX = t.clientX; this._lastTY = t.clientY;
          e.preventDefault();
        }
      }
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null; this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
          setStick(0, 0);
        }
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
    if ('ontouchstart' in window && navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }
  }

  isTouch() { return document.body.classList.contains('touch'); }

  // Vector de movimiento en espacio del jugador: x = derecha, y(+)=adelante
  moveVector() {
    let x = 0, y = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, mag: Math.min(1, m) };
  }

  isSprint() {
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) return true;
    // palanca al máximo = correr
    return this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92;
  }

  keyTurn(dt) {
    let t = 0;
    if (this.keys['KeyQ']) t += 1;
    if (this.keys['KeyE']) t -= 1;
    return t * CONFIG.turnSpeedKeys * dt;
  }

  consumeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return { dx: dx * 0.0026, dy: dy * 0.0026 };
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v && document.pointerLockElement) document.exitPointerLock();
  }
}
