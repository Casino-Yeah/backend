// Genera db/seed.sql con datos de prueba coherentes:
// 2 administradores, 20 jugadores, 4 juegos, 200 apuestas, sus movimientos y la bitácora.
// Las fechas son relativas a NOW() para que el dashboard siempre muestre datos recientes.
// Uso: npm run seed:generate   (escribe ../database/seed.sql)
import bcrypt from 'bcryptjs';
import { azarConSemilla } from '../src/games/azar.js';
import * as blackjack from '../src/games/blackjack.js';
import * as poker from '../src/games/poker.js';
import * as ruleta from '../src/games/ruleta.js';
import { MULTIPLICADORES } from '../shared/billar.js';

const PASSWORD = 'Casino123';
const azar = azarConSemilla(2026);
const r = (min, max) => min + azar.entero(max - min + 1);
const elegir = (lista) => lista[azar.entero(lista.length)];
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
const hace = (min) => `NOW() - INTERVAL ${min} MINUTE`;
const r2 = (n) => Math.round(n * 100) / 100;

const hash = bcrypt.hashSync(PASSWORD, 10);

const juegos = [
  { id: 1, slug: 'blackjack', tipo: 'blackjack', nombre: 'Blackjack', descripcion: 'Acércate a 21 sin pasarte y vence al crupier. Blackjack natural paga 3 a 2.', min: 10, max: 1000 },
  { id: 2, slug: 'poker', tipo: 'poker', nombre: 'Video Póker', descripcion: 'Jacks or Better: conserva cartas, cambia las demás y forma la mejor mano.', min: 5, max: 500 },
  { id: 3, slug: 'ruleta', tipo: 'ruleta', nombre: 'Ruleta de la suerte', descripcion: 'Gira la rueda y multiplica tu apuesta hasta 5 veces.', min: 10, max: 2000 },
  { id: 4, slug: 'billar', tipo: 'billar', nombre: 'Billar 2D', descripcion: 'Tienes 5 tiros: entre más bolas metas, mayor el premio (hasta x5).', min: 20, max: 1000 },
];

const nombres = [
  'Sofía Hernández', 'Diego Ramírez', 'Valentina Cruz', 'Mateo Torres', 'Camila Flores', 'Santiago Morales',
  'Regina Vargas', 'Emiliano Castillo', 'Ximena Ortiz', 'Leonardo Jiménez', 'Renata Ruiz', 'Sebastián Mendoza',
  'Fernanda Aguilar', 'Daniel Reyes', 'Mariana Gutiérrez', 'Alejandro Navarro', 'Paola Domínguez', 'Iván Salazar',
  'Andrea Ríos', 'Jorge Medina',
];
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const usuarios = [
  { id: 1, rol: 1, nombre: 'Administrador General', correo: 'admin@casino.test', nacimiento: '1990-01-15', activo: 1, alta: 60 * 24 * 60 },
  { id: 2, rol: 1, nombre: 'Supervisor de Juegos', correo: 'supervisor@casino.test', nacimiento: '1988-07-02', activo: 1, alta: 60 * 24 * 59 },
];
nombres.forEach((nombre, i) => {
  const [n, a] = sinAcentos(nombre).split(' ');
  usuarios.push({
    id: i + 3, rol: 2, nombre, correo: `${n}.${a}@correo.test`,
    nacimiento: `${r(1970, 2005)}-${String(r(1, 12)).padStart(2, '0')}-${String(r(1, 28)).padStart(2, '0')}`,
    activo: i === 19 ? 0 : 1, // un jugador desactivado para probar filtros y RN-05
    alta: r(45, 58) * 24 * 60, // minutos atrás
  });
});
const jugadores = usuarios.filter((u) => u.rol === 2);

// Resultado realista de cada juego usando la misma lógica del servidor
function multiplicadorDe(tipo) {
  if (tipo === 'ruleta') return ruleta.iniciar(azar).multiplicador;
  if (tipo === 'blackjack') {
    let p = blackjack.iniciar(azar);
    while (!p.terminado) p = blackjack.accion(p.estado, blackjack.valorMano(p.estado.jugador) < 17 ? 'pedir' : 'plantarse');
    return p.multiplicador;
  }
  if (tipo === 'poker') {
    const p = poker.iniciar(azar);
    const conteo = {};
    p.estado.mano.forEach((c) => { conteo[c.v] = (conteo[c.v] || 0) + 1; });
    const conservar = p.estado.mano.map((c, i) => (conteo[c.v] > 1 || c.v >= 11 ? i : -1)).filter((i) => i >= 0);
    return poker.accion(p.estado, 'cambiar', { conservar }).multiplicador;
  }
  return elegir([0, 0, 0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 2, 3, MULTIPLICADORES[6]]); // billar
}

