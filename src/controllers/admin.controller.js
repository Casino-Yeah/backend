import * as reportes from '../services/reportes.service.js';
import * as bitacora from '../services/bitacora.service.js';

export const dashboard = async (req, res) => res.json(await reportes.dashboard(req.query));
export const reporteJuegos = async (req, res) => res.json(await reportes.apuestasPorJuego(req.query));
export const reporteJugadores = async (req, res) => res.json(await reportes.jugadores(req.query));
export const bitacoraListar = async (req, res) => res.json(await bitacora.listar(req.query));
