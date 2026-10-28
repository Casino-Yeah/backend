import { pool } from '../config/db.js';
import { TIPOS_MOVIMIENTO, redondear2 } from '../config/reglas.js';
import { solicitudInvalida } from '../utils/errores.js';
import { rangoFechas } from '../utils/paginacion.js';

const hoyISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local
function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

function leerRango(query, diasPorDefecto = 29) {
  const desde = query.desde || haceDias(diasPorDefecto);
  const hasta = query.hasta || hoyISO();
  if (desde > hasta) throw solicitudInvalida('La fecha inicial no puede ser posterior a la final', [{ campo: 'desde', mensaje: 'Rango inválido' }]);
  return { desde, hasta, sql: rangoFechas(desde, hasta) };
}

function diasEntre(desde, hasta) {
  const dias = [];
  const d = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  while (d <= fin && dias.length < 400) {
    dias.push(d.toLocaleDateString('en-CA'));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

/** Endpoint 22: indicadores y series para las 2 gráficas del dashboard */
export async function dashboard(query) {
  const { desde, hasta, sql } = leerRango(query);
  const [[jugadores]] = await pool.query(
    `SELECT SUM(activo) AS activos, COUNT(*) AS total,
            SUM(creado_en BETWEEN ? AND ?) AS nuevos
       FROM usuarios WHERE rol_id = 2`, sql,
  );
  const [[apuestas]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS apostado, COALESCE(SUM(pago), 0) AS pagado,
            COUNT(DISTINCT usuario_id) AS jugadoresConApuestas
       FROM apuestas WHERE creado_en BETWEEN ? AND ?`, sql,
  );
  const [[recargas]] = await pool.query(
    'SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS cantidad FROM movimientos WHERE tipo_id = ? AND creado_en BETWEEN ? AND ?',
    [TIPOS_MOVIMIENTO.recarga, ...sql],
  );
  const [[circulacion]] = await pool.query('SELECT COALESCE(SUM(saldo), 0) AS total FROM billeteras');

  const [porDia] = await pool.query(
    `SELECT DATE_FORMAT(creado_en, '%Y-%m-%d') AS dia, COUNT(*) AS apuestas, SUM(monto) AS apostado, SUM(pago) AS pagado
       FROM apuestas WHERE creado_en BETWEEN ? AND ? GROUP BY dia ORDER BY dia`, sql,
  );
  const mapa = Object.fromEntries(porDia.map((f) => [f.dia, f]));
  const serieDiaria = diasEntre(desde, hasta).map((dia) => ({
    dia,
    apuestas: Number(mapa[dia]?.apuestas ?? 0),
    apostado: Number(mapa[dia]?.apostado ?? 0),
    pagado: Number(mapa[dia]?.pagado ?? 0),
  }));

  const [porJuego] = await pool.query(
    `SELECT j.id, j.nombre, j.tipo, COUNT(a.id) AS apuestas, COALESCE(SUM(a.monto), 0) AS apostado, COALESCE(SUM(a.pago), 0) AS pagado
       FROM juegos j LEFT JOIN apuestas a ON a.juego_id = j.id AND a.creado_en BETWEEN ? AND ?
      GROUP BY j.id ORDER BY apuestas DESC, j.nombre`, sql,
  );

  return {
    rango: { desde, hasta },
    indicadores: {
      jugadoresActivos: Number(jugadores.activos ?? 0),
      jugadoresTotales: Number(jugadores.total ?? 0),
      jugadoresNuevos: Number(jugadores.nuevos ?? 0),
      jugadoresConApuestas: Number(apuestas.jugadoresConApuestas),
      apuestas: Number(apuestas.cantidad),
      totalApostado: Number(apuestas.apostado),
      totalPagado: Number(apuestas.pagado),
      gananciaCasa: redondear2(apuestas.apostado - apuestas.pagado),
      recargas: Number(recargas.total),
      cantidadRecargas: Number(recargas.cantidad),
      creditosEnCirculacion: Number(circulacion.total),
    },
    serieDiaria,
    porJuego: porJuego.map((f) => ({ ...f, apuestas: Number(f.apuestas), ganancia: redondear2(f.apostado - f.pagado) })),
  };
}

/** Endpoint 23 - Reporte 1: actividad y rentabilidad por juego en un rango de fechas */
export async function apuestasPorJuego(query) {
  if (!query.desde || !query.hasta) {
    throw solicitudInvalida('Este reporte requiere un rango de fechas (desde y hasta)', [{ campo: 'desde', mensaje: 'Obligatorio' }]);
  }
  const { desde, hasta, sql } = leerRango(query);
  const [filas] = await pool.query(
    `SELECT j.id, j.nombre, j.tipo,
            COUNT(a.id) AS apuestas,
            COALESCE(SUM(a.estado = 'ganada'), 0) AS ganadas,
            COALESCE(SUM(a.estado = 'perdida'), 0) AS perdidas,
            COALESCE(SUM(a.estado = 'empate'), 0) AS empates,
            COUNT(DISTINCT a.usuario_id) AS jugadores,
            COALESCE(SUM(a.monto), 0) AS apostado,
            COALESCE(SUM(a.pago), 0) AS pagado
       FROM juegos j LEFT JOIN apuestas a ON a.juego_id = j.id AND a.creado_en BETWEEN ? AND ?
      GROUP BY j.id ORDER BY apostado DESC, j.nombre`, sql,
  );
  const datos = filas.map((f) => ({
    ...f,
    apuestas: Number(f.apuestas),
    ganadas: Number(f.ganadas),
    perdidas: Number(f.perdidas),
    empates: Number(f.empates),
    jugadores: Number(f.jugadores),
    gananciaCasa: redondear2(f.apostado - f.pagado),
    devolucion: f.apostado > 0 ? redondear2((f.pagado / f.apostado) * 100) : 0,
  }));
  const totales = datos.reduce((t, f) => ({
    apuestas: t.apuestas + f.apuestas,
    apostado: redondear2(t.apostado + f.apostado),
    pagado: redondear2(t.pagado + f.pagado),
    gananciaCasa: redondear2(t.gananciaCasa + f.gananciaCasa),
  }), { apuestas: 0, apostado: 0, pagado: 0, gananciaCasa: 0 });
  return { rango: { desde, hasta }, datos, totales };
}

const ORDEN_JUGADORES = { apostado: 'apostado', neto: 'neto', apuestas: 'apuestas', recargas: 'recargas', saldo: 'saldo', nombre: 'nombre' };

/** Endpoint 24 - Reporte 2: ranking de jugadores por actividad en un rango de fechas */
export async function jugadores(query) {
  const { desde, hasta, sql } = leerRango(query);
  const orden = ORDEN_JUGADORES[query.orden] ?? 'apostado';
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const limite = Math.min(100, Math.max(1, Number.parseInt(query.limite, 10) || 20));
  const [filas] = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.activo, b.saldo,
            COALESCE(ap.apuestas, 0) AS apuestas, COALESCE(ap.apostado, 0) AS apostado,
            COALESCE(ap.pagado, 0) AS pagado, COALESCE(ap.pagado, 0) - COALESCE(ap.apostado, 0) AS neto,
            COALESCE(re.recargas, 0) AS recargas, ap.juegoFavorito
       FROM usuarios u
       JOIN billeteras b ON b.usuario_id = u.id
       LEFT JOIN (
         SELECT a.usuario_id, COUNT(*) AS apuestas, SUM(a.monto) AS apostado, SUM(a.pago) AS pagado,
                (SELECT j.nombre FROM apuestas a2 JOIN juegos j ON j.id = a2.juego_id
                  WHERE a2.usuario_id = a.usuario_id AND a2.creado_en BETWEEN ? AND ?
                  GROUP BY j.id ORDER BY COUNT(*) DESC LIMIT 1) AS juegoFavorito
           FROM apuestas a WHERE a.creado_en BETWEEN ? AND ? GROUP BY a.usuario_id
       ) ap ON ap.usuario_id = u.id
       LEFT JOIN (
         SELECT b2.usuario_id, SUM(m.monto) AS recargas
           FROM movimientos m JOIN billeteras b2 ON b2.id = m.billetera_id
          WHERE m.tipo_id = ? AND m.creado_en BETWEEN ? AND ? GROUP BY b2.usuario_id
       ) re ON re.usuario_id = u.id
      WHERE u.rol_id = 2 AND (ap.apuestas IS NOT NULL OR re.recargas IS NOT NULL)
      ORDER BY ${orden} ${dir}, u.id LIMIT ?`,
    [...sql, ...sql, TIPOS_MOVIMIENTO.recarga, ...sql, limite],
  );
  return {
    rango: { desde, hasta },
    datos: filas.map((f) => ({ ...f, apuestas: Number(f.apuestas), neto: redondear2(f.neto) })),
  };
}
