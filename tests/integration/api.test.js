import { jest } from '@jest/globals';
import { pool } from '../../src/config/db.js';
import { ganchosPrueba } from '../../src/services/apuestas.service.js';
import { reiniciarBD, api, token, nuevoJugador } from './bd.js';

let admin;
let jugador; // { token, usuario }
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await reiniciarBD();
  admin = await token('admin@casino.test');
  jugador = await nuevoJugador();
});
afterAll(() => pool.end());

describe('M1 Autenticación y RN-01', () => {
  test('registro de un mayor de edad: 201, rol jugador y bono de 1000', async () => {
    const { usuario, token: t } = await nuevoJugador();
    expect(t).toBeTruthy();
    expect(usuario.rol).toBe('jugador');
    expect(usuario.saldo).toBe(1000);
  });

  test('registro de un menor de 18 años: 400', async () => {
    const hoy = new Date();
    const fecha = `${hoy.getFullYear() - 17}-01-01`;
    const res = await api().post('/api/auth/registro').send({ nombre: 'Menor', correo: 'menor@correo.test', password: 'Prueba123', fechaNacimiento: fecha });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/18 años/);
  });

  test('correo duplicado: 409', async () => {
    const res = await api().post('/api/auth/registro').send({ nombre: 'Otra', correo: 'admin@casino.test', password: 'Prueba123', fechaNacimiento: '1990-01-01' });
    expect(res.status).toBe(409);
  });

  test('datos vacíos o inválidos: 400 con detalle por campo', async () => {
    const res = await api().post('/api/auth/registro').send({ correo: 'no-es-correo', password: '123' });
    expect(res.status).toBe(400);
    const campos = res.body.errores.map((e) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'correo', 'password', 'fechaNacimiento']));
  });

  test('contraseña incorrecta: 401', async () => {
    const res = await api().post('/api/auth/login').send({ correo: 'admin@casino.test', password: 'Equivocada1' });
    expect(res.status).toBe(401);
  });

  test('usuario desactivado no puede iniciar sesión: 403', async () => {
    const res = await api().post('/api/auth/login').send({ correo: 'jorge.medina@correo.test', password: 'Casino123' });
    expect(res.status).toBe(403);
  });

  test('las contraseñas se guardan cifradas con bcrypt', async () => {
    const [[u]] = await pool.query('SELECT password_hash FROM usuarios WHERE correo = ?', ['admin@casino.test']);
    expect(u.password_hash).toMatch(/^\$2[aby]\$10\$/);
  });

  test('sin token: 401; token inválido: 401', async () => {
    expect((await api().get('/api/auth/perfil')).status).toBe(401);
    expect((await api().get('/api/auth/perfil').set(auth('basura'))).status).toBe(401);
  });
});

describe('Permisos por rol (403)', () => {
  const rutasAdmin = [
    ['get', '/api/usuarios'], ['get', '/api/usuarios/1'], ['post', '/api/usuarios'], ['put', '/api/usuarios/1'],
    ['delete', '/api/usuarios/1'], ['post', '/api/juegos'], ['put', '/api/juegos/1'], ['delete', '/api/juegos/1'],
    ['post', '/api/usuarios/3/ajuste-saldo'], ['get', '/api/admin/dashboard'],
    ['get', '/api/reportes/apuestas-por-juego'], ['get', '/api/reportes/jugadores'], ['get', '/api/bitacora'],
  ];
  test.each(rutasAdmin)('jugador en %s %s → 403', async (metodo, ruta) => {
    const res = await api()[metodo](ruta).set(auth(jugador.token)).send({});
    expect(res.status).toBe(403);
  });
  test.each(rutasAdmin)('sin token en %s %s → 401', async (metodo, ruta) => {
    expect((await api()[metodo](ruta).send({})).status).toBe(401);
  });
  test('el administrador no puede apostar ni recargar (rutas de jugador): 403', async () => {
    expect((await api().post('/api/apuestas').set(auth(admin)).send({ juegoId: 1, monto: 10 })).status).toBe(403);
    expect((await api().post('/api/billetera/recargas').set(auth(admin)).send({ monto: 100 })).status).toBe(403);
  });
});

