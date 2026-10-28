import { body, param, query } from 'express-validator';

export const idParam = (nombre = 'id') => param(nombre).isInt({ min: 1 }).withMessage('El id debe ser un entero positivo').toInt();

export const paginacion = [
  query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un entero mayor a 0'),
  query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  query('dir').optional().isIn(['asc', 'desc']).withMessage('La dirección debe ser asc o desc'),
];

export const rangoFechas = [
  query('desde').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('La fecha inicial debe tener formato AAAA-MM-DD'),
  query('hasta').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('La fecha final debe tener formato AAAA-MM-DD'),
];

export const nombre = (opcional = false) => {
  const r = body('nombre');
  return (opcional ? r.optional() : r).isString().trim().isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres');
};
export const correo = (opcional = false) => {
  const r = body('correo');
  return (opcional ? r.optional() : r).isEmail().withMessage('El correo no es válido').normalizeEmail({ gmail_remove_dots: false }).isLength({ max: 120 });
};
export const password = (campo = 'password', opcional = false) => {
  const r = body(campo);
  return (opcional ? r.optional() : r)
    .isString().isLength({ min: 8, max: 72 }).withMessage('La contraseña debe tener entre 8 y 72 caracteres')
    .matches(/[A-Za-z]/).withMessage('La contraseña debe incluir al menos una letra')
    .matches(/\d/).withMessage('La contraseña debe incluir al menos un número');
};
export const fechaNacimiento = (opcional = false) => {
  const r = body('fechaNacimiento');
  return (opcional ? r.optional() : r).isISO8601({ strict: true }).withMessage('La fecha de nacimiento debe tener formato AAAA-MM-DD');
};
export const montoPositivo = (campo = 'monto') => body(campo)
  .exists({ values: 'null' }).withMessage('El monto es obligatorio')
  .isFloat({ gt: 0 }).withMessage('El monto debe ser un número mayor a 0')
  .custom((v) => Math.round(v * 100) === Number(v) * 100).withMessage('El monto admite máximo 2 decimales')
  .toFloat();
