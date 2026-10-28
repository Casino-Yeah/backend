import * as servicio from '../services/usuarios.service.js';
import * as billetera from '../services/billetera.service.js';

export const listar = async (req, res) => res.json(await servicio.listar(req.query));
export const obtener = async (req, res) => res.json(await servicio.obtener(req.params.id));
export const crear = async (req, res) => res.status(201).json(await servicio.crear(req.body, req.usuario.id, req.ip));
export const actualizar = async (req, res) => res.json(await servicio.actualizar(req.params.id, req.body, req.usuario.id, req.ip));
export const eliminar = async (req, res) => {
  await servicio.eliminar(req.params.id, req.usuario.id, req.ip);
  res.status(204).end();
};
export const ajustarSaldo = async (req, res) => res.json(await billetera.ajustar({
  usuarioId: req.params.id, monto: req.body.monto, motivo: req.body.motivo, adminId: req.usuario.id, ip: req.ip,
}));
