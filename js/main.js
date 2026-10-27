// Equilibrio Seguro — punto de entrada.
import * as THREE from 'three';
import { SoundManager } from './audio.js';
import { BeltMonitor } from './belt.js';
import { InputManager } from './input.js';
import { World } from './world.js';
import { Actors } from './actors.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { XRManager } from './xr.js';
import { Game } from './game.js';

const container = document.getElementById('scene-container');

// ---------- renderer / escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x141a33);
scene.background = SKY;
scene.fog = new THREE.Fog(0x141a33, 20, 55);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 120);

// ---------- módulos ----------
const sound = new SoundManager();
const belt = new BeltMonitor(sound);
const input = new InputManager(renderer.domElement);
const world = new World(scene);
const actors = new Actors(scene, world);
const player = new Player(scene, camera);
const ui = new UI();
const xr = new XRManager(renderer, scene, camera);
const game = new Game({ ui, belt, player, world, actors, input, sound });

player.spawn(-2.2, 2.8, 0.35);
// fondo del menú: vista de la sala
player.yaw = 0.6; player.syncRig();

// ---------- responsive ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- XR ----------
let xrCaps = { ar: false, vr: false };
xr.detect().then((caps) => {
  xrCaps = caps;
  ui.setXRSupport(caps.ar, caps.vr, caps.msg);
});
xr.onEnd = () => {
  player.setXR(false);
  world.setHologram(false);
  scene.background = SKY;
  ui.toast('Sesión XR terminada · sigues en pantalla');
};

async function enterXR(mode) {
  try {
    if (game.state !== 'playing') startGame();
    sound.ensure();
    await xr.start(mode);
    player.setXR(true);
    if (mode === 'ar') {
      world.setHologram(true);
      scene.background = null; // ver el mundo real (passthrough)
      ui.toast('Modo AR: la casa es un holograma sobre tu espacio. Camina físicamente 🚶', 4000);
    } else {
      ui.toast('Modo VR: usa el stick para moverte o camina en tu zona segura', 4000);
    }
  } catch (err) {
    console.warn('XR:', err);
    player.setXR(false);
    world.setHologram(false);
    scene.background = SKY;
    ui.toast('No se pudo iniciar XR aquí. Sigues jugando en pantalla.');
  }
}

// ---------- flujo ----------
function startGame() {
  belt.setSensitivity(ui.sens);
  game.start(ui.mode);
}
ui.onClick('btn-play', () => { sound.ensure(); sound.click(); startGame(); });
ui.onClick('btn-ar', () => enterXR('ar'));
ui.onClick('btn-vr', () => enterXR('vr'));
ui.onClick('btn-xr-hud', () => enterXR(xrCaps.ar ? 'ar' : 'vr'));
ui.onClick('btn-again', () => { sound.click(); startGame(); });
ui.onClick('btn-tomenu', () => { sound.click(); game.toMenu(); });
ui.onClick('btn-exit', () => { sound.click(); if (xr.isPresenting) xr.end(); game.toMenu(); });
ui.onClick('btn-help', () => { sound.click(); ui.openHelp(); });
ui.onClick('btn-help-close', () => { sound.click(); ui.closeHelp(); });
ui.onClick('btn-imok', () => { sound.click(); game.resolveFall(true); });
ui.onClick('btn-sos', () => { sound.click(); game.resolveFall(false); });
ui.onClick('btn-trip', () => { if (game.state === 'playing') belt.simulateStumble(); });
ui.onClick('btn-fall', () => { if (game.state === 'playing') belt.triggerFall('Prueba manual del botón de pánico'); });
ui.onClick('btn-sensors', async () => {
  const r = await belt.attachDeviceMotion();
  ui.toast({
    ok: '📡 Sensores del móvil activados: el cinturón usa tu acelerómetro real',
    denied: 'Permiso de sensores denegado',
    unsupported: 'Este dispositivo no tiene sensores de movimiento',
    error: 'No se pudieron activar los sensores',
  }[r] || r);
});
const muteBtn = document.getElementById('btn-mute');
function toggleMute() {
  const m = sound.toggle();
  muteBtn.textContent = m ? '🔇' : '🔊';
}
ui.onClick('btn-mute', toggleMute);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyH') { ui.isHelpOpen() ? ui.closeHelp() : ui.openHelp(); }
  else if (e.code === 'Escape' && ui.isHelpOpen()) ui.closeHelp();
  else if (e.code === 'KeyT' && game.state === 'playing') belt.simulateStumble();
  else if (e.code === 'KeyC' && game.state === 'playing') belt.triggerFall('Prueba manual del botón de pánico');
});

// ---------- bucle ----------
const clock = new THREE.Clock();
let menuOrbit = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (game.state === 'menu' || game.state === 'end') {
    // cámara orbital suave detrás del menú
    menuOrbit += dt * 0.08;
    const cx = -3 + Math.sin(menuOrbit) * 2;
    const cz = 2.6 + Math.cos(menuOrbit * 0.7) * 1.2;
    player.pos.set(cx, 0, cz);
    player.yaw = menuOrbit + Math.PI;
    player.pitch = -0.08;
    player.syncRig();
    actors.update(dt, player.pos);
    world.update(dt, t);
  } else {
    const xrMove = xr.isPresenting ? xr.pollControllers() : null;
    player.update(dt, input, world, actors, xrMove);
    actors.update(dt, player.pos);
    world.update(dt, t);
    game.update(dt);
  }
  renderer.render(scene, camera);
});
