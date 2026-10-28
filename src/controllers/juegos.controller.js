import * as servicio from '../services/juegos.service.js';

const esAdmin = (req) => req.usuario.rol === 'admin';
export const listar = async (req, res) => res.json(await servicio.listar(req.query, esAdmin(req)));
export const obtener = async (req, res) => res.json(await servicio.obtener(req.params.id, esAdmin(req)));
export const crear = async (req, res) => res.status(201).json(await servicio.crear(req.body, req.usuario.id, req.ip));
export const actualizar = async (req, res) => res.json(await servicio.actualizar(req.params.id, req.body, req.usuario.id, req.ip));
export const eliminar = async (req, res) => {
  await servicio.eliminar(req.params.id, req.usuario.id, req.ip);
  res.status(204).end();
};
