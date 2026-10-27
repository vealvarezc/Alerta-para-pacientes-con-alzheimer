// Sonidos sintetizados con WebAudio (sin archivos externos)
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.alarmTimer = null;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) { this.muted = m; if (m) this.stopAlarm(); }
  toggle() { this.setMuted(!this.muted); return this.muted; }

  tone(freq, dur, type = 'sine', vol = 0.22, when = 0, slideTo = null) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  click() { this.tone(660, 0.07, 'triangle', 0.15); }
  success() { this.tone(523, 0.12, 'triangle'); this.tone(659, 0.12, 'triangle', 0.22, 0.1); this.tone(784, 0.2, 'triangle', 0.22, 0.2); }
  warn() { this.tone(440, 0.15, 'square', 0.12); this.tone(440, 0.15, 'square', 0.12, 0.2); }
  stumble() { this.tone(220, 0.25, 'sawtooth', 0.18, 0, 90); }
  step(sprint) { this.tone(sprint ? 140 : 110, 0.05, 'sine', 0.05); }
  checkpoint() { this.success(); }
  startAlarm() {
    this.stopAlarm();
    if (this.muted) return;
    this.tone(880, 0.4, 'square', 0.14, 0, 440);
    this.alarmTimer = setInterval(() => {
      if (this.muted) return;
      this.tone(880, 0.4, 'square', 0.14, 0, 440);
    }, 900);
  }
  stopAlarm() { if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null; } }
}
