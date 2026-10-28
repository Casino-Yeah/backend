import { valorMano, accion, iniciar, vistaPublica, PAGOS } from '../../src/games/blackjack.js';
import { azarConSemilla } from '../../src/games/azar.js';

const carta = (v, p = 'S') => ({ v, p });

describe('Blackjack: valor de la mano', () => {
  test('cuenta figuras como 10 y ajusta ases', () => {
    expect(valorMano([carta(14), carta(13)])).toBe(21);
    expect(valorMano([carta(14), carta(14)])).toBe(12);
    expect(valorMano([carta(14), carta(9), carta(5)])).toBe(15);
    expect(valorMano([carta(10), carta(12), carta(2)])).toBe(22);
  });
});

describe('Blackjack: resultados y pagos', () => {
  const base = (jugador, crupier, mazo) => ({ jugador, crupier, mazo, fase: 'jugando', resultado: null });

  test('el jugador se pasa de 21 y pierde', () => {
    const r = accion(base([carta(10), carta(6)], [carta(9), carta(8)], [carta(12)]), 'pedir');
    expect(r.estado.resultado).toBe('pierde');
    expect(r.multiplicador).toBe(PAGOS.pierde);
  });

  test('el crupier se pasa y el jugador gana x2', () => {
    // el crupier tiene 16 y saca un 10 (mazo.pop toma el último)
    const r = accion(base([carta(10), carta(8)], [carta(10), carta(6)], [carta(10)]), 'plantarse');
    expect(r.estado.resultado).toBe('gana');
    expect(r.multiplicador).toBe(2);
  });

  test('empate devuelve la apuesta', () => {
    const r = accion(base([carta(10), carta(8)], [carta(10), carta(8)], []), 'plantarse');
    expect(r.estado.resultado).toBe('empate');
    expect(r.multiplicador).toBe(1);
  });

  test('el crupier gana con mayor puntaje', () => {
    const r = accion(base([carta(10), carta(7)], [carta(10), carta(9)], []), 'plantarse');
    expect(r.estado.resultado).toBe('pierde');
  });

  test('blackjack natural paga 2.5 (3 a 2)', () => {
    // buscamos una semilla que reparta blackjack natural al jugador
    let encontrado = null;
    for (let s = 0; s < 5000 && !encontrado; s++) {
      const r = iniciar(azarConSemilla(s));
      if (r.estado.resultado === 'blackjack') encontrado = r;
    }
    expect(encontrado).not.toBeNull();
    expect(encontrado.terminado).toBe(true);
    expect(encontrado.multiplicador).toBe(2.5);
  });

  test('la vista pública oculta la segunda carta del crupier y el mazo', () => {
    const v = vistaPublica(base([carta(10), carta(7)], [carta(10), carta(9)], [carta(2)]));
    expect(v.crupier[1]).toBeNull();
    expect(v.totalCrupier).toBe(10);
    expect(v.mazo).toBeUndefined();
  });

  test('rechaza acciones desconocidas', () => {
    expect(() => accion(base([], [], []), 'doblar')).toThrow();
  });
});
