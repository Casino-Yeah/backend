import { nuevaBaraja, barajar } from './cartas.js';

// Video póker "Jacks or Better". Multiplicador = devolución total sobre la apuesta.
export const TABLA_PAGOS = Object.freeze([
  { clave: 'escalera_real', nombre: 'Escalera real', multiplicador: 250 },
  { clave: 'escalera_color', nombre: 'Escalera de color', multiplicador: 50 },
  { clave: 'poker', nombre: 'Póker', multiplicador: 25 },
  { clave: 'full', nombre: 'Full', multiplicador: 9 },
  { clave: 'color', nombre: 'Color', multiplicador: 6 },
  { clave: 'escalera', nombre: 'Escalera', multiplicador: 4 },
  { clave: 'tercia', nombre: 'Tercia', multiplicador: 3 },
  { clave: 'dos_pares', nombre: 'Dos pares', multiplicador: 2 },
  { clave: 'par_altos', nombre: 'Par de J o mejor', multiplicador: 1 },
  { clave: 'nada', nombre: 'Sin premio', multiplicador: 0 },
]);
const porClave = Object.fromEntries(TABLA_PAGOS.map((m) => [m.clave, m]));

export function evaluarMano(cartas) {
  if (!Array.isArray(cartas) || cartas.length !== 5) throw new Error('Una mano tiene 5 cartas');
  const valores = cartas.map((c) => c.v).sort((a, b) => a - b);
  const conteo = {};
  for (const v of valores) conteo[v] = (conteo[v] || 0) + 1;
  const repeticiones = Object.values(conteo).sort((a, b) => b - a);
  const esColor = cartas.every((c) => c.p === cartas[0].p);
  const distintos = repeticiones.length === 5;
  const esEscaleraNormal = distintos && valores[4] - valores[0] === 4;
  const esEscaleraBaja = distintos && valores.join() === '2,3,4,5,14'; // A-2-3-4-5
  const esEscalera = esEscaleraNormal || esEscaleraBaja;

  let clave = 'nada';
  if (esEscalera && esColor) clave = valores[0] === 10 ? 'escalera_real' : 'escalera_color';
  else if (repeticiones[0] === 4) clave = 'poker';
  else if (repeticiones[0] === 3 && repeticiones[1] === 2) clave = 'full';
  else if (esColor) clave = 'color';
  else if (esEscalera) clave = 'escalera';
  else if (repeticiones[0] === 3) clave = 'tercia';
  else if (repeticiones[0] === 2 && repeticiones[1] === 2) clave = 'dos_pares';
  else if (repeticiones[0] === 2) {
    const par = Number(Object.keys(conteo).find((v) => conteo[v] === 2));
    if (par >= 11) clave = 'par_altos';
  }
  return porClave[clave];
}

export function iniciar(azar) {
  const mazo = barajar(nuevaBaraja(), azar);
  const mano = mazo.splice(-5).reverse();
  return { estado: { mazo, mano, fase: 'cambio', resultado: null }, terminado: false, multiplicador: null };
}

export function accion(estado, nombre, datos = {}) {
  if (nombre !== 'cambiar') throw new Error('Acción no válida para Póker. Usa "cambiar"');
  const conservar = datos.conservar ?? [];
  const validos = Array.isArray(conservar)
    && conservar.every((i) => Number.isInteger(i) && i >= 0 && i <= 4)
    && new Set(conservar).size === conservar.length;
  if (!validos) throw new Error('"conservar" debe ser una lista de posiciones distintas entre 0 y 4');
  const mazo = [...estado.mazo];
  const mano = estado.mano.map((c, i) => (conservar.includes(i) ? c : mazo.pop()));
  const resultado = evaluarMano(mano);
  return {
    estado: { mazo, mano, conservadas: conservar, fase: 'terminada', resultado: resultado.clave },
    terminado: true,
    multiplicador: resultado.multiplicador,
  };
}

export const ACCIONES = ['cambiar'];

export function vistaPublica(estado) {
  return {
    fase: estado.fase,
    mano: estado.mano,
    resultado: estado.resultado ? porClave[estado.resultado] : null,
    tablaPagos: TABLA_PAGOS.filter((m) => m.multiplicador > 0),
  };
}
