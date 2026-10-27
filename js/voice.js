// Comandos por voz: usa el microfono del PC, movil o gafas AR (Web Speech API)
// para pedir ayuda ("llamar al cuidador") y responder si esta bien.
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Devuelve 'sos' | 'ok' | null segun la frase escuchada
export function matchCommand(phrase) {
  const p = ` ${norm(phrase)} `;
  const has = (...words) => words.some((w) => p.includes(w));
  if (has('no estoy bien', 'no me encuentro bien', 'no estoy nada bien')) return 'sos';
  if (has('llamar al cuidador', 'llama al cuidador', 'llamen al cuidador', 'ven cuidador',
          'cuidador', 'ayuda', 'socorro', 'emergencia', 'auxilio', 'necesito ayuda')) return 'sos';
  if (has('estoy bien', 'me encuentro bien', 'todo bien', 'estoy bien')) return 'ok';
  return null;
}

function pickLang() {
  try {
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'es-ES';
    return nav.toLowerCase().startsWith('es') ? nav : 'es-ES';
  } catch { return 'es-ES'; }
}

export class VoiceControl {
  constructor(opts = {}) {
    this.onCommand = opts.onCommand || null;     // (cmd, phrase) => {}
    this.onTranscript = opts.onTranscript || null; // (text, isFinal) => {}
    this.onState = opts.onState || null;         // (state, detail) => {}
    const SR = (typeof window !== 'undefined') &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    this.SR = SR || null;
    this.supported = !!SR;
    this.rec = null;
    this.enabled = false;
    this.state = 'off';
    this.lang = pickLang();
    this._manualStop = true;
    this._lastStart = 0;
    this._fastRestarts = 0;
    this._cooldownUntil = 0;
  }

  _setState(s, detail = '') {
    this.state = s;
    if (this.onState) this.onState(s, detail);
  }

  _build() {
    const rec = new this.SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim && this.onTranscript) this.onTranscript(interim, false);
      if (final) {
        const phrase = final.trim();
        if (this.onTranscript) this.onTranscript(phrase, true);
        this._handlePhrase(phrase);
      }
    };
    rec.onerror = (e) => {
      const err = e.error || '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.enabled = false;
        this._manualStop = true;
        this._setState('denied', 'Permiso de microfono denegado');
      } else if (err === 'network') {
        this._setState('error', 'Sin conexion para el reconocimiento de voz');
      } else if (err === 'aborted' || err === 'no-speech') {
        // benignos: onend se encarga de reanudar
      } else {
        this._setState('error', `Error de voz: ${err}`);
      }
    };
    rec.onend = () => {
      if (!this.enabled || this._manualStop) return;
      const now = Date.now();
      if (now - this._lastStart < 800) this._fastRestarts++;
      else this._fastRestarts = 0;
      if (this._fastRestarts > 8) {
        this.enabled = false;
        this._setState('error', 'El microfono se detiene solo en este dispositivo');
        return;
      }
      setTimeout(() => { if (this.enabled && !this._manualStop) this._startRec(); }, 350);
    };
    this.rec = rec;
  }

  _startRec() {
    try {
      if (!this.rec) this._build();
      this._lastStart = Date.now();
      this.rec.start();
      this._setState('listening');
    } catch (err) {
      // InvalidStateError si ya estaba grabando: ignorar
      if (err && err.name !== 'InvalidStateError') this._setState('error', String(err.message || err));
    }
  }

  // Debe llamarse desde un gesto del usuario (clic)
  start() {
    if (!this.supported) {
      this._setState('unsupported', 'Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return false;
    }
    this._manualStop = false;
    this._fastRestarts = 0;
    this.enabled = true;
    this._startRec();
    return true;
  }

  stop() {
    this._manualStop = true;
    this.enabled = false;
    try { if (this.rec) this.rec.stop(); } catch { /* noop */ }
    this._setState('off');
  }

  toggle() {
    if (this.enabled) { this.stop(); return false; }
    return this.start();
  }

  _handlePhrase(phrase) {
    const now = Date.now();
    if (now < this._cooldownUntil) return;
    const cmd = matchCommand(phrase);
    if (cmd) {
      this._cooldownUntil = now + 3000; // no repetir el mismo pedido
      if (this.onCommand) this.onCommand(cmd, phrase);
    }
  }

  // Lee un texto en voz alta (para preguntar si esta bien, confirmar avisos...)
  speak(text) {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      u.rate = 1.02;
      u.pitch = 1;
      synth.speak(u);
      return true;
    } catch { return false; }
  }
}
