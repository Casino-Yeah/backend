import * as servicio from '../services/apuestas.service.js';

export const iniciar = async (req, res) => res.status(201).json(await servicio.iniciar({
  usuarioId: req.usuario.id, juegoId: req.body.juegoId, monto: req.body.monto, ip: req.ip,
}));
export const jugar = async (req, res) => {
  const { accion, ...datos } = req.body;
  res.json(await servicio.jugar({ usuarioId: req.usuario.id, apuestaId: req.params.id, accion, datos, ip: req.ip }));
};
export const listar = async (req, res) => res.json(await servicio.listar(req.query, req.usuario));