// 200 apuestas repartidas entre jugadores activos, de los últimos 40 días
const activos = jugadores.filter((j) => j.activo);
const apuestasPlan = [];
for (let i = 0; i < 200; i++) {
  const jugador = elegir([...activos, ...activos.slice(0, 6)]); // algunos juegan más
  const juego = elegir([juegos[0], juegos[0], juegos[1], juegos[2], juegos[2], juegos[3]]);
  const minutos = r(60, Math.min(jugador.alta - 120, 40 * 24 * 60));
  const pasos = [juego.min, juego.min * 2, juego.min * 5, 50, 100, 200];
  const monto = Math.min(juego.max, elegir(pasos));
  apuestasPlan.push({ jugador, juego, minutos, monto });
}
apuestasPlan.sort((a, b) => b.minutos - a.minutos); // de la más antigua a la más reciente

const sql = [];
sql.push('-- =============================================================');
sql.push('-- Casino Online - Datos de prueba (generado por backend/scripts/generate-seed.js)');
sql.push(`-- Contraseña de TODOS los usuarios: ${PASSWORD}`);
sql.push('-- Administradores: admin@casino.test, supervisor@casino.test');
sql.push('-- Jugadores: sofia.hernandez@correo.test, diego.ramirez@correo.test, ... (20)');
sql.push('-- =============================================================');
sql.push('SET NAMES utf8mb4;', '');

sql.push('INSERT INTO usuarios (id, rol_id, nombre, correo, password_hash, fecha_nacimiento, activo, creado_en) VALUES');
sql.push(usuarios.map((u) => `  (${u.id}, ${u.rol}, '${esc(u.nombre)}', '${u.correo}', '${hash}', '${u.nacimiento}', ${u.activo}, ${hace(u.alta)})`).join(',\n') + ';', '');

sql.push('INSERT INTO juegos (id, slug, tipo, nombre, descripcion, apuesta_min, apuesta_max, activo) VALUES');
sql.push(juegos.map((j) => `  (${j.id}, '${j.slug}', '${j.tipo}', '${esc(j.nombre)}', '${esc(j.descripcion)}', ${j.min}, ${j.max}, 1)`).join(',\n') + ';', '');

// Billeteras: id de billetera = posición del jugador
const billetera = new Map(jugadores.map((j, i) => [j.id, { id: i + 1, saldo: 0 }]));
const movimientos = [];
const apuestas = [];
const bitacora = [];
const ip = () => `192.168.1.${r(10, 250)}`;

for (const j of jugadores) {
  const b = billetera.get(j.id);
  b.saldo = 1000;
  movimientos.push({ b: b.id, tipo: 5, monto: 1000, saldo: 1000, apuesta: 'NULL', desc: 'Bono de bienvenida', min: j.alta });
  bitacora.push({ u: j.id, accion: 'registro', entidad: 'usuario', eid: j.id, detalle: null, min: j.alta });
  if (r(0, 2) > 0) {
    const monto = elegir([500, 1000, 2000]);
    b.saldo += monto;
    movimientos.push({ b: b.id, tipo: 1, monto, saldo: b.saldo, apuesta: 'NULL', desc: 'Recarga de créditos', min: j.alta - 30 });
    bitacora.push({ u: j.id, accion: 'recarga', entidad: 'billetera', eid: null, detalle: { monto }, min: j.alta - 30 });
  }
}

// Recargas voluntarias en los últimos 40 días para que el dashboard muestre actividad
for (let i = 0; i < 35; i++) {
  const jugador = elegir(activos);
  apuestasPlan.push({ jugador, recarga: elegir([200, 500, 1000, 2000]), minutos: r(90, 40 * 24 * 60) });
}
apuestasPlan.sort((a, b) => b.minutos - a.minutos);

