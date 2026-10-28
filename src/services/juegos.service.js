import { pool } from '../config/db.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../utils/errores.js';
import { leerOrden, leerPaginacion, respuestaPaginada } from '../utils/paginacion.js';
import * as bitacora from './bitacora.service.js';

const COLUMNAS_ORDEN = { nombre: 'j.nombre', apuestaMin: 'j.apuesta_min', apuestaMax: 'j.apuesta_max', creadoEn: 'j.creado_en', apuestas: 'apuestas' };
const SELECT_JUEGO = `
  SELECT j.id, j.slug, j.tipo, j.nombre, j.descripcion, j.apuesta_min AS apuestaMin, j.apuesta_max AS apuestaMax,
         j.activo, j.creado_en AS creadoEn,
         (SELECT COUNT(*) FROM apuestas a WHERE a.juego_id = j.id) AS apuestas
    FROM juegos j`;

export async function listar(query, esAdmin) {
  const pag = leerPaginacion(query);
  const condiciones = [];
  const valores = [];
  if (!esAdmin) condiciones.push('j.activo = TRUE'); // el jugador solo ve juegos activos
  if (query.q) { condiciones.push('(j.nombre LIKE ? OR j.descripcion LIKE ?)'); valores.push(`%${query.q}%`, `%${query.q}%`); }
  if (query.tipo) { condiciones.push('j.tipo = ?'); valores.push(query.tipo); }
  if (esAdmin && query.activo !== undefined && query.activo !== '') { condiciones.push('j.activo = ?'); valores.push(query.activo === 'true'); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const orden = leerOrden({ dir: 'asc', ...query }, COLUMNAS_ORDEN, 'nombre');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM juegos j ${where}`, valores);
  const [datos] = await pool.query(`${SELECT_JUEGO} ${where} ORDER BY ${orden}, j.id LIMIT ? OFFSET ?`, [...valores, pag.limite, pag.offset]);
  return respuestaPaginada(datos, total, pag);
}

export async function obtener(id, esAdmin = true) {
  const [filas] = await pool.query(`${SELECT_JUEGO} WHERE j.id = ?`, [id]);
  if (!filas[0] || (!esAdmin && !filas[0].activo)) throw noEncontrado('Juego no encontrado');
  return filas[0];
}

function validarLimites(min, max) {
  if (min !== undefined && max !== undefined && max < min) {
    throw solicitudInvalida('La apuesta máxima debe ser mayor o igual a la mínima', [{ campo: 'apuestaMax', mensaje: 'Menor que la mínima' }]);
  }
}

export async function crear(datos, adminId, ip) {
  validarLimites(datos.apuestaMin, datos.apuestaMax);
  const [dup] = await pool.query('SELECT id FROM juegos WHERE slug = ? OR nombre = ?', [datos.slug, datos.nombre]);
  if (dup.length) throw conflicto('Ya existe un juego con ese slug o nombre');
  const [res] = await pool.query(
    'INSERT INTO juegos (slug, tipo, nombre, descripcion, apuesta_min, apuesta_max, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [datos.slug, datos.tipo, datos.nombre, datos.descripcion ?? '', datos.apuestaMin, datos.apuestaMax, datos.activo ?? true],
  );
  await bitacora.registrar(null, { usuarioId: adminId, accion: 'crear_juego', entidad: 'juego', entidadId: res.insertId, detalle: datos, ip });
  return obtener(res.insertId);
}

export async function actualizar(id, datos, adminId, ip) {
  const actual = await obtener(id);
  validarLimites(datos.apuestaMin ?? actual.apuestaMin, datos.apuestaMax ?? actual.apuestaMax);
  if (datos.slug || datos.nombre) {
    const [dup] = await pool.query('SELECT id FROM juegos WHERE (slug = ? OR nombre = ?) AND id <> ?', [datos.slug ?? '', datos.nombre ?? '', id]);
    if (dup.length) throw conflicto('Ya existe un juego con ese slug o nombre');
  }
  const mapa = { slug: 'slug', tipo: 'tipo', nombre: 'nombre', descripcion: 'descripcion', apuestaMin: 'apuesta_min', apuestaMax: 'apuesta_max', activo: 'activo' };
  const campos = Object.keys(mapa).filter((k) => datos[k] !== undefined);
  if (!campos.length) throw solicitudInvalida('No se envió ningún campo para actualizar');
  await pool.query(
    `UPDATE juegos SET ${campos.map((k) => `${mapa[k]} = ?`).join(', ')} WHERE id = ?`,
    [...campos.map((k) => datos[k]), id],
  );
  await bitacora.registrar(null, { usuarioId: adminId, accion: 'editar_juego', entidad: 'juego', entidadId: id, detalle: datos, ip });
  return obtener(id);
}

// Solo se borra un juego sin apuestas; si ya tiene historial se debe desactivar
export async function eliminar(id, adminId, ip) {
  const juego = await obtener(id);
  if (juego.apuestas > 0) throw conflicto('El juego tiene apuestas registradas; desactívalo en lugar de borrarlo');
  await pool.query('DELETE FROM juegos WHERE id = ?', [id]);
  await bitacora.registrar(null, { usuarioId: adminId, accion: 'borrar_juego', entidad: 'juego', entidadId: id, detalle: { nombre: juego.nombre }, ip });
}
