// Ruleta de la suerte: una rueda de 12 segmentos con multiplicadores.
// Devolución teórica = promedio de los segmentos = 0.958 (95.8 %).
export const SEGMENTOS = Object.freeze([0, 1.5, 0, 2, 0.5, 0, 5, 0, 1, 0, 1.5, 0]);

export function iniciar(azar) {
  const segmento = azar.entero(SEGMENTOS.length);
  return {
    estado: { segmento, fase: 'terminada' },
    terminado: true,
    multiplicador: SEGMENTOS[segmento],
  };
}

export function accion() {
  throw new Error('La Ruleta de la suerte se resuelve en un solo giro');
}

export const ACCIONES = [];

export function vistaPublica(estado) {
  return { fase: estado.fase, segmento: estado.segmento, multiplicador: SEGMENTOS[estado.segmento], segmentos: SEGMENTOS };
}
