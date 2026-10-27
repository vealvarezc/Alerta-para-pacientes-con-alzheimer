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
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMobile = /Mobi|Android/.test(ua);
    if (!('xr' in navigator)) {
      out.msg = isIOS
        ? 'iPhone/iPad no soporta WebXR en ning\u00FAn navegador. Prueba el modo \U0001F4F7 AR con c\u00E1mara.'
        : 'Este navegador no tiene WebXR. En PC usa Chrome/Edge; en m\u00F3vil, Chrome en Android.';
      return out;
    }
    if (!window.isSecureContext) {
      out.msg = 'WebXR requiere HTTPS (o localhost).';
      return out;
    }
    try {
      if (navigator.xr.isSessionSupported) {
        out.ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        out.vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      }
    } catch { /* noop */ }
    if (out.ar && out.vr) out.msg = 'WebXR listo: puedes jugar en AR, VR o pantalla.';
    else if (out.ar) out.msg = 'WebXR listo: modo AR disponible.';
    else if (out.vr) out.msg = 'WebXR listo: modo VR disponible.';
    else if (isMobile) out.msg = 'Este m\u00F3vil no tiene WebXR/ARCore. Prueba el modo \U0001F4F7 AR con c\u00E1mara.';
    else out.msg = 'Sin visor XR conectado: abre esta p\u00E1gina en unas Meta Quest o conecta el visor al PC.';
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
