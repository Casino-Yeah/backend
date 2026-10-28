export function leerPaginacion(query) {
  const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
  const limite = Math.min(100, Math.max(1, Number.parseInt(query.limite, 10) || 10));
  return { pagina, limite, offset: (pagina - 1) * limite };
}

// columnas: mapa { nombrePublico: 'columna_sql' } para evitar inyección en ORDER BY
export function leerOrden(query, columnas, porDefecto) {
  const columna = columnas[query.orden] ?? columnas[porDefecto];
  const direccion = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${columna} ${direccion}`;
}

export function respuestaPaginada(datos, total, { pagina, limite }) {
  return { datos, paginacion: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) } };
}

// Rango de fechas inclusivo: 'YYYY-MM-DD' -> ['YYYY-MM-DD 00:00:00', 'YYYY-MM-DD 23:59:59']
export function rangoFechas(desde, hasta) {
  return [desde ? `${desde} 00:00:00` : null, hasta ? `${hasta} 23:59:59` : null];
}
