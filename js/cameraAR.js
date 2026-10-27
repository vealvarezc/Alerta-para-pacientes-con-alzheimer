// AR con camara (alternativa sin gafas ni WebXR): muestra el video real
// detras del juego, la casa se vuelve holograma y el giroscopio sirve
// para mirar alrededor. Funciona en movil y en PC con webcam.
export class CameraAR {
  constructor(scene, world, skyColor) {
    this.scene = scene;
    this.world = world;
    this.skyColor = skyColor;
    this.active = false;
    this.video = null;
    this.stream = null;
    this.gyro = null;      // calibracion {a, b}
    this._lastOri = null;
    this._baseYaw = null;
    this._oriHandler = null;
  }

  async _gyroPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        return await DeviceOrientationEvent.requestPermission() === 'granted';
      }
      return true; // Android/PC: sin permiso especial
    } catch { return false; }
  }

  async start() {
    if (this.active) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('este dispositivo no permite acceso a la cámara.');
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    this.video = document.getElementById('ar-video');
    if (!this.video) throw new Error('falta el elemento de video.');
    this.video.srcObject = stream;
    try { await this.video.play(); } catch { /* algunos navegadores piden gesto extra */ }
    this.video.classList.add('on');
    this.stream = stream;
    this.scene.background = null; // ver el video real
    this.world.setHologram(true);
    this.active = true;
    // Giroscopio para mirar (mejor en vertical)
    this.gyro = null; this._lastOri = null; this._baseYaw = null;
    const ok = await this._gyroPermission();
    if (ok && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      this._oriHandler = (e) => {
        if (e.alpha === null && e.beta === null && e.gamma === null) return;
        if (!this.gyro) this.gyro = { a: e.alpha || 0, b: e.beta || 0 };
        this._lastOri = { a: e.alpha || 0, b: e.beta || 0 };
      };
      window.addEventListener('deviceorientation', this._oriHandler);
    }
    return true;
  }

  // Aplica la mirada del giroscopio al jugador (llamar cada frame)
  update(player) {
    if (!this.active || !this._lastOri || !this.gyro) return;
    if (this._baseYaw === null) this._baseYaw = player.yaw;
    let dyaw = (this._lastOri.a - this.gyro.a) * Math.PI / 180;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    player.yaw = this._baseYaw - dyaw;
    const dpitch = -(this._lastOri.b - this.gyro.b) * Math.PI / 180;
    player.pitch = Math.max(-1.2, Math.min(1.2, dpitch));
    player.syncRig();
  }

  stop() {
    this.active = false;
    if (this._oriHandler) {
      window.removeEventListener('deviceorientation', this._oriHandler);
      this._oriHandler = null;
    }
    if (this.stream) {
      try { this.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      this.stream = null;
    }
    if (this.video) {
      try { this.video.srcObject = null; } catch { /* noop */ }
      this.video.classList.remove('on');
    }
    this.scene.background = this.skyColor;
    this.world.setHologram(false);
    this.gyro = null; this._lastOri = null; this._baseYaw = null;
  }
}
