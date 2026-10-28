import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { noAutenticado, prohibido } from '../utils/errores.js';

export async function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) throw noAutenticado();
  let datos;
  try {
    datos = jwt.verify(token, env.jwt.secreto);
  } catch {
    throw noAutenticado('La sesión expiró o el token no es válido');
  }
  // Se consulta el usuario para que un bloqueo o cambio de rol aplique de inmediato
  const [filas] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`,
    [datos.sub],
  );
  const usuario = filas[0];
  if (!usuario) throw noAutenticado('El usuario ya no existe');
  if (!usuario.activo) throw prohibido('Tu cuenta está desactivada');
  req.usuario = usuario;
  next();
}

export const permitir = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.usuario?.rol)) throw prohibido(`Esta acción es solo para: ${roles.join(', ')}`);
  next();
};
