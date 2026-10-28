import { Router } from 'express';
import { body, query } from 'express-validator';
import { autenticar, permitir } from '../middlewares/autenticacion.js';
import { validar } from '../middlewares/validar.js';
import {
  idParam, paginacion, rangoFechas, nombre, correo, password, fechaNacimiento, montoPositivo,
} from '../validators/comunes.js';
import * as auth from '../controllers/auth.controller.js';
import * as usuarios from '../controllers/usuarios.controller.js';
import * as juegos from '../controllers/juegos.controller.js';
import * as billetera from '../controllers/billetera.controller.js';
import * as apuestas from '../controllers/apuestas.controller.js';
import * as admin from '../controllers/admin.controller.js';

const r = Router();
const soloAdmin = [autenticar, permitir('admin')];
const soloJugador = [autenticar, permitir('jugador')];
const TIPOS_JUEGO = ['blackjack', 'poker', 'ruleta', 'billar'];
const booleano = (campo) => body(campo).optional().isBoolean({ strict: true }).withMessage(`${campo} debe ser true o false`);

// ---------- M1 Autenticación (1-4) ----------
r.post('/auth/registro', nombre(), correo(), password(), fechaNacimiento(), validar, auth.registro); // 1
r.post('/auth/login',
  body('correo').isEmail().withMessage('El correo no es válido').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().notEmpty().withMessage('La contraseña es obligatoria'),
  validar, auth.login); // 2
r.get('/auth/perfil', autenticar, auth.perfil); // 3
r.put('/auth/password', autenticar,
  body('actual').isString().notEmpty().withMessage('La contraseña actual es obligatoria'),
  password('nueva'), validar, auth.cambiarPassword); // 4

// ---------- M2 Usuarios (5-9), solo administrador ----------
r.get('/usuarios', soloAdmin, ...paginacion,
  query('rol').optional({ values: 'falsy' }).isIn(['admin', 'jugador']).withMessage('Rol inválido'),
  query('activo').optional({ values: 'falsy' }).isIn(['true', 'false']).withMessage('activo debe ser true o false'),
  query('orden').optional().isIn(['nombre', 'correo', 'creadoEn', 'saldo', 'id']).withMessage('Orden inválido'),
  validar, usuarios.listar); // 5
r.get('/usuarios/:id', soloAdmin, idParam(), validar, usuarios.obtener); // 6
r.post('/usuarios', soloAdmin, nombre(), correo(), password(), fechaNacimiento(),
  body('rol').isIn(['admin', 'jugador']).withMessage('El rol debe ser admin o jugador'), booleano('activo'),
  validar, usuarios.crear); // 7
r.put('/usuarios/:id', soloAdmin, idParam(), nombre(true), correo(true), password('password', true), fechaNacimiento(true),
  body('rol').optional().isIn(['admin', 'jugador']).withMessage('El rol debe ser admin o jugador'), booleano('activo'),
  validar, usuarios.actualizar); // 8
r.delete('/usuarios/:id', soloAdmin, idParam(), validar, usuarios.eliminar); // 9

// ---------- M3 Juegos (10-14) ----------
r.get('/juegos', autenticar, ...paginacion,
  query('tipo').optional({ values: 'falsy' }).isIn(TIPOS_JUEGO).withMessage('Tipo de juego inválido'),
  query('orden').optional().isIn(['nombre', 'apuestaMin', 'apuestaMax', 'creadoEn', 'apuestas']).withMessage('Orden inválido'),
  validar, juegos.listar); // 10
r.get('/juegos/:id', autenticar, idParam(), validar, juegos.obtener); // 11
const reglasJuego = (opcional) => {
  const o = (cadena) => (opcional ? cadena.optional() : cadena);
  return [
    o(body('slug')).isSlug().withMessage('El slug solo admite minúsculas, números y guiones').isLength({ min: 2, max: 30 }),
    o(body('tipo')).isIn(TIPOS_JUEGO).withMessage(`El tipo debe ser: ${TIPOS_JUEGO.join(', ')}`),
    o(body('nombre')).isString().trim().isLength({ min: 2, max: 60 }).withMessage('El nombre debe tener entre 2 y 60 caracteres'),
    body('descripcion').optional().isString().trim().isLength({ max: 255 }).withMessage('Máximo 255 caracteres'),
    o(body('apuestaMin')).isFloat({ gt: 0, max: 1000000 }).withMessage('La apuesta mínima debe ser mayor a 0').toFloat(),
    o(body('apuestaMax')).isFloat({ gt: 0, max: 1000000 }).withMessage('La apuesta máxima debe ser mayor a 0').toFloat(),
    booleano('activo'),
  ];
};
r.post('/juegos', soloAdmin, ...reglasJuego(false), validar, juegos.crear); // 12
r.put('/juegos/:id', soloAdmin, idParam(), ...reglasJuego(true), validar, juegos.actualizar); // 13
r.delete('/juegos/:id', soloAdmin, idParam(), validar, juegos.eliminar); // 14

// ---------- M4 Billetera (15-18) ----------
r.get('/billetera', soloJugador, billetera.consultar); // 15
r.post('/billetera/recargas', soloJugador, montoPositivo(), validar, billetera.recargar); // 16
r.get('/billetera/movimientos', soloJugador, ...paginacion, ...rangoFechas,
  query('tipo').optional({ values: 'falsy' }).isIn(['recarga', 'apuesta', 'premio', 'ajuste', 'bono']).withMessage('Tipo inválido'),
  validar, billetera.movimientos); // 17
r.post('/usuarios/:id/ajuste-saldo', soloAdmin, idParam(),
  body('monto').isFloat().withMessage('El monto debe ser un número (negativo para descontar)').toFloat(),
  body('motivo').isString().trim().isLength({ min: 5, max: 255 }).withMessage('El motivo es obligatorio (5 a 255 caracteres)'),
  validar, usuarios.ajustarSaldo); // 18

// ---------- M5 Apuestas (19-21) ----------
r.post('/apuestas', soloJugador,
  body('juegoId').isInt({ min: 1 }).withMessage('El juego es obligatorio').toInt(), montoPositivo(),
  validar, apuestas.iniciar); // 19
r.post('/apuestas/:id/acciones', soloJugador, idParam(),
  body('accion').isString().notEmpty().withMessage('La acción es obligatoria'),
  validar, apuestas.jugar); // 20
r.get('/apuestas', autenticar, ...paginacion, ...rangoFechas,
  query('estado').optional({ values: 'falsy' }).isIn(['en_curso', 'ganada', 'perdida', 'empate']).withMessage('Estado inválido'),
  query('orden').optional().isIn(['creadoEn', 'monto', 'pago', 'juego']).withMessage('Orden inválido'),
  validar, apuestas.listar); // 21

// ---------- M6 Administración (22-25) ----------
r.get('/admin/dashboard', soloAdmin, ...rangoFechas, validar, admin.dashboard); // 22
r.get('/reportes/apuestas-por-juego', soloAdmin, ...rangoFechas, validar, admin.reporteJuegos); // 23
r.get('/reportes/jugadores', soloAdmin, ...rangoFechas,
  query('orden').optional().isIn(['apostado', 'neto', 'apuestas', 'recargas', 'saldo', 'nombre']).withMessage('Orden inválido'),
  query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  validar, admin.reporteJugadores); // 24
r.get('/bitacora', soloAdmin, ...paginacion, ...rangoFechas, validar, admin.bitacoraListar); // 25

export default r;
