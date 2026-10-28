import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.password,
  database: env.db.nombre,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
  charset: 'utf8mb4',
  // BOOLEAN (TINYINT(1)) se devuelve como true/false
  typeCast(campo, siguiente) {
    if (campo.type === 'TINY' && campo.length === 1) {
      const valor = campo.string();
      return valor === null ? null : valor === '1';
    }
    return siguiente();
  },
});

/**
 * Ejecuta fn dentro de una transacción. Si fn lanza un error se hace ROLLBACK
 * y ningún cambio queda guardado (operación transaccional).
 */
export async function transaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
