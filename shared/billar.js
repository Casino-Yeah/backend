// =============================================================
// Motor de física del Billar 2D (compartido)
// Lo usan el servidor (para validar y calcular el resultado de
// cada tiro) y el navegador (para animarlo). Es determinista:
// mismo estado + mismo tiro = mismo resultado. No usa azar.
// =============================================================

export const MESA = Object.freeze({
  ancho: 800,
  alto: 400,
  radio: 11,
  radioBuchaca: 26,
});

export const BUCHACAS = Object.freeze([
  { x: 0, y: 0 },
  { x: MESA.ancho / 2, y: -4 },
  { x: MESA.ancho, y: 0 },
  { x: 0, y: MESA.alto },
  { x: MESA.ancho / 2, y: MESA.alto + 4 },
  { x: MESA.ancho, y: MESA.alto },
]);

export const TIROS_POR_PARTIDA = 5;
export const BOLAS_OBJETIVO = 6;
// Multiplicador según el número de bolas embocadas al terminar la partida (0 a 6)
export const MULTIPLICADORES = Object.freeze([0, 0.5, 1, 1.5, 2, 3, 5]);

const VELOCIDAD_MAXIMA = 22; // px por paso con potencia 1
const FRICCION = 0.99; // factor aplicado a la velocidad en cada paso
const REBOTE_BANDA = 0.85;
const REBOTE_BOLAS = 0.96;
const VELOCIDAD_MINIMA = 0.04;
const SUBPASOS = 4;
const PASOS_MAXIMOS = 4000;
const POSICION_SALIDA = Object.freeze({ x: 200, y: MESA.alto / 2 });

const redondear = (n) => Math.round(n * 1000) / 1000;

export function estadoInicial() {
  const bolas = [{ id: 0, x: POSICION_SALIDA.x, y: POSICION_SALIDA.y, enMesa: true }];
  const dx = MESA.radio * 2 * 0.875; // separación entre filas del triángulo
  const dy = MESA.radio + 0.1;
  let id = 1;
  for (let fila = 0; fila < 3; fila++) {
    for (let i = 0; i <= fila; i++) {
      bolas.push({
        id: id++,
        x: redondear(580 + fila * dx),
        y: redondear(MESA.alto / 2 + (i * 2 - fila) * dy),
        enMesa: true,
      });
    }
  }
  return { bolas, tiros: 0, embocadas: 0 };
}

export function validarTiro(tiro) {
  if (!tiro || typeof tiro !== 'object') return 'El tiro es obligatorio';
  const { angulo, potencia } = tiro;
  if (typeof angulo !== 'number' || !Number.isFinite(angulo) || Math.abs(angulo) > 2 * Math.PI) {
    return 'El ángulo debe ser un número entre -2π y 2π (radianes)';
  }
  if (typeof potencia !== 'number' || !Number.isFinite(potencia) || potencia < 0.05 || potencia > 1) {
    return 'La potencia debe ser un número entre 0.05 y 1';
  }
  return null;
}

export function partidaTerminada(estado) {
  return estado.tiros >= TIROS_POR_PARTIDA || estado.embocadas >= BOLAS_OBJETIVO;
}

export function multiplicadorFinal(estado) {
  return MULTIPLICADORES[Math.min(estado.embocadas, BOLAS_OBJETIVO)];
}

function enBuchaca(b) {
  return BUCHACAS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < MESA.radioBuchaca);
}

function moverYRebotar(b, factor) {
  b.x += b.vx * factor;
  b.y += b.vy * factor;
  const r = MESA.radio;
  if (b.x < r) { b.x = r; b.vx = -b.vx * REBOTE_BANDA; }
  if (b.x > MESA.ancho - r) { b.x = MESA.ancho - r; b.vx = -b.vx * REBOTE_BANDA; }
  if (b.y < r) { b.y = r; b.vy = -b.vy * REBOTE_BANDA; }
  if (b.y > MESA.alto - r) { b.y = MESA.alto - r; b.vy = -b.vy * REBOTE_BANDA; }
}

