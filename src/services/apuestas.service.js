import { pool, transaccion } from '../config/db.js';
import { redondear2 } from '../config/reglas.js';
import { obtenerJuego, estadoPorMultiplicador } from '../games/index.js';
import { azarSeguro } from '../games/azar.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../utils/errores.js';
import { leerOrden, leerPaginacion, respuestaPaginada, rangoFechas } from '../utils/paginacion.js';
import { aplicarMovimiento } from './billetera.service.js';
import * as bitacora from './bitacora.service.js';

// Solo para pruebas automatizadas: permite provocar un error a mitad de la transacción
export const ganchosPrueba = { despuesDelCargo: null };

function formatear(apuesta, juego, saldo) {
  const logica = obtenerJuego(juego.tipo);
  return {
    id: apuesta.id,
    juego: { id: juego.id, nombre: juego.nombre, tipo: juego.tipo },
    monto: apuesta.monto,
    estado: apuesta.estado,
    multiplicador: apuesta.multiplicador ?? null,
    pago: apuesta.pago ?? 0,
    vista: apuesta.estado_juego ? logica.vistaPublica(apuesta.estado_juego) : null,
    saldo,
  };
}

// Guarda el nuevo estado del juego; si terminó, calcula el pago (RN-06) y lo abona
async function guardarResultado(conn, apuesta, juego, resultado, usuarioId) {
  let saldo = null;
  if (!resultado.terminado) {
    await conn.query('UPDATE apuestas SET estado_juego = ? WHERE id = ?', [JSON.stringify(resultado.estado), apuesta.id]);
    return { ...apuesta, estado_juego: resultado.estado, saldo };
  }
  const multiplicador = resultado.multiplicador;
  const pago = redondear2(apuesta.monto * multiplicador);
  const estado = estadoPorMultiplicador(multiplicador);
  await conn.query(
    'UPDATE apuestas SET estado_juego = ?, multiplicador = ?, pago = ?, estado = ?, resuelto_en = NOW() WHERE id = ?',
    [JSON.stringify(resultado.estado), multiplicador, pago, estado, apuesta.id],
  );
  if (pago > 0) {
    ({ saldo } = await aplicarMovimiento(conn, { usuarioId, tipo: 'premio', monto: pago, apuestaId: apuesta.id, descripcion: `Premio en ${juego.nombre}` }));
  }
  return { ...apuesta, estado_juego: resultado.estado, multiplicador, pago, estado, saldo };
}

async function saldoActual(conn, usuarioId) {
  const [[b]] = await conn.query('SELECT saldo FROM billeteras WHERE usuario_id = ?', [usuarioId]);
  return b?.saldo ?? 0;
}

/** Endpoint 19: inicia una partida. Cargo + creación + (resultado inmediato) en UNA transacción. */
export async function iniciar({ usuarioId, juegoId, monto, ip }) {
  return transaccion(async (conn) => {
    const [[juego]] = await conn.query(
      'SELECT id, tipo, nombre, apuesta_min AS apuestaMin, apuesta_max AS apuestaMax, activo FROM juegos WHERE id = ?',
      [juegoId],
    );
    if (!juego) throw noEncontrado('Juego no encontrado');
    // RN-05: solo juegos activos aceptan apuestas
    if (!juego.activo) throw conflicto('El juego no está disponible en este momento');
    // RN-02: el monto debe respetar los límites del juego
    if (monto < juego.apuestaMin || monto > juego.apuestaMax) {
      throw solicitudInvalida(`La apuesta en ${juego.nombre} debe estar entre ${juego.apuestaMin} y ${juego.apuestaMax} créditos`, [
        { campo: 'monto', mensaje: 'Fuera de los límites del juego' },
      ]);
    }
    // RN-05: una sola partida en curso por juego
    const [[enCurso]] = await conn.query(
      `SELECT id, monto, estado, multiplicador, pago, estado_juego FROM apuestas
        WHERE usuario_id = ? AND juego_id = ? AND estado = 'en_curso' LIMIT 1 FOR UPDATE`,
      [usuarioId, juegoId],
    );
    if (enCurso) {
      throw conflicto('Ya tienes una partida en curso de este juego; termínala antes de iniciar otra', {
        partida: formatear(enCurso, juego, await saldoActual(conn, usuarioId)),
      });
    }

    const [res] = await conn.query('INSERT INTO apuestas (usuario_id, juego_id, monto) VALUES (?, ?, ?)', [usuarioId, juegoId, monto]);
    const apuesta = { id: res.insertId, monto, estado: 'en_curso', multiplicador: null, pago: 0 };
    // RN-03: el cargo falla con 409 si no hay saldo suficiente y todo se revierte
    let { saldo } = await aplicarMovimiento(conn, { usuarioId, tipo: 'apuesta', monto: -monto, apuestaId: apuesta.id, descripcion: `Apuesta en ${juego.nombre}` });
    if (ganchosPrueba.despuesDelCargo) await ganchosPrueba.despuesDelCargo();

    const resultado = obtenerJuego(juego.tipo).iniciar(azarSeguro);
    const guardada = await guardarResultado(conn, apuesta, juego, resultado, usuarioId);
    saldo = guardada.saldo ?? saldo;
    await bitacora.registrar(conn, {
      usuarioId, accion: 'apuesta', entidad: 'apuesta', entidadId: apuesta.id,
      detalle: { juego: juego.nombre, monto, estado: guardada.estado, pago: guardada.pago }, ip,
    });
    return formatear(guardada, juego, saldo);
  });
}

