// Normaliza los parámetros de vista (los mismos para tablero, PDF y Excel).
export function hoyAR() {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parametrosVista(q, obra) {
  const moneda = q.moneda === 'USD' ? 'USD' : 'ARS';
  const criterio = q.criterio === 'manual' ? 'manual' : 'historico';
  const corte = esFecha(q.corte) ? q.corte : hoyAR();
  const cotizacionManual = criterio === 'manual' ? Number(q.cotizacionManual || obra.cotizacion_manual) : null;
  const filtros = {};
  for (const k of ['rubroId', 'tipoId', 'proveedorId', 'estadoPago', 'desde']) if (q[k]) filtros[k] = q[k];
  if (filtros.desde && !esFecha(filtros.desde)) delete filtros.desde;
  return { moneda, criterio, corte, cotizacionManual, filtros };
}
