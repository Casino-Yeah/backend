import { pool, transaccion } from '../config/db.js';
import { REGLAS, TIPOS_MOVIMIENTO, redondear2 } from '../config/reglas.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../utils/errores.js';
import { leerPaginacion, respuestaPaginada, rangoFechas } from '../utils/paginacion.js';
import * as bitacora from './bitacora.service.js';

/**
 * Cambia el saldo de una billetera y registra el movimiento. Debe llamarse dentro
 * de una transacción: bloquea la fila (FOR UPDATE) para evitar dobles gastos.
 * RN-03: si el saldo quedaría negativo, lanza 409 y la transacción se revierte.
 */
export async function aplicarMovimiento(conn, { usuarioId, tipo, monto, apuestaId = null, descripcion = '', creadoPor = null }) {
  const [filas] = await conn.query('SELECT id, saldo FROM billeteras WHERE usuario_id = ? FOR UPDATE', [usuarioId]);
  const billetera = filas[0];
  if (!billetera) throw noEncontrado('El usuario no tiene billetera (solo los jugadores tienen billetera)');
  const saldo = redondear2(billetera.saldo + monto);
  if (saldo < 0) throw conflicto(`Saldo insuficiente: tienes ${billetera.saldo} créditos`);
  await conn.query('UPDATE billeteras SET saldo = ? WHERE id = ?', [saldo, billetera.id]);
  const [res] = await conn.query(
    `INSERT INTO movimientos (billetera_id, tipo_id, monto, saldo_resultante, apuesta_id, descripcion, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [billetera.id, TIPOS_MOVIMIENTO[tipo], redondear2(monto), saldo, apuestaId, descripcion, creadoPor],
  );
  return { saldo, movimientoId: res.insertId };
}

async function recargadoHoy(conn, usuarioId) {
  const [[{ total }]] = await conn.query(
    `SELECT COALESCE(SUM(m.monto), 0) AS total
       FROM movimientos m JOIN billeteras b ON b.id = m.billetera_id
      WHERE b.usuario_id = ? AND m.tipo_id = ? AND m.creado_en >= CURDATE()`,
    [usuarioId, TIPOS_MOVIMIENTO.recarga],
  );
  return Number(total);
}

export async function consultar(usuarioId) {
  const [filas] = await pool.query('SELECT saldo, actualizado_en AS actualizadoEn FROM billeteras WHERE usuario_id = ?', [usuarioId]);
  if (!filas[0]) throw noEncontrado('El usuario no tiene billetera');
  const hoy = await recargadoHoy(pool, usuarioId);
  return {
    ...filas[0],
    recargadoHoy: hoy,
    recargaDisponibleHoy: redondear2(Math.max(0, REGLAS.RECARGA_DIARIA_MAXIMA - hoy)),
    limites: { minima: REGLAS.RECARGA_MINIMA, maxima: REGLAS.RECARGA_MAXIMA, diaria: REGLAS.RECARGA_DIARIA_MAXIMA },
  };
}

// RN-04: recarga entre 100 y 5,000 créditos y máximo 20,000 al día
export async function recargar(usuarioId, monto, ip) {
  if (monto < REGLAS.RECARGA_MINIMA || monto > REGLAS.RECARGA_MAXIMA) {
    throw solicitudInvalida(`La recarga debe estar entre ${REGLAS.RECARGA_MINIMA} y ${REGLAS.RECARGA_MAXIMA} créditos`);
  }
  return transaccion(async (conn) => {
    // bloquear la billetera primero para que dos recargas simultáneas no rebasen el límite diario
    await conn.query('SELECT id FROM billeteras WHERE usuario_id = ? FOR UPDATE', [usuarioId]);
    const hoy = await recargadoHoy(conn, usuarioId);
    if (hoy + monto > REGLAS.RECARGA_DIARIA_MAXIMA) {
      throw conflicto(`Superas el límite diario de ${REGLAS.RECARGA_DIARIA_MAXIMA} créditos. Hoy puedes recargar ${REGLAS.RECARGA_DIARIA_MAXIMA - hoy} más`);
    }
    const r = await aplicarMovimiento(conn, { usuarioId, tipo: 'recarga', monto, descripcion: 'Recarga de créditos' });
    await bitacora.registrar(conn, { usuarioId, accion: 'recarga', entidad: 'billetera', entidadId: r.movimientoId, detalle: { monto, saldo: r.saldo }, ip });
    return r;
  });
}

// RN-07: solo el administrador ajusta saldos, con motivo, y nunca por debajo de 0
export async function ajustar({ usuarioId, monto, motivo, adminId, ip }) {
  if (monto === 0 || Math.abs(monto) > REGLAS.AJUSTE_MAXIMO) {
    throw solicitudInvalida(`El ajuste debe ser distinto de 0 y de máximo ${REGLAS.AJUSTE_MAXIMO} créditos`);
  }
  return transaccion(async (conn) => {
    const r = await aplicarMovimiento(conn, { usuarioId, tipo: 'ajuste', monto, descripcion: motivo, creadoPor: adminId });
    await bitacora.registrar(conn, { usuarioId: adminId, accion: 'ajuste_saldo', entidad: 'usuario', entidadId: usuarioId, detalle: { monto, motivo, saldo: r.saldo }, ip });
    return r;
  });
}

export async function movimientos(usuarioId, query) {
  const pag = leerPaginacion(query);
  const condiciones = ['b.usuario_id = ?'];
  const valores = [usuarioId];
  if (query.tipo) { condiciones.push('t.clave = ?'); valores.push(query.tipo); }
  const [desde, hasta] = rangoFechas(query.desde, query.hasta);
  if (desde) { condiciones.push('m.creado_en >= ?'); valores.push(desde); }
  if (hasta) { condiciones.push('m.creado_en <= ?'); valores.push(hasta); }
  const where = condiciones.join(' AND ');
  const desdeTabla = 'FROM movimientos m JOIN billeteras b ON b.id = m.billetera_id JOIN tipos_movimiento t ON t.id = m.tipo_id';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${desdeTabla} WHERE ${where}`, valores);
  const [datos] = await pool.query(
    `SELECT m.id, t.clave AS tipo, t.nombre AS tipoNombre, m.monto, m.saldo_resultante AS saldoResultante,
            m.apuesta_id AS apuestaId, m.descripcion, m.creado_en AS creadoEn
       ${desdeTabla} WHERE ${where} ORDER BY m.creado_en ${dir}, m.id ${dir} LIMIT ? OFFSET ?`,
    [...valores, pag.limite, pag.offset],
  );
  return respuestaPaginada(datos, total, pag);
}
