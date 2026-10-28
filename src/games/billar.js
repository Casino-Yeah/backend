import {
  estadoInicial, simularTiro, partidaTerminada, multiplicadorFinal,
  MULTIPLICADORES, TIROS_POR_PARTIDA, BOLAS_OBJETIVO,
} from '../../shared/billar.js';

// El servidor recalcula cada tiro con el mismo motor que usa el navegador,
// así el resultado no depende de lo que diga el cliente.
export function iniciar() {
  return { estado: { ...estadoInicial(), ultimoTiro: null }, terminado: false, multiplicador: null };
}

export function accion(estado, nombre, datos = {}) {
  if (nombre !== 'tiro') throw new Error('Acción no válida para Billar. Usa "tiro"');
  const tiro = { angulo: datos.angulo, potencia: datos.potencia };
  const { estado: nuevo, embocadasTiro, falta } = simularTiro(estado, tiro);
  const terminado = partidaTerminada(nuevo);
  return {
    estado: { ...nuevo, ultimoTiro: { ...tiro, embocadasTiro, falta } },
    terminado,
    multiplicador: terminado ? multiplicadorFinal(nuevo) : null,
  };
}

export const ACCIONES = ['tiro'];

export function vistaPublica(estado) {
  return {
    bolas: estado.bolas,
    tiros: estado.tiros,
    tirosRestantes: TIROS_POR_PARTIDA - estado.tiros,
    embocadas: estado.embocadas,
    bolasObjetivo: BOLAS_OBJETIVO,
    ultimoTiro: estado.ultimoTiro,
    multiplicadores: MULTIPLICADORES,
  };
}
