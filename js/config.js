// Configuración global del juego "Equilibrio Seguro"
export const APP_VERSION = '1.7.0';
export const CONFIG = {
  eyeHeight: 1.6,
  walkSpeed: 2.2,      // m/s
  sprintSpeed: 4.2,    // m/s
  accelRate: 10,       // m/s^2 (respuesta del movimiento)
  friction: 9,
  turnSpeedKeys: 2.4,  // rad/s giro con teclado Q/E
  playerRadius: 0.35,
  strideLength: 0.72,  // m por paso (estimación de pasos)
  checkpointRadius: 1.4,
  // Sensibilidades del cinturón
  sensitivity: {
    baja:  { accel: 9.0, jerk: 46, erratic: 150, fallImpact: 16, recover: 6 },
    media: { accel: 8.0, jerk: 40, erratic: 125, fallImpact: 13, recover: 4 },
    alta:  { accel: 4.6, jerk: 23, erratic: 80,  fallImpact: 10, recover: 3 },
  },
  fallStillTime: 2.2,   // s de inmovilidad tras impacto para confirmar caída
  sosCountdown: 12,     // s cuenta atrás modal de caída
};

// Ruta guiada (6 puntos). Las coordenadas deben existir en el mundo (world.js).
export const ROUTE = [
  { id: 1, name: 'la Cocina',    hint: 'Cruza la puerta y entra a la cocina', x: -3.5, z: -2.5 },
  { id: 2, name: 'el Cuarto',    hint: 'Ve al cuarto de estudio',             x: 2.7,  z: -2.2 },
  { id: 3, name: 'el Baño',      hint: 'Pasa con cuidado al baño',            x: 5.5,  z: -3.0 },
  { id: 4, name: 'la Habitación', hint: 'Dirígete a la habitación principal', x: 4.0,  z: 2.5 },
  { id: 5, name: 'la Sala',      hint: 'Regresa a la sala con calma',         x: -3.0, z: 2.5 },
  { id: 6, name: 'la Salida',    hint: 'Llega a la puerta principal',         x: -5.8, z: 4.0 },
];

export const START_POS = { x: -2.2, z: 2.8, yaw: 0.35 };

export const TEXTS = {
  brusco: { title: 'Movimiento brusco', msg: 'Frenaste o giraste de golpe. Muévete con suavidad.' },
  erratica: { title: 'Marcha errática', msg: 'Detectado andar irregular: riesgo de caída. Reduce el ritmo.' },
  tropiezo: { title: '¡Tropiezo!', msg: 'Tropezaste con un obstáculo.' },
  caida: { title: 'Caída detectada', msg: 'Impacto + inmovilidad.' },
  estable: { title: 'Marcha estable', msg: 'Buen ritmo. El cinturón está tranquilo.' },
};
