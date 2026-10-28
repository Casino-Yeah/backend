export class ErrorHttp extends Error {
  /**
   * @param {number} estado  código HTTP
   * @param {string} mensaje mensaje claro para el usuario
   * @param {Array<{campo:string, mensaje:string}>} [errores] detalle por campo
   * @param {object} [extra] datos adicionales que se agregan a la respuesta
   */
  constructor(estado, mensaje, errores, extra) {
    super(mensaje);
    this.estado = estado;
    this.errores = errores;
    this.extra = extra;
  }
}

export const solicitudInvalida = (mensaje, errores) => new ErrorHttp(400, mensaje, errores);
export const noAutenticado = (mensaje = 'Debes iniciar sesión') => new ErrorHttp(401, mensaje);
export const prohibido = (mensaje = 'No tienes permiso para esta acción') => new ErrorHttp(403, mensaje);
export const noEncontrado = (mensaje = 'Recurso no encontrado') => new ErrorHttp(404, mensaje);
export const conflicto = (mensaje, extra) => new ErrorHttp(409, mensaje, undefined, extra);
