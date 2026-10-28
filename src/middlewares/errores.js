import { ErrorHttp } from '../utils/errores.js';

export function rutaNoEncontrada(req, _res, next) {
  next(new ErrorHttp(404, `La ruta ${req.method} ${req.originalUrl} no existe`));
}

// Manejo global de errores: siempre responde { mensaje, errores? }
// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, _req, res, _next) {
  if (err instanceof ErrorHttp) {
    return res.status(err.estado).json({ mensaje: err.message, ...(err.errores ? { errores: err.errores } : {}), ...(err.extra ?? {}) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ mensaje: 'El cuerpo de la solicitud no es JSON válido' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ mensaje: 'Ya existe un registro con ese valor único' });
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(409).json({ mensaje: 'La operación viola una regla de la base de datos (por ejemplo, saldo negativo)' });
  }
  console.error(err);
  return res.status(500).json({ mensaje: 'Error interno del servidor' });
}