let siguienteApuesta = 0;
apuestasPlan.forEach((p) => {
  if (p.recarga) {
    const b = billetera.get(p.jugador.id);
    b.saldo = r2(b.saldo + p.recarga);
    movimientos.push({ b: b.id, tipo: 1, monto: p.recarga, saldo: b.saldo, apuesta: 'NULL', desc: 'Recarga de créditos', min: p.minutos });
    bitacora.push({ u: p.jugador.id, accion: 'recarga', entidad: 'billetera', eid: null, detalle: { monto: p.recarga }, min: p.minutos });
    return;
  }
  siguienteApuesta += 1;
  const id = siguienteApuesta;
  const b = billetera.get(p.jugador.id);
  if (b.saldo < p.monto) { // recarga antes de apostar para que el saldo nunca sea negativo (RN-03)
    const monto = elegir([500, 1000, 2000, 5000]);
    b.saldo = r2(b.saldo + monto);
    movimientos.push({ b: b.id, tipo: 1, monto, saldo: b.saldo, apuesta: 'NULL', desc: 'Recarga de créditos', min: p.minutos + 5 });
    bitacora.push({ u: p.jugador.id, accion: 'recarga', entidad: 'billetera', eid: null, detalle: { monto }, min: p.minutos + 5 });
  }
  const mult = multiplicadorDe(p.juego.tipo);
  const pago = r2(p.monto * mult);
  const estado = mult > 1 ? 'ganada' : mult === 1 ? 'empate' : 'perdida';
  b.saldo = r2(b.saldo - p.monto);
  movimientos.push({ b: b.id, tipo: 2, monto: -p.monto, saldo: b.saldo, apuesta: id, desc: `Apuesta en ${p.juego.nombre}`, min: p.minutos });
  if (pago > 0) {
    b.saldo = r2(b.saldo + pago);
    movimientos.push({ b: b.id, tipo: 3, monto: pago, saldo: b.saldo, apuesta: id, desc: `Premio en ${p.juego.nombre}`, min: p.minutos - 1 });
  }
  apuestas.push(`  (${id}, ${p.jugador.id}, ${p.juego.id}, ${p.monto}, ${mult}, ${pago}, '${estado}', ${hace(p.minutos)}, ${hace(p.minutos - 1)})`);
  bitacora.push({ u: p.jugador.id, accion: 'apuesta', entidad: 'apuesta', eid: id, detalle: { juego: p.juego.nombre, monto: p.monto, estado, pago }, min: p.minutos });
});

// Ajuste del administrador como ejemplo de RN-07
const ajustado = billetera.get(activos[0].id);
ajustado.saldo = r2(ajustado.saldo + 250);
movimientos.push({ b: ajustado.id, tipo: 4, monto: 250, saldo: ajustado.saldo, apuesta: 'NULL', desc: 'Compensación por falla de conexión', min: 30, admin: 1 });
bitacora.push({ u: 1, accion: 'ajuste_saldo', entidad: 'usuario', eid: activos[0].id, detalle: { monto: 250, motivo: 'Compensación por falla de conexión' }, min: 30 });

sql.push('INSERT INTO billeteras (id, usuario_id, saldo) VALUES');
sql.push(jugadores.map((j) => `  (${billetera.get(j.id).id}, ${j.id}, ${billetera.get(j.id).saldo})`).join(',\n') + ';', '');

sql.push('INSERT INTO apuestas (id, usuario_id, juego_id, monto, multiplicador, pago, estado, creado_en, resuelto_en) VALUES');
sql.push(apuestas.join(',\n') + ';', '');

sql.push('INSERT INTO movimientos (billetera_id, tipo_id, monto, saldo_resultante, apuesta_id, descripcion, creado_por, creado_en) VALUES');
sql.push(movimientos.map((m) => `  (${m.b}, ${m.tipo}, ${m.monto}, ${m.saldo}, ${m.apuesta}, '${esc(m.desc)}', ${m.admin ?? 'NULL'}, ${hace(m.min)})`).join(',\n') + ';', '');

bitacora.sort((a, b) => b.min - a.min);
sql.push('INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle, ip, creado_en) VALUES');
sql.push(bitacora.map((e) => `  (${e.u}, '${e.accion}', '${e.entidad}', ${e.eid ?? 'NULL'}, ${e.detalle ? `'${esc(JSON.stringify(e.detalle))}'` : 'NULL'}, '${ip()}', ${hace(e.min)})`).join(',\n') + ';');

process.stdout.write(sql.join('\n') + '\n');
