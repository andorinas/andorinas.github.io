// Formatos argentinos para informes (servidor). El cliente usa equivalentes en client/src/lib.js.
const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nfTc = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const money = (cents, moneda) => (cents == null ? '—' : `${moneda} ${nf.format(cents / 100)}`);
export const money0 = (cents, moneda) => (cents == null ? '—' : `${moneda} ${nf0.format(Math.round(cents / 100))}`);
export const tc = (v) => (v == null ? '—' : `ARS ${nfTc.format(v)} por USD`);
export const pct = (v) => (v == null ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v)} %`);
export const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export const CRITERIO = { historico: 'BNA vendedor histórico', manual: 'Dólar manual' };
export const CONDICION = { contado: 'Contado', a_cuenta: 'A cuenta', contrato: 'Contratación' };
export const ESTADO_OBRA = { planificada: 'Planificada', en_curso: 'En curso', pausada: 'Pausada', finalizada: 'Finalizada' };

export function descripcionVista(p) {
  const base = `Moneda: ${p.moneda} · Criterio: ${CRITERIO[p.criterio]}`;
  return p.criterio === 'manual' ? `${base} (ARS ${nfTc.format(p.cotizacionManual)} por USD)` : base;
}
