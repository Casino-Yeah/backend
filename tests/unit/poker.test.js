import { evaluarMano, iniciar, accion } from '../../src/games/poker.js';
import { azarConSemilla } from '../../src/games/azar.js';

const c = (texto) => texto.split(' ').map((t) => {
  const valores = { J: 11, Q: 12, K: 13, A: 14 };
  const v = valores[t.slice(0, -1)] ?? Number(t.slice(0, -1));
  return { v, p: t.slice(-1) };
});

describe('Póker: evaluación de cada mano ganadora', () => {
  test.each([
    ['10H JH QH KH AH', 'escalera_real', 250],
    ['5S 6S 7S 8S 9S', 'escalera_color', 50],
    ['AS 2S 3S 4S 5S', 'escalera_color', 50],
    ['9C 9D 9H 9S 2C', 'poker', 25],
    ['3C 3D 3H 7S 7C', 'full', 9],
    ['2D 7D 9D JD KD', 'color', 6],
    ['5C 6D 7H 8S 9C', 'escalera', 4],
    ['AC 2D 3H 4S 5C', 'escalera', 4],
    ['10C JD QH KS AC', 'escalera', 4],
    ['8C 8D 8H KS 2C', 'tercia', 3],
    ['4C 4D 9H 9S KC', 'dos_pares', 2],
    ['JC JD 3H 5S 9C', 'par_altos', 1],
    ['AC AD 3H 5S 9C', 'par_altos', 1],
    ['10C 10D 3H 5S 9C', 'nada', 0],
    ['2C 5D 9H JS KC', 'nada', 0],
    ['QC KD AH 2S 3C', 'nada', 0],
  ])('%s → %s (x%d)', (mano, clave, mult) => {
    const r = evaluarMano(c(mano));
    expect(r.clave).toBe(clave);
    expect(r.multiplicador).toBe(mult);
  });

  test('rechaza manos que no tienen 5 cartas', () => {
    expect(() => evaluarMano(c('AC AD'))).toThrow();
  });
});

describe('Póker: ronda de cambio', () => {
  test('reparte 5 cartas distintas y conserva las elegidas', () => {
    const { estado, terminado } = iniciar(azarConSemilla(7));
    expect(terminado).toBe(false);
    expect(estado.mano).toHaveLength(5);
    expect(estado.mazo).toHaveLength(47);
    const r = accion(estado, 'cambiar', { conservar: [0, 2] });
    expect(r.terminado).toBe(true);
    expect(r.estado.mano[0]).toEqual(estado.mano[0]);
    expect(r.estado.mano[2]).toEqual(estado.mano[2]);
    expect(r.estado.mazo).toHaveLength(44);
    expect(typeof r.multiplicador).toBe('number');
  });

  test('rechaza posiciones inválidas o repetidas', () => {
    const { estado } = iniciar(azarConSemilla(1));
    expect(() => accion(estado, 'cambiar', { conservar: [5] })).toThrow();
    expect(() => accion(estado, 'cambiar', { conservar: [1, 1] })).toThrow();
    expect(() => accion(estado, 'pedir')).toThrow();
  });
});
