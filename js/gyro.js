// Mirada por giroscopio para movil (modo normal y AR con camara).
// Calibra la postura inicial y convierte el giro del telefono en yaw/pitch.
export class GyroLook {
  constructor() {
    this.active = false;
    this.available = (typeof window !== 'undefined') && ('DeviceOrientationEvent' in window);
    this.onChange = null;  // (active) => {}
    this.onError = null;   // (msg) => {}
    this._handler = null;
    this._cal = null;
    this._last = null;
    this._baseYaw = null;
  }

  get hasData() { return !!(this._cal && this._last); }

  _fail(msg) {
    this.active = false;
    if (this.onChange) this.onChange(false);
    if (this.onError) this.onError(msg);
    return false;
  }

  // Llamar desde un gesto (clic) para el permiso en iOS
  async start() {
    if (this.active) return true;
    if (!this.available) return this._fail('Este dispositivo no tiene giroscopio.');
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return this._fail('Permiso de movimiento denegado: arrastra para mirar.');
      }
    } catch { return this._fail('No se pudo activar el giroscopio.'); }
    this._cal = null; this._last = null; this._baseYaw = null;
    this._handler = (e) => {
      if (e.alpha === null && e.beta === null) return;
      if (!this._cal) this._cal = { a: e.alpha || 0, b: e.beta || 0 };
      this._last = { a: e.alpha || 0, b: e.beta || 0 };
    };
    window.addEventListener('deviceorientation', this._handler);
    this.active = true;
    if (this.onChange) this.onChange(true);
    return true;
  }

  stop() {
    if (this._handler) {
      window.removeEventListener('deviceorientation', this._handler);
      this._handler = null;
    }
    const was = this.active;
    this.active = false;
    this._cal = null; this._last = null; this._baseYaw = null;
    if (was && this.onChange) this.onChange(false);
  }

  async toggle() {
    if (this.active) { this.stop(); return false; }
    return this.start();
  }

  recenter(player) {
    if (this._last) this._cal = { ...this._last };
    if (player) this._baseYaw = player.yaw;
  }

  update(player) {
    if (!this.active || !this._last || !this._cal) return;
    if (this._baseYaw === null) this._baseYaw = player.yaw;
    let dyaw = (this._last.a - this._cal.a) * Math.PI / 180;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    player.yaw = this._baseYaw - dyaw;
    const dpitch = -(this._last.b - this._cal.b) * Math.PI / 180;
    player.pitch = Math.max(-1.2, Math.min(1.2, dpitch));
    player.syncRig();
  }
}
