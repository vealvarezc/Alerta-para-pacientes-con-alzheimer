// Interfaz: HUD, cinturón, minimapa, alertas, modales y menús.
export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), menu: $('menu'), help: $('help'), end: $('end'),
      objectiveTarget: $('objective-target'), objectiveLabel: $('objective-label'),
      timer: $('hud-timer'), score: $('hud-score'), tracker: $('checkpoint-tracker'),
      beltStatus: $('belt-status'), beltLed: $('belt-led'), beltSpeed: $('belt-speed'),
      beltSteps: $('belt-steps'), beltGait: $('belt-gait'), beltDist: $('belt-dist'),
      stabFill: $('stability-fill'), stabNum: $('stability-num'),
      feed: $('alert-feed'), banner: $('banner'), toast: $('toast'),
      minimap: $('minimap'), arrowGlyph: $('route-arrow-glyph'), arrowDist: $('route-arrow-dist'),
      routeArrow: $('route-arrow'), vignette: $('vignette'), flash: $('flash'),
      fallModal: $('fall-modal'), fallCount: $('fall-countdown'),
      endTitle: $('end-title'), endSub: $('end-sub'), endStats: $('end-stats'),
      xrMsg: $('xr-msg'), btnAR: $('btn-ar'), btnVR: $('btn-vr'), btnXRHud: $('btn-xr-hud'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.bannerTimer = null;
    this.mode = 'ruta';
    this.sens = 'media';
    this._bindSeg();
  }

  _bindSeg() {
    const seg = (id, cb) => {
      const box = document.getElementById(id);
      box.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          box.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          cb(b.dataset.v);
        });
      });
    };
    seg('seg-mode', (v) => { this.mode = v; });
    seg('seg-sens', (v) => { this.sens = v; });
  }

  onClick(id, fn) { document.getElementById(id).addEventListener('click', fn); }

  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  showMenu(v) { this.el.menu.classList.toggle('hidden', !v); }
  openHelp() { this.el.help.classList.remove('hidden'); }
  closeHelp() { this.el.help.classList.add('hidden'); }
  showEnd(v) { this.el.end.classList.toggle('hidden', !v); }
  isHelpOpen() { return !this.el.help.classList.contains('hidden'); }

  setFreeMode(isFree) {
    this.el.objectiveLabel.textContent = isFree ? 'Paseo libre' : 'Ruta guiada';
    this.el.tracker.style.display = isFree ? 'none' : 'flex';
    this.el.routeArrow.style.display = isFree ? 'none' : 'block';
  }

  setObjective(t) { this.el.objectiveTarget.textContent = t; }
  setTimer(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    this.el.timer.textContent = `${m}:${s}`;
  }
  setScore(n) { this.el.score.textContent = `★ ${Math.max(0, Math.round(n))}`; }

  renderTracker(route, idx) {
    this.el.tracker.innerHTML = '';
    route.forEach((cp, i) => {
      const d = document.createElement('div');
      d.className = 'cp-dot' + (i < idx ? ' done' : i === idx ? ' next' : '');
      d.textContent = i < idx ? '✓' : cp.id;
      this.el.tracker.appendChild(d);
    });
  }

  updateBelt(st) {
    this.el.beltSpeed.textContent = `${st.speed.toFixed(1)} m/s`;
    this.el.beltSteps.textContent = st.steps;
    this.el.beltGait.textContent = st.sensorReal ? `${st.gait} 📡` : st.gait;
    this.el.beltDist.textContent = `${st.distance} m`;
    this.el.stabFill.style.width = `${st.stability}%`;
    this.el.stabNum.textContent = st.stability;
    const f = this.el.stabFill;
    f.style.background = st.stability > 60
      ? 'linear-gradient(90deg,#37d67a,#a3e635)'
      : st.stability > 30 ? 'linear-gradient(90deg,#e8a13a,#ffd23f)' : 'linear-gradient(90deg,#d63a3a,#ff7a5a)';
    const s = this.el.beltStatus, led = this.el.beltLed;
    if (st.fall) { s.textContent = '● ¡CAÍDA!'; s.className = 'danger'; led.className = 'danger'; }
    else if (st.stability <= 30 || st.gait === 'Errática') { s.textContent = '● Riesgo'; s.className = 'warn'; led.className = 'warn'; s.id = 'belt-status'; }
    else { s.textContent = '● Estable'; s.className = 'ok'; led.className = ''; s.id = 'belt-status'; }
  }

  pushAlert(kind, title, msg) {
    const d = document.createElement('div');
    d.className = `alert ${kind}`;
    d.innerHTML = `<b>${title}</b>${msg}`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .5s'; setTimeout(() => d.remove(), 500); }, 6000);
  }

  banner(text, kind = '', dur = 2200) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = kind;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), dur);
  }

  toast(text, dur = 2600) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.add('hidden'), dur);
  }

  hurtFlash() {
    this.el.flash.classList.add('on');
    this.el.vignette.classList.add('hurt');
    setTimeout(() => {
      this.el.flash.classList.remove('on');
      this.el.vignette.classList.remove('hurt');
    }, 350);
  }

  showFallModal() { this.el.fallModal.classList.remove('hidden'); }
  hideFallModal() { this.el.fallModal.classList.add('hidden'); }
  setFallCount(n) { this.el.fallCount.textContent = Math.ceil(n); }

  setRouteArrow(relDeg, dist) {
    this.el.arrowGlyph.style.transform = `rotate(${relDeg - 90}deg)`;
    this.el.arrowDist.textContent = `${dist.toFixed(0)} m`;
  }

  setXRSupport(ar, vr, msg) {
    this.el.btnAR.disabled = !ar;
    this.el.btnVR.disabled = !vr;
    this.el.xrMsg.textContent = msg;
    if (ar || vr) {
      this.el.btnXRHud.classList.remove('hidden');
      this.el.btnXRHud.textContent = ar ? '🥽' : '🕶️';
    }
  }

  fillResults(title, sub, stats) {
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.endStats.innerHTML = stats.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
  }

  // ---- minimapa ----
  drawMinimap(world, player, actors, route, nextIdx) {
    const g = this.mm, W = this.el.minimap.width, H = this.el.minimap.height;
    const X1 = -7.4, X2 = 7.4, Z1 = -5.4, Z2 = 5.4;
    const px = (x) => (x - X1) / (X2 - X1) * W;
    const pz = (z) => (z - Z1) / (Z2 - Z1) * H;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d1330'; g.fillRect(0, 0, W, H);
    // suelo
    g.fillStyle = '#1c2547'; g.fillRect(px(-7), pz(-5), px(7) - px(-7), pz(5) - pz(-5));
    // colisionadores (muros + muebles)
    g.fillStyle = '#8f9bd8';
    for (const c of world.colliders) {
      g.fillRect(px(c.x1), pz(c.z1), Math.max(2, px(c.x2) - px(c.x1)), Math.max(2, pz(c.z2) - pz(c.z1)));
    }
    // obstáculos
    for (const o of world.obstacles) {
      g.fillStyle = 'rgba(255,160,40,.9)';
      g.beginPath(); g.arc(px(o.x), pz(o.z), 4, 0, 7); g.fill();
    }
    // ruta
    route.forEach((cp, i) => {
      const done = i < nextIdx, next = i === nextIdx;
      g.fillStyle = done ? '#37d67a' : next ? '#ffb347' : '#5a6390';
      g.beginPath(); g.arc(px(cp.x), pz(cp.z), next ? 5 : 3.5, 0, 7); g.fill();
      g.fillStyle = '#0b1030'; g.font = '700 8px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(cp.id, px(cp.x), pz(cp.z));
    });
    // actores
    const dot = (x, z, color, r = 3) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), pz(z), r, 0, 7); g.fill(); };
    dot(actors.caregiver.pos.x, actors.caregiver.pos.z, '#4dd0e1');
    dot(actors.relative.pos.x, actors.relative.pos.z, '#ba68c8');
    dot(actors.dog.pos.x, actors.dog.pos.z, '#a5713f');
    dot(actors.cat.pos.x, actors.cat.pos.z, '#9aa3c7', 2);
    // jugador
    const x = px(player.pos.x), z = pz(player.pos.z);
    const a = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)); // rumbo en plano (x,z)
    g.save();
    g.translate(x, z); g.rotate(-a + 0); // canvas: +y es abajo = +z
    g.rotate(Math.PI); // ajustar: 0 rad = mirando -z (arriba)
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.strokeStyle = '#ffb347'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
}
