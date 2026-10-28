import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

async function esperarBaseDeDatos(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`Esperando a MySQL (${i}/${intentos}): ${err.code ?? err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('No se pudo conectar a MySQL');
}

await esperarBaseDeDatos();
app.listen(env.puerto, () => {
  console.log(`API del Casino en http://localhost:${env.puerto}/api  ·  Documentación: http://localhost:${env.puerto}/api/docs`);
});
