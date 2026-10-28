import { validationResult } from 'express-validator';
import { solicitudInvalida } from '../utils/errores.js';

// Se coloca al final de una lista de reglas de express-validator
export function validar(req, _res, next) {
  const resultado = validationResult(req);
  if (!resultado.isEmpty()) {
    const errores = resultado.array().map((e) => ({ campo: e.path, mensaje: e.msg }));
    throw solicitudInvalida('Los datos enviados no son válidos', errores);
  }
  next();
}
