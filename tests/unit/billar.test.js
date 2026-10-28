import { estadoInicial, simularTiro, validarTiro, MESA, TIROS_POR_PARTIDA } from '../../shared/billar.js';
import { iniciar, accion } from '../../src/games/billar.js';

describe('Billar: motor de física compartido', () => {
  test('el estado inicial tiene la blanca y 6 bolas sin encimarse', () => {
    const { bolas } = estadoInicial();
    expect(bolas).toHaveLength(7);
    for (let i = 0; i < bolas.length; i++) {
      for (let j = i + 1; j < bolas.length; j++) {
        expect(Math.hypot(bolas[i].x - bolas[j].x, bolas[i].y - bolas[j].y)).toBeGreaterThanOrEqual(MESA.radio * 2);
      }
    }
  });

  test('es determinista: el mismo tiro da el mismo resultado', () => {
    const tiro = { angulo: 0.01, potencia: 0.9 };
    const a = simularTiro(estadoInicial(), tiro);
    const b = simularTiro(estadoInicial(), tiro);
    expect(a).toEqual(b);
  });

  test('ninguna bola sale de la mesa', () => {
    let estado = estadoInicial();
    for (const angulo of [0, 0.7, 2.2, -1.3, 3.1]) {
      estado = simularTiro(estado, { angulo, potencia: 1 }).estado;
      for (const b of estado.bolas.filter((x) => x.enMesa)) {
        expect(b.x).toBeGreaterThanOrEqual(MESA.radio - 0.001);
        expect(b.x).toBeLessThanOrEqual(MESA.ancho - MESA.radio + 0.001);
        expect(b.y).toBeGreaterThanOrEqual(MESA.radio - 0.001);
        expect(b.y).toBeLessThanOrEqual(MESA.alto - MESA.radio + 0.001);
      }
    }
  });

  test('una bola dirigida a la buchaca se emboca', () => {
    const estado = {
      tiros: 0, embocadas: 0,
      bolas: [{ id: 0, x: 100, y: 100, enMesa: true }, { id: 1, x: 600, y: 300, enMesa: true }],
    };
    // tiro directo de la blanca hacia la esquina superior izquierda: falta
    const r = simularTiro(estado, { angulo: Math.atan2(-100, -100), potencia: 0.6 });
    expect(r.falta).toBe(true);
    expect(r.estado.bolas[0].enMesa).toBe(true); // la blanca se recoloca
    expect(r.estado.embocadas).toBe(0);
  });

  test('valida ángulo y potencia', () => {
    expect(validarTiro({ angulo: 0, potencia: 2 })).not.toBeNull();
    expect(validarTiro({ angulo: 'x', potencia: 0.5 })).not.toBeNull();
    expect(validarTiro({ angulo: 1, potencia: 0.5 })).toBeNull();
  });

  test('la partida termina a los 5 tiros con un multiplicador', () => {
    let r = iniciar();
    for (let i = 0; i < TIROS_POR_PARTIDA && !r.terminado; i++) {
      r = accion(r.estado, 'tiro', { angulo: 0.05 * i, potencia: 0.8 });
    }
    expect(r.terminado).toBe(true);
    expect(typeof r.multiplicador).toBe('number');
    expect(() => accion(r.estado, 'tiro', { angulo: 0, potencia: 0.5 })).toThrow();
  });
});
