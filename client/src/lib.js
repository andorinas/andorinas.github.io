// Utilidades del cliente: formatos argentinos y parsing de importes/fechas.
// La comunicación con Supabase vive en datos.js.
export { api, subirAdjunto, ApiError } from './datos.js';

// ── Formatos es-AR ──────────────────────────────────────────────────────────
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nfp = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const nfTc = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const money = (c, m) => (c == null ? '—' : `${m} ${nf2.format(c / 100)}`);
export const money0 = (c, m) => (c == null ? '—' : `${Math.round(c / 100) < 0 ? '−' : ''}${m} ${nf0.format(Math.abs(Math.round(c / 100)))}`);
export const numero = (c) => nf2.format(c / 100);
export const pct = (v) => (v == null ? '—' : `${nfp.format(v)} %`);
export const tc = (v) => (v == null ? '—' : `ARS ${nfTc.format(v)} por USD`);
export const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const dmyHora = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
};
export function hoyISO() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return d.toISOString().slice(0, 10);
}

/** "1.234.567,89" | "1234567,89" | "1234567.89" | "1.234" -> centavos (o null). */
export function parseImporte(txt) {
  if (txt == null) return null;
  let s = String(txt).trim().replace(/\s|ARS|USD|\$/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export { parseDecimal } from '../../shared/numeros.js';
/** "DD/MM/AAAA" -> "AAAA-MM-DD" (o null si no es válida). */
export function parseDMY(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(txt).trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const CRITERIO = { historico: 'BNA vendedor histórico', manual: 'Dólar manual' };
export const CONDICION = { contado: 'Contado', a_cuenta: 'A cuenta', contrato: 'Contratación' };
export const ESTADO_OBRA = { planificada: 'Planificada', en_curso: 'En curso', pausada: 'Pausada', finalizada: 'Finalizada' };
export const ESTADO_PAGO = { pagado: 'Pagado', parcial: 'Pago parcial', pendiente: 'Pendiente', vencido: 'Vencido' };

/** Query string de los parámetros de vista + filtros (misma que usa PDF/Excel). */
export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  return p.toString();
}