describe('M2 Usuarios: CRUD, búsqueda, filtros, orden y paginación', () => {
  test('búsqueda por nombre y filtro por rol', async () => {
    const res = await api().get('/api/usuarios?q=sofia&rol=jugador').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.datos).toHaveLength(1);
    expect(res.body.datos[0].correo).toBe('sofia.hernandez@correo.test');
  });

  test('paginación y orden', async () => {
    const res = await api().get('/api/usuarios?rol=jugador&limite=5&pagina=2&orden=nombre&dir=asc').set(auth(admin));
    expect(res.body.datos).toHaveLength(5);
    expect(res.body.paginacion).toMatchObject({ pagina: 2, limite: 5 });
    const nombres = res.body.datos.map((u) => u.nombre);
    expect([...nombres].sort((a, b) => a.localeCompare(b))).toEqual(nombres);
  });

  test('filtro de inactivos', async () => {
    const res = await api().get('/api/usuarios?activo=false').set(auth(admin));
    expect(res.body.datos.every((u) => u.activo === 0 || u.activo === false)).toBe(true);
  });

  test('crear, editar, consultar y dar de baja', async () => {
    const creado = await api().post('/api/usuarios').set(auth(admin)).send({
      nombre: 'Nuevo Jugador', correo: 'nuevo@correo.test', password: 'Prueba123', fechaNacimiento: '1999-03-03', rol: 'jugador',
    });
    expect(creado.status).toBe(201);
    expect(creado.body.saldo).toBe(0);
    const id = creado.body.id;
    const editado = await api().put(`/api/usuarios/${id}`).set(auth(admin)).send({ nombre: 'Nombre Editado' });
    expect(editado.body.nombre).toBe('Nombre Editado');
    expect((await api().delete(`/api/usuarios/${id}`).set(auth(admin))).status).toBe(204);
    const consulta = await api().get(`/api/usuarios/${id}`).set(auth(admin));
    expect(Boolean(consulta.body.activo)).toBe(false);
  });

  test('id inexistente: 404; id inválido: 400', async () => {
    expect((await api().get('/api/usuarios/99999').set(auth(admin))).status).toBe(404);
    expect((await api().get('/api/usuarios/abc').set(auth(admin))).status).toBe(400);
  });

  test('el administrador no puede darse de baja a sí mismo: 409', async () => {
    expect((await api().delete('/api/usuarios/1').set(auth(admin))).status).toBe(409);
  });
});

describe('M3 Juegos', () => {
  let juegoId;
  test('crear variante, validar límites, editar y borrar', async () => {
    const malo = await api().post('/api/juegos').set(auth(admin)).send({ slug: 'bj-vip', tipo: 'blackjack', nombre: 'Blackjack VIP', apuestaMin: 500, apuestaMax: 100 });
    expect(malo.status).toBe(400);
    const res = await api().post('/api/juegos').set(auth(admin)).send({ slug: 'bj-vip', tipo: 'blackjack', nombre: 'Blackjack VIP', apuestaMin: 100, apuestaMax: 500 });
    expect(res.status).toBe(201);
    juegoId = res.body.id;
    const editado = await api().put(`/api/juegos/${juegoId}`).set(auth(admin)).send({ activo: false });
    expect(Boolean(editado.body.activo)).toBe(false);
  });

  test('el jugador no ve juegos inactivos', async () => {
    const res = await api().get('/api/juegos?limite=50').set(auth(jugador.token));
    expect(res.body.datos.some((j) => j.id === juegoId)).toBe(false);
    expect((await api().get(`/api/juegos/${juegoId}`).set(auth(jugador.token))).status).toBe(404);
  });

  test('RN-05: no se puede apostar en un juego inactivo: 409', async () => {
    const res = await api().post('/api/apuestas').set(auth(jugador.token)).send({ juegoId, monto: 100 });
    expect(res.status).toBe(409);
  });

  test('no se borra un juego con apuestas: 409; sin apuestas: 204', async () => {
    expect((await api().delete('/api/juegos/1').set(auth(admin))).status).toBe(409);
    expect((await api().delete(`/api/juegos/${juegoId}`).set(auth(admin))).status).toBe(204);
  });
});

