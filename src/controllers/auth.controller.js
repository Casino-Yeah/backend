import * as servicio from '../services/auth.service.js';

export const registro = async (req, res) => res.status(201).json(await servicio.registrar(req.body, req.ip));
export const login = async (req, res) => res.json(await servicio.iniciarSesion(req.body, req.ip));
export const perfil = async (req, res) => res.json(await servicio.perfil(req.usuario.id));
export const cambiarPassword = async (req, res) => {
  await servicio.cambiarPassword(req.usuario.id, req.body, req.ip);
  res.json({ mensaje: 'Contraseña actualizada' });
};