/** Endpoint 20: siguiente jugada de una partida en curso (pedir, plantarse, cambiar, tiro). */
export async function jugar({ usuarioId, apuestaId, accion, datos, ip }) {
  return transaccion(async (conn) => {
    const [[fila]] = await conn.query(
      `SELECT a.id, a.usuario_id, a.monto, a.estado, a.multiplicador, a.pago, a.estado_juego,
              j.id AS juegoId, j.tipo, j.nombre
         FROM apuestas a JOIN juegos j ON j.id = a.juego_id WHERE a.id = ? FOR UPDATE`,
      [apuestaId],
    );
    if (!fila || fila.usuario_id !== usuarioId) throw noEncontrado('Partida no encontrada');
    const juego = { id: fila.juegoId, tipo: fila.tipo, nombre: fila.nombre };
    if (fila.estado !== 'en_curso') throw conflicto('La partida ya terminó');
    const logica = obtenerJuego(juego.tipo);
    if (!logica.ACCIONES.includes(accion)) {
      throw solicitudInvalida(`Acción no válida para ${juego.nombre}. Acciones: ${logica.ACCIONES.join(', ') || 'ninguna'}`);
    }
    let resultado;
    try {
      resultado = logica.accion(fila.estado_juego, accion, datos, azarSeguro);
    } catch (err) {
      throw solicitudInvalida(err.message);
    }
    const guardada = await guardarResultado(conn, fila, juego, resultado, usuarioId);
    if (resultado.terminado) {
      await bitacora.registrar(conn, {
        usuarioId, accion: 'apuesta_resuelta', entidad: 'apuesta', entidadId: fila.id,
        detalle: { juego: juego.nombre, estado: guardada.estado, pago: guardada.pago }, ip,
      });
    }
    return formatear(guardada, juego, guardada.saldo ?? (await saldoActual(conn, usuarioId)));
  });
}

const COLUMNAS_ORDEN = { creadoEn: 'a.creado_en', monto: 'a.monto', pago: 'a.pago', juego: 'j.nombre' };

/** Endpoint 21: historial. El jugador ve las suyas; el administrador, todas. */
export async function listar(query, usuario) {
  const pag = leerPaginacion(query);
  const condiciones = [];
  const valores = [];
  if (usuario.rol !== 'admin') { condiciones.push('a.usuario_id = ?'); valores.push(usuario.id); }
  else if (query.usuarioId) { condiciones.push('a.usuario_id = ?'); valores.push(Number(query.usuarioId)); }
  if (query.juegoId) { condiciones.push('a.juego_id = ?'); valores.push(Number(query.juegoId)); }
  if (query.estado) { condiciones.push('a.estado = ?'); valores.push(query.estado); }
  if (query.q && usuario.rol === 'admin') { condiciones.push('(u.nombre LIKE ? OR u.correo LIKE ?)'); valores.push(`%${query.q}%`, `%${query.q}%`); }
  const [desde, hasta] = rangoFechas(query.desde, query.hasta);
  if (desde) { condiciones.push('a.creado_en >= ?'); valores.push(desde); }
  if (hasta) { condiciones.push('a.creado_en <= ?'); valores.push(hasta); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const desdeTablas = 'FROM apuestas a JOIN juegos j ON j.id = a.juego_id JOIN usuarios u ON u.id = a.usuario_id';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${desdeTablas} ${where}`, valores);
  const [datos] = await pool.query(
    `SELECT a.id, a.monto, a.multiplicador, a.pago, a.estado, a.creado_en AS creadoEn, a.resuelto_en AS resueltoEn,
            j.id AS juegoId, j.nombre AS juego, j.tipo, u.id AS usuarioId, u.nombre AS usuario
       ${desdeTablas} ${where} ORDER BY ${leerOrden(query, COLUMNAS_ORDEN, 'creadoEn')}, a.id DESC LIMIT ? OFFSET ?`,
    [...valores, pag.limite, pag.offset],
  );
  return respuestaPaginada(datos, total, pag);
}
