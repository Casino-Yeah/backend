import { nuevaBaraja, barajar } from './cartas.js';

// Pagos (devolución total sobre la apuesta)
export const PAGOS = Object.freeze({ blackjack: 2.5, gana: 2, empate: 1, pierde: 0 });

export function valorMano(cartas) {
  let total = 0;
  let ases = 0;
  for (const c of cartas) {
    if (c.v === 14) { total += 11; ases++; } else total += Math.min(c.v, 10);
  }
  while (total > 21 && ases > 0) { total -= 10; ases--; }
  return total;
}

const esBlackjack = (cartas) => cartas.length === 2 && valorMano(cartas) === 21;

function terminar(estado, resultado) {
  return { estado: { ...estado, fase: 'terminada', resultado }, terminado: true, multiplicador: PAGOS[resultado] };
}

function turnoCrupier(estado) {
  const mazo = [...estado.mazo];
  const crupier = [...estado.crupier];
  while (valorMano(crupier) < 17) crupier.push(mazo.pop());
  const nuevo = { ...estado, mazo, crupier };
  const j = valorMano(nuevo.jugador);
  const c = valorMano(crupier);
  if (c > 21 || j > c) return terminar(nuevo, 'gana');
  if (j === c) return terminar(nuevo, 'empate');
  return terminar(nuevo, 'pierde');
}

export function iniciar(azar) {
  const mazo = barajar(nuevaBaraja(), azar);
  const jugador = [mazo.pop(), mazo.pop()];
  const crupier = [mazo.pop(), mazo.pop()];
  const estado = { mazo, jugador, crupier, fase: 'jugando', resultado: null };
  const bjJugador = esBlackjack(jugador);
  const bjCrupier = esBlackjack(crupier);
  if (bjJugador && bjCrupier) return terminar(estado, 'empate');
  if (bjJugador) return terminar(estado, 'blackjack');
  if (bjCrupier) return terminar(estado, 'pierde');
  return { estado, terminado: false, multiplicador: null };
}

export function accion(estado, nombre) {
  if (nombre === 'pedir') {
    const mazo = [...estado.mazo];
    const jugador = [...estado.jugador, mazo.pop()];
    const nuevo = { ...estado, mazo, jugador };
    const total = valorMano(jugador);
    if (total > 21) return terminar(nuevo, 'pierde');
    if (total === 21) return turnoCrupier(nuevo);
    return { estado: nuevo, terminado: false, multiplicador: null };
  }
  if (nombre === 'plantarse') return turnoCrupier(estado);
  throw new Error('Acción no válida para Blackjack. Usa "pedir" o "plantarse"');
}

export const ACCIONES = ['pedir', 'plantarse'];

// Lo que puede ver el jugador: sin el mazo y con la carta oculta del crupier
export function vistaPublica(estado) {
  const oculta = estado.fase === 'jugando';
  return {
    fase: estado.fase,
    resultado: estado.resultado,
    jugador: estado.jugador,
    totalJugador: valorMano(estado.jugador),
    crupier: oculta ? [estado.crupier[0], null] : estado.crupier,
    totalCrupier: oculta ? valorMano([estado.crupier[0]]) : valorMano(estado.crupier),
  };
}
