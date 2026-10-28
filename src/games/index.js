import * as blackjack from './blackjack.js';
import * as poker from './poker.js';
import * as ruleta from './ruleta.js';
import * as billar from './billar.js';

// Cada juego expone: iniciar(azar), accion(estado, nombre, datos, azar), vistaPublica(estado), ACCIONES
export const JUEGOS = { blackjack, poker, ruleta, billar };

export function obtenerJuego(slug) {
  return JUEGOS[slug] ?? null;
}

// RN-06: el estado de la apuesta se deriva del multiplicador calculado por el servidor
export function estadoPorMultiplicador(multiplicador) {
  if (multiplicador > 1) return 'ganada';
  if (multiplicador === 1) return 'empate';
  return 'perdida';
}