function chocar(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minimo = MESA.radio * 2;
  if (dist === 0 || dist >= minimo) return;
  const nx = dx / dist;
  const ny = dy / dist;
  // separar las bolas para que no se encimen
  const encimado = (minimo - dist) / 2;
  a.x -= nx * encimado; a.y -= ny * encimado;
  b.x += nx * encimado; b.y += ny * encimado;
  // intercambio de la componente normal (masas iguales)
  const relativa = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (relativa <= 0) return;
  const impulso = relativa * (1 + REBOTE_BOLAS) / 2;
  a.vx -= impulso * nx; a.vy -= impulso * ny;
  b.vx += impulso * nx; b.vy += impulso * ny;
}

function recolocarBlanca(blanca, bolas) {
  let x = POSICION_SALIDA.x;
  const libre = (px) => bolas.every((o) => o === blanca || !o.enMesa || Math.hypot(o.x - px, o.y - POSICION_SALIDA.y) >= MESA.radio * 2);
  while (!libre(x) && x > MESA.radio * 2) x -= MESA.radio * 2;
  blanca.x = x;
  blanca.y = POSICION_SALIDA.y;
  blanca.enMesa = true;
}

/**
 * Simula un tiro completo hasta que todas las bolas se detienen.
 * @param {object} estado  estado actual ({ bolas, tiros, embocadas }); no se modifica
 * @param {{angulo:number, potencia:number}} tiro
 * @param {{cuadros?: boolean}} opciones  cuadros=true guarda posiciones para animar
 * @returns {{ estado, embocadasTiro: number[], falta: boolean, cuadros?: Array }}
 */
export function simularTiro(estado, tiro, opciones = {}) {
  const error = validarTiro(tiro);
  if (error) throw new Error(error);
  if (partidaTerminada(estado)) throw new Error('La partida ya terminó');

  const bolas = estado.bolas.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const blanca = bolas.find((b) => b.id === 0);
  blanca.vx = Math.cos(tiro.angulo) * tiro.potencia * VELOCIDAD_MAXIMA;
  blanca.vy = Math.sin(tiro.angulo) * tiro.potencia * VELOCIDAD_MAXIMA;

  const embocadasTiro = [];
  const cuadros = opciones.cuadros ? [] : null;
  const factor = 1 / SUBPASOS;

  for (let paso = 0; paso < PASOS_MAXIMOS; paso++) {
    for (let s = 0; s < SUBPASOS; s++) {
      const activas = bolas.filter((b) => b.enMesa);
      for (const b of activas) moverYRebotar(b, factor);
      for (let i = 0; i < activas.length; i++) {
        for (let j = i + 1; j < activas.length; j++) chocar(activas[i], activas[j]);
      }
      for (const b of activas) {
        if (enBuchaca(b)) {
          b.enMesa = false;
          b.vx = 0; b.vy = 0;
          embocadasTiro.push(b.id);
        }
      }
    }
    let enMovimiento = false;
    for (const b of bolas) {
      if (!b.enMesa) continue;
      b.vx *= FRICCION; b.vy *= FRICCION;
      if (Math.hypot(b.vx, b.vy) < VELOCIDAD_MINIMA) { b.vx = 0; b.vy = 0; } else enMovimiento = true;
    }
    if (cuadros) cuadros.push(bolas.map((b) => ({ id: b.id, x: b.x, y: b.y, enMesa: b.enMesa })));
    if (!enMovimiento) break;
  }

  const falta = embocadasTiro.includes(0);
  if (falta) recolocarBlanca(blanca, bolas);

  const objetivo = embocadasTiro.filter((id) => id !== 0).length;
  const nuevo = {
    bolas: bolas.map((b) => ({ id: b.id, x: redondear(b.x), y: redondear(b.y), enMesa: b.enMesa })),
    tiros: estado.tiros + 1,
    embocadas: estado.embocadas + objetivo,
  };
  return { estado: nuevo, embocadasTiro, falta, ...(cuadros ? { cuadros } : {}) };
}
