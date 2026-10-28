import { iniciar, SEGMENTOS } from '../../src/games/ruleta.js';
import { azarConSemilla } from '../../src/games/azar.js';

describe('Ruleta de la suerte', () => {
  test('el multiplicador corresponde al segmento que salió', () => {
    for (let s = 0; s < 50; s++) {
      const r = iniciar(azarConSemilla(s));
      expect(r.terminado).toBe(true);
      expect(r.multiplicador).toBe(SEGMENTOS[r.estado.segmento]);
    }
  });

  test('la devolución teórica es menor al 100 %', () => {
    const promedio = SEGMENTOS.reduce((a, b) => a + b, 0) / SEGMENTOS.length;
    expect(promedio).toBeLessThan(1);
    expect(promedio).toBeGreaterThan(0.9);
  });

  test('con muchos giros salen todos los segmentos', () => {
    const azar = azarConSemilla(99);
    const vistos = new Set();
    for (let i = 0; i < 1000; i++) vistos.add(iniciar(azar).estado.segmento);
    expect(vistos.size).toBe(SEGMENTOS.length);
  });
});
