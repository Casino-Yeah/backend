import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, transaccion } from '../config/db.js';
import { env } from '../config/env.js';
import { REGLAS, ROLES, edad } from '../config/reglas.js';
import { conflicto, noAutenticado, prohibido, solicitudInvalida, noEncontrado } from '../utils/errores.js';
import { aplicarMovimiento } from './billetera.service.js';
import * as bitacora from './bitacora.service.js';

const RONDAS_BCRYPT = 10;
export const cifrar = (password) => bcrypt.hash(password, RONDAS_BCRYPT);

const firmar = (usuario) => jwt.sign({ sub: usuario.id, rol: usuario.rol }, env.jwt.secreto, { expiresIn: env.jwt.expira });

export async function perfil(usuarioId) {
  const [filas] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.fecha_nacimiento AS fechaNacimiento, u.activo, u.creado_en AS creadoEn,
            r.nombre AS rol, b.saldo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN billeteras b ON b.usuario_id = u.id
      WHERE u.id = ?`,
    [usuarioId],
  );
  if (!filas[0]) throw noEncontrado('Usuario no encontrado');
  return filas[0];
}

// RN-01: solo mayores de 18 años, correo único; el jugador nuevo recibe un bono de bienvenida
export async function registrar({ nombre, correo, password, fechaNacimiento }, ip) {
  if (edad(fechaNacimiento) < REGLAS.EDAD_MINIMA) {
    throw solicitudInvalida(`Debes tener al menos ${REGLAS.EDAD_MINIMA} años para registrarte`, [
      { campo: 'fechaNacimiento', mensaje: 'Menor de edad' },
    ]);
  }
  const [existe] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
  if (existe.length) throw conflicto('El correo ya está registrado');
  const hash = await cifrar(password);
  const id = await transaccion(async (conn) => {
    const [res] = await conn.query(
      'INSERT INTO usuarios (rol_id, nombre, correo, password_hash, fecha_nacimiento) VALUES (?, ?, ?, ?, ?)',
      [ROLES.jugador, nombre, correo, hash, fechaNacimiento],
    );
    await conn.query('INSERT INTO billeteras (usuario_id, saldo) VALUES (?, 0)', [res.insertId]);
    await aplicarMovimiento(conn, { usuarioId: res.insertId, tipo: 'bono', monto: REGLAS.BONO_BIENVENIDA, descripcion: 'Bono de bienvenida' });
    await bitacora.registrar(conn, { usuarioId: res.insertId, accion: 'registro', entidad: 'usuario', entidadId: res.insertId, ip });
    return res.insertId;
  });
  const usuario = await perfil(id);
  return { token: firmar(usuario), usuario };
}

export async function iniciarSesion({ correo, password }, ip) {
  const [filas] = await pool.query(
    `SELECT u.id, u.password_hash AS hash, u.activo, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.correo = ?`,
    [correo],
  );
  const usuario = filas[0];
  const valido = usuario && (await bcrypt.compare(password, usuario.hash));
  if (!valido) {
    await bitacora.registrar(null, { usuarioId: usuario?.id ?? null, accion: 'login_fallido', entidad: 'usuario', detalle: { correo }, ip });
    throw noAutenticado('Correo o contraseña incorrectos');
  }
  if (!usuario.activo) throw prohibido('Tu cuenta está desactivada. Contacta al administrador');
  await bitacora.registrar(null, { usuarioId: usuario.id, accion: 'login', entidad: 'usuario', entidadId: usuario.id, ip });
  return { token: firmar(usuario), usuario: await perfil(usuario.id) };
}

export async function cambiarPassword(usuarioId, { actual, nueva }, ip) {
  const [[usuario]] = await pool.query('SELECT password_hash AS hash FROM usuarios WHERE id = ?', [usuarioId]);
  if (!(await bcrypt.compare(actual, usuario.hash))) throw solicitudInvalida('La contraseña actual no es correcta');
  await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await cifrar(nueva), usuarioId]);
  await bitacora.registrar(null, { usuarioId, accion: 'cambio_password', entidad: 'usuario', entidadId: usuarioId, ip });
}
