import { pool } from '../config/db.js';
import { leerPaginacion, respuestaPaginada, rangoFechas } from '../utils/paginacion.js';

/** Registra una acción. conn permite hacerlo dentro de una transacción. */
export async function registrar(conn, { usuarioId = null, accion, entidad, entidadId = null, detalle = null, ip = null }) {
  await (conn ?? pool).query(
    'INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [usuarioId, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null, ip],
  );
}

export async function listar(query) {
  const pag = leerPaginacion(query);
  const condiciones = [];
  const valores = [];
  if (query.accion) { condiciones.push('b.accion = ?'); valores.push(query.accion); }
  if (query.entidad) { condiciones.push('b.entidad = ?'); valores.push(query.entidad); }
  if (query.usuarioId) { condiciones.push('b.usuario_id = ?'); valores.push(Number(query.usuarioId)); }
  if (query.q) { condiciones.push('(u.nombre LIKE ? OR u.correo LIKE ?)'); valores.push(`%${query.q}%`, `%${query.q}%`); }
  const [desde, hasta] = rangoFechas(query.desde, query.hasta);
  if (desde) { condiciones.push('b.creado_en >= ?'); valores.push(desde); }
  if (hasta) { condiciones.push('b.creado_en <= ?'); valores.push(hasta); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id ${where}`, valores,
  );
  const [datos] = await pool.query(
    `SELECT b.id, b.accion, b.entidad, b.entidad_id AS entidadId, b.detalle, b.ip, b.creado_en AS creadoEn,
            b.usuario_id AS usuarioId, u.nombre AS usuarioNombre, u.correo AS usuarioCorreo
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
       ${where} ORDER BY b.creado_en ${dir}, b.id ${dir} LIMIT ? OFFSET ?`,
    [...valores, pag.limite, pag.offset],
  );
  return respuestaPaginada(datos, total, pag);
}