describe('M4 Billetera, RN-04 y RN-07', () => {
  test('recarga válida suma al saldo y queda en movimientos', async () => {
    const { token: t } = await nuevoJugador();
    const res = await api().post('/api/billetera/recargas').set(auth(t)).send({ monto: 500 });
    expect(res.status).toBe(201);
    expect(res.body.saldo).toBe(1500);
    const movs = await api().get('/api/billetera/movimientos?tipo=recarga').set(auth(t));
    expect(movs.body.datos).toHaveLength(1);
    expect(movs.body.datos[0].monto).toBe(500);
  });

  test('RN-04: recarga menor a 100 o negativa: 400', async () => {
    expect((await api().post('/api/billetera/recargas').set(auth(jugador.token)).send({ monto: 50 })).status).toBe(400);
    expect((await api().post('/api/billetera/recargas').set(auth(jugador.token)).send({ monto: -100 })).status).toBe(400);
  });

  test('RN-04: no se rebasan 20,000 créditos de recarga al día: 409', async () => {
    const { token: t } = await nuevoJugador();
    for (let i = 0; i < 4; i++) {
      expect((await api().post('/api/billetera/recargas').set(auth(t)).send({ monto: 5000 })).status).toBe(201);
    }
    const res = await api().post('/api/billetera/recargas').set(auth(t)).send({ monto: 100 });
    expect(res.status).toBe(409);
  });

  test('RN-07: ajuste del administrador con motivo', async () => {
    const res = await api().post(`/api/usuarios/${jugador.usuario.id}/ajuste-saldo`).set(auth(admin)).send({ monto: 100, motivo: 'Bono por torneo' });
    expect(res.status).toBe(200);
    const [[b]] = await pool.query('SELECT saldo FROM billeteras WHERE usuario_id = ?', [jugador.usuario.id]);
    expect(b.saldo).toBe(res.body.saldo);
    const [[log]] = await pool.query("SELECT COUNT(*) AS n FROM bitacora WHERE accion = 'ajuste_saldo' AND entidad_id = ?", [jugador.usuario.id]);
    expect(log.n).toBe(1);
  });

  test('RN-07: sin motivo 400; si deja el saldo negativo 409', async () => {
    const url = `/api/usuarios/${jugador.usuario.id}/ajuste-saldo`;
    expect((await api().post(url).set(auth(admin)).send({ monto: 100 })).status).toBe(400);
    expect((await api().post(url).set(auth(admin)).send({ monto: -99999, motivo: 'Descuento enorme' })).status).toBe(409);
  });
});

describe('M5 Apuestas: RN-02, RN-03, RN-05, RN-06', () => {
  test('RN-02: apuesta fuera de los límites del juego: 400', async () => {
    const res = await api().post('/api/apuestas').set(auth(jugador.token)).send({ juegoId: 1, monto: 5 }); // mínimo 10
    expect(res.status).toBe(400);
  });

  test('RN-03: no se puede apostar más que el saldo: 409 y el saldo no cambia', async () => {
    const { token: t } = await nuevoJugador(); // saldo 1000
    const res = await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 3, monto: 1500 }); // ruleta max 2000
    expect(res.status).toBe(409);
    expect((await api().get('/api/billetera').set(auth(t))).body.saldo).toBe(1000);
  });

  test('RN-06: la ruleta paga monto x multiplicador y el saldo cuadra', async () => {
    const { token: t } = await nuevoJugador();
    const res = await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 3, monto: 100 });
    expect(res.status).toBe(201);
    expect(res.body.estado).not.toBe('en_curso');
    expect(res.body.pago).toBeCloseTo(100 * res.body.multiplicador);
    expect(res.body.saldo).toBeCloseTo(1000 - 100 + res.body.pago);
    expect(res.body.vista.segmentos).toBeDefined();
  });

  test('Blackjack: partida completa y RN-05 (una partida en curso por juego)', async () => {
    const { token: t } = await nuevoJugador();
    let p = (await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 1, monto: 50 })).body;
    if (p.estado === 'en_curso') {
      expect(p.vista.crupier[1]).toBeNull(); // la carta oculta no se envía
      const segunda = await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 1, monto: 50 });
      expect(segunda.status).toBe(409);
      expect(segunda.body.partida.id).toBe(p.id);
      p = (await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'plantarse' })).body;
    }
    expect(['ganada', 'perdida', 'empate']).toContain(p.estado);
    const otra = await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'pedir' });
    expect(otra.status).toBe(409); // ya terminó
  });

  test('Póker: cambio de cartas y pago según la tabla', async () => {
    const { token: t } = await nuevoJugador();
    const p = (await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 2, monto: 10 })).body;
    expect(p.vista.mano).toHaveLength(5);
    const malo = await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'cambiar', conservar: [7] });
    expect(malo.status).toBe(400);
    const fin = (await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'cambiar', conservar: [0, 1] })).body;
    expect(fin.vista.mano[0]).toEqual(p.vista.mano[0]);
    expect(fin.pago).toBeCloseTo(10 * fin.multiplicador);
  });

  test('Billar: 5 tiros validados por el servidor', async () => {
    const { token: t } = await nuevoJugador();
    let p = (await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 4, monto: 20 })).body;
    expect(p.vista.tirosRestantes).toBe(5);
    const invalido = await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'tiro', angulo: 0, potencia: 9 });
    expect(invalido.status).toBe(400);
    for (let i = 0; i < 5; i++) {
      p = (await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(t)).send({ accion: 'tiro', angulo: 0.02 * i, potencia: 0.9 })).body;
    }
    expect(p.estado).not.toBe('en_curso');
    expect(p.vista.tiros).toBe(5);
  });

  test('un jugador no puede jugar la partida de otro: 404', async () => {
    const a = await nuevoJugador();
    const b = await nuevoJugador();
    const p = (await api().post('/api/apuestas').set(auth(a.token)).send({ juegoId: 2, monto: 10 })).body;
    const res = await api().post(`/api/apuestas/${p.id}/acciones`).set(auth(b.token)).send({ accion: 'cambiar', conservar: [] });
    expect(res.status).toBe(404);
  });

  test('historial: el jugador solo ve sus apuestas', async () => {
    const res = await api().get('/api/apuestas?limite=100').set(auth(jugador.token));
    expect(res.status).toBe(200);
    expect(res.body.datos.every((a) => a.usuarioId === jugador.usuario.id)).toBe(true);
  });
});

