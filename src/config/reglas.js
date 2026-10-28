// Reglas de negocio (RN) con sus valores. Ver docs/reglas-de-negocio.md
export const REGLAS = Object.freeze({
  EDAD_MINIMA: 18, // RN-01
  BONO_BIENVENIDA: 1000, // RN-01
  RECARGA_MINIMA: 100, // RN-04
  RECARGA_MAXIMA: 5000, // RN-04
  RECARGA_DIARIA_MAXIMA: 20000, // RN-04
  AJUSTE_MAXIMO: 100000, // RN-07
});

export const ROLES = Object.freeze({ admin: 1, jugador: 2 });
export const TIPOS_MOVIMIENTO = Object.freeze({ recarga: 1, apuesta: 2, premio: 3, ajuste: 4, bono: 5 });

export const redondear2 = (n) => Math.round(n * 100) / 100;

export function edad(fechaNacimiento, hoy = new Date()) {
  const [a, m, d] = String(fechaNacimiento).slice(0, 10).split('-').map(Number);
  let anios = hoy.getFullYear() - a;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < m || (mesActual === m && hoy.getDate() < d)) anios--;
  return anios;
}
