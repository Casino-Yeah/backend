import { randomInt } from 'node:crypto';

// Generador de azar criptográfico. Las pruebas inyectan uno con semilla.
export const azarSeguro = {
  entero: (max) => randomInt(max),
};

// Generador determinista (mulberry32) para pruebas repetibles
export function azarConSemilla(semilla) {
  let a = semilla >>> 0;
  return {
    entero(max) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * max);
    },
  };
}
