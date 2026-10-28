import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';

// Los scripts SQL viven en el repositorio "database" (carpeta vecina) o en DB_SQL_DIR dentro de Docker
const DIR_SQL = process.env.DB_SQL_DIR ?? fileURLToPath(new URL('../../../database/', import.meta.url));
const leer = (archivo) => readFileSync(path.join(DIR_SQL, archivo), 'utf8');

/** Borra y vuelve a cargar schema.sql + seed.sql en casino_test */
export async function reiniciarBD() {
  const conn = await mysql.createConnection({
    host: env.db.host, port: env.db.puerto, user: env.db.usuario, password: env.db.password,
    database: env.db.nombre, multipleStatements: true,
  });
  await conn.query(leer('schema.sql'));
  await conn.query(leer('seed.sql'));
  await conn.end();
}

export const api = () => request(app);

export async function token(correo, password = 'Casino123') {
  const res = await api().post('/api/auth/login').send({ correo, password });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${correo}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

let contador = 0;
/** Registra un jugador nuevo (saldo inicial 1000) y devuelve { token, usuario } */
export async function nuevoJugador() {
  contador += 1;
  const res = await api().post('/api/auth/registro').send({
    nombre: `Jugador Prueba ${contador}`,
    correo: `prueba${contador}.${Date.now()}@correo.test`,
    password: 'Prueba123',
    fechaNacimiento: '2000-01-01',
  });
  if (res.status !== 201) throw new Error(`Registro falló: ${JSON.stringify(res.body)}`);
  return res.body;
}
