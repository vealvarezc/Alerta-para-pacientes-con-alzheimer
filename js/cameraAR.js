// AR con camara (alternativa sin gafas ni WebXR): muestra el video real
// detras del juego, la casa se vuelve holograma y el giroscopio sirve
// para mirar alrededor. Funciona en movil y en PC con webcam.
import { GyroLook } from './gyro.js';

export class CameraAR {
  constructor(scene, world, skyColor) {
    this.scene = scene;
    this.world = world;
    this.skyColor = skyColor;
    this.active = false;
    this.video = null;
    this.stream = null;
    this.gyro = new GyroLook();
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
    // Giroscopio (si falla, se sigue pudiendo arrastrar para mirar)
    try { await this.gyro.start(); } catch { /* noop */ }
    return true;
  }

  // Aplica la mirada del giroscopio al jugador (llamar cada frame)
  update(player) {
    if (!this.active) return;
    this.gyro.update(player);
  }

  stop() {
    this.active = false;
    this.gyro.stop();
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
  }
}