describe('Operación transaccional (rollback)', () => {
  test('si la apuesta falla a mitad, saldo, movimientos y apuestas no cambian', async () => {
    const { token: t, usuario } = await nuevoJugador();
    const contar = async () => {
      const [[s]] = await pool.query('SELECT saldo FROM billeteras WHERE usuario_id = ?', [usuario.id]);
      const [[m]] = await pool.query('SELECT COUNT(*) AS n FROM movimientos m JOIN billeteras b ON b.id = m.billetera_id WHERE b.usuario_id = ?', [usuario.id]);
      const [[a]] = await pool.query('SELECT COUNT(*) AS n FROM apuestas WHERE usuario_id = ?', [usuario.id]);
      return { saldo: s.saldo, movimientos: m.n, apuestas: a.n };
    };
    const antes = await contar();
    ganchosPrueba.despuesDelCargo = () => { throw new Error('Falla simulada a mitad de la apuesta'); };
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await api().post('/api/apuestas').set(auth(t)).send({ juegoId: 3, monto: 200 });
      expect(res.status).toBe(500);
    } finally {
      ganchosPrueba.despuesDelCargo = null;
      silencio.mockRestore();
    }
    expect(await contar()).toEqual(antes);
  });
});

describe('M6 Administración: dashboard, reportes y bitácora', () => {
  test('dashboard con indicadores y series para las gráficas', async () => {
    const res = await api().get('/api/admin/dashboard').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.serieDiaria).toHaveLength(30);
    expect(res.body.porJuego.length).toBeGreaterThanOrEqual(4);
    expect(res.body.indicadores.apuestas).toBeGreaterThan(0);
  });

  test('las series cambian con el filtro de fechas', async () => {
    const hoy = new Date().toLocaleDateString('en-CA');
    const res = await api().get(`/api/admin/dashboard?desde=${hoy}&hasta=${hoy}`).set(auth(admin));
    expect(res.body.serieDiaria).toHaveLength(1);
  });

  test('reporte 1 exige rango de fechas y sus totales coinciden con SQL', async () => {
    expect((await api().get('/api/reportes/apuestas-por-juego').set(auth(admin))).status).toBe(400);
    expect((await api().get('/api/reportes/apuestas-por-juego?desde=2026-10-10&hasta=2026-10-01').set(auth(admin))).status).toBe(400);
    const res = await api().get('/api/reportes/apuestas-por-juego?desde=2000-01-01&hasta=2100-12-31').set(auth(admin));
    const [[sql]] = await pool.query('SELECT COUNT(*) AS n, SUM(monto) AS apostado, SUM(pago) AS pagado FROM apuestas');
    expect(res.body.totales.apuestas).toBe(sql.n);
    expect(res.body.totales.apostado).toBeCloseTo(sql.apostado);
    expect(res.body.totales.pagado).toBeCloseTo(sql.pagado);
  });

  test('reporte 2: ranking de jugadores ordenado', async () => {
    const res = await api().get('/api/reportes/jugadores?orden=apostado&dir=desc&limite=5').set(auth(admin));
    expect(res.status).toBe(200);
    const montos = res.body.datos.map((f) => f.apostado);
    expect([...montos].sort((a, b) => b - a)).toEqual(montos);
  });

  test('la bitácora registra las operaciones y se filtra', async () => {
    const res = await api().get('/api/bitacora?accion=registro&limite=5').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.datos.every((e) => e.accion === 'registro')).toBe(true);
    expect(res.body.paginacion.total).toBeGreaterThan(20);
  });

  test('ruta inexistente: 404 con mensaje', async () => {
    const res = await api().get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no existe/);
  });
});
