import { pool, transaccion } from '../config/db.js';
import { ROLES, REGLAS, edad } from '../config/reglas.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../utils/errores.js';
import { leerOrden, leerPaginacion, respuestaPaginada } from '../utils/paginacion.js';
import { cifrar } from './auth.service.js';
import * as bitacora from './bitacora.service.js';

const COLUMNAS_ORDEN = { nombre: 'u.nombre', correo: 'u.correo', creadoEn: 'u.creado_en', saldo: 'b.saldo', id: 'u.id' };
const SELECT_USUARIO = `
  SELECT u.id, u.nombre, u.correo, u.fecha_nacimiento AS fechaNacimiento, u.activo,
         u.creado_en AS creadoEn, u.actualizado_en AS actualizadoEn, r.nombre AS rol, b.saldo
    FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN billeteras b ON b.usuario_id = u.id`;

export async function listar(query) {
  const pag = leerPaginacion(query);
  const condiciones = [];
  const valores = [];
  if (query.q) { condiciones.push('(u.nombre LIKE ? OR u.correo LIKE ?)'); valores.push(`%${query.q}%`, `%${query.q}%`); }
  if (query.rol) { condiciones.push('r.nombre = ?'); valores.push(query.rol); }
  if (query.activo !== undefined && query.activo !== '') { condiciones.push('u.activo = ?'); valores.push(query.activo === 'true' || query.activo === true); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const orden = leerOrden(query, COLUMNAS_ORDEN, 'creadoEn');
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id ${where}`, valores,
  );
  const [datos] = await pool.query(`${SELECT_USUARIO} ${where} ORDER BY ${orden}, u.id DESC LIMIT ? OFFSET ?`, [...valores, pag.limite, pag.offset]);
  return respuestaPaginada(datos, total, pag);
}

export async function obtener(id) {
  const [filas] = await pool.query(`${SELECT_USUARIO} WHERE u.id = ?`, [id]);
  if (!filas[0]) throw noEncontrado('Usuario no encontrado');
  const [[estadisticas]] = await pool.query(
    `SELECT COUNT(*) AS apuestas, COALESCE(SUM(monto), 0) AS totalApostado, COALESCE(SUM(pago), 0) AS totalPagado
       FROM apuestas WHERE usuario_id = ? AND estado <> 'en_curso'`,
    [id],
  );
  return { ...filas[0], estadisticas };
}

async function correoLibre(correo, exceptoId = 0) {
  const [filas] = await pool.query('SELECT id FROM usuarios WHERE correo = ? AND id <> ?', [correo, exceptoId]);
  if (filas.length) throw conflicto('El correo ya está registrado');
}

export async function crear(datos, adminId, ip) {
  if (edad(datos.fechaNacimiento) < REGLAS.EDAD_MINIMA) throw solicitudInvalida(`El usuario debe tener al menos ${REGLAS.EDAD_MINIMA} años`);
  await correoLibre(datos.correo);
  const hash = await cifrar(datos.password);
  const id = await transaccion(async (conn) => {
    const [res] = await conn.query(
      'INSERT INTO usuarios (rol_id, nombre, correo, password_hash, fecha_nacimiento, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [ROLES[datos.rol], datos.nombre, datos.correo, hash, datos.fechaNacimiento, datos.activo ?? true],
    );
    if (datos.rol === 'jugador') await conn.query('INSERT INTO billeteras (usuario_id, saldo) VALUES (?, 0)', [res.insertId]);
    await bitacora.registrar(conn, { usuarioId: adminId, accion: 'crear_usuario', entidad: 'usuario', entidadId: res.insertId, detalle: { correo: datos.correo, rol: datos.rol }, ip });
    return res.insertId;
  });
  return obtener(id);
}

export async function actualizar(id, datos, adminId, ip) {
  const actual = await obtener(id);
  if (id === adminId && (datos.activo === false || (datos.rol && datos.rol !== 'admin'))) {
    throw conflicto('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
  }
  if (datos.correo) await correoLibre(datos.correo, id);
  if (datos.fechaNacimiento && edad(datos.fechaNacimiento) < REGLAS.EDAD_MINIMA) {
    throw solicitudInvalida(`El usuario debe tener al menos ${REGLAS.EDAD_MINIMA} años`);
  }
  const campos = [];
  const valores = [];
  const asignar = (columna, valor) => { campos.push(`${columna} = ?`); valores.push(valor); };
  if (datos.nombre !== undefined) asignar('nombre', datos.nombre);
  if (datos.correo !== undefined) asignar('correo', datos.correo);
  if (datos.fechaNacimiento !== undefined) asignar('fecha_nacimiento', datos.fechaNacimiento);
  if (datos.activo !== undefined) asignar('activo', datos.activo);
  if (datos.rol !== undefined) asignar('rol_id', ROLES[datos.rol]);
  if (datos.password) asignar('password_hash', await cifrar(datos.password));
  if (!campos.length) throw solicitudInvalida('No se envió ningún campo para actualizar');

  await transaccion(async (conn) => {
    await conn.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, [...valores, id]);
    // un usuario que pasa a jugador necesita billetera
    if (datos.rol === 'jugador' && actual.saldo === null) {
      await conn.query('INSERT IGNORE INTO billeteras (usuario_id, saldo) VALUES (?, 0)', [id]);
    }
    const { password, ...cambios } = datos;
    await bitacora.registrar(conn, { usuarioId: adminId, accion: 'editar_usuario', entidad: 'usuario', entidadId: id, detalle: { ...cambios, ...(password ? { password: '***' } : {}) }, ip });
  });
  return obtener(id);
}

// Baja lógica: se desactiva para conservar su historial de apuestas y movimientos
export async function eliminar(id, adminId, ip) {
  if (id === adminId) throw conflicto('No puedes darte de baja a ti mismo');
  await obtener(id);
  await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = ?', [id]);
  await bitacora.registrar(null, { usuarioId: adminId, accion: 'baja_usuario', entidad: 'usuario', entidadId: id, ip });
}
