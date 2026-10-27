// WebXR: sesiones inmersivas de AR (passthrough) y VR.
export class XRManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.session = null;
    this.refSpace = null;
    this.mode = null; // 'ar' | 'vr'
    this.onEnd = null;
    this.stick = { x: 0, y: 0 };
    renderer.xr.enabled = true;
  }

  get isPresenting() { return !!this.session; }

  async detect() {
    const out = { ar: false, vr: false, msg: '' };
    if (!('xr' in navigator)) {
      out.msg = 'Este navegador no soporta WebXR. Usa Chrome/Edge en Android o un visor Quest.';
      return out;
    }
    try {
      if (navigator.xr.isSessionSupported) {
        out.ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        out.vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      }
    } catch { /* noop */ }
    if (!window.isSecureContext) {
      out.msg = 'WebXR requiere HTTPS (o localhost). Publica la app con HTTPS para usar AR/VR.';
      out.ar = false; out.vr = false;
    } else if (out.ar && out.vr) out.msg = 'WebXR listo: puedes jugar en AR, VR o pantalla.';
    else if (out.ar) out.msg = 'WebXR listo: modo AR disponible.';
    else if (out.vr) out.msg = 'WebXR listo: modo VR disponible.';
    else out.msg = 'WebXR sin sesiones inmersivas aquí. Juega en pantalla o móvil.';
    return out;
  }

  async start(mode) {
    if (this.session) await this.end();
    const sessionInit = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    };
    if (mode === 'ar') {
      sessionInit.optionalFeatures.push('dom-overlay');
      const overlay = document.getElementById('hud');
      if (overlay) sessionInit.domOverlay = { root: overlay };
    }
    const session = await navigator.xr.requestSession(mode === 'ar' ? 'immersive-ar' : 'immersive-vr', sessionInit);
    session.addEventListener('end', () => {
      this.session = null;
      this.mode = null;
      if (this.onEnd) this.onEnd();
    });
    await this.renderer.xr.setSession(session);
    this.session = session;
    this.mode = mode;
    try {
      this.refSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      this.refSpace = await session.requestReferenceSpace('viewer');
    }
    return session;
  }

  async end() {
    if (this.session) {
      try { await this.session.end(); } catch { /* noop */ }
      this.session = null;
      this.mode = null;
    }
  }

  // Lee sticks de los mandos XR para locomoción suave
  pollControllers() {
    this.stick.x = 0; this.stick.y = 0;
    if (!this.session) return this.stick;
    for (const src of this.session.inputSources) {
      const gp = src.gamepad;
      if (!gp || !gp.axes) continue;
      const ax = gp.axes[2] !== undefined ? gp.axes[2] : gp.axes[0];
      const ay = gp.axes[3] !== undefined ? gp.axes[3] : gp.axes[1];
      if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) {
        this.stick.x = ax; this.stick.y = -ay;
        break;
      }
    }
    return this.stick;
  }
}
