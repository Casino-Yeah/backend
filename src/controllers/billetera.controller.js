import * as servicio from '../services/billetera.service.js';

export const consultar = async (req, res) => res.json(await servicio.consultar(req.usuario.id));
export const recargar = async (req, res) => res.status(201).json(await servicio.recargar(req.usuario.id, req.body.monto, req.ip));
export const movimientos = async (req, res) => res.json(await servicio.movimientos(req.usuario.id, req.query));
