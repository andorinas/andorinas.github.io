// Curva planificada del portal: cada rubro avanza parejo entre su inicio y su fin previstos, ponderado por su peso.
export const DIA = 86400000;
export const msDeIso = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const isoDeMs = (ms) => new Date(ms).toISOString().slice(0, 10);

/** ¿Se puede dibujar la curva? Todos los rubros tienen peso, los pesos suman 100 y los que pesan tienen plan. */
export function planCompleto(rubros) {
  if (!rubros?.length || rubros.some((r) => r.peso == null)) return false;
  if (Math.abs(rubros.reduce((s, r) => s + Number(r.peso), 0) - 100) > 0.0101) return false;
  return rubros.every((r) => Number(r.peso) === 0 || (r.inicio_plan && r.fin_plan));
}

/** % de la obra que debería estar hecho al terminar el día `fecha` según el plan (null si el plan está incompleto). */
export function avancePlanificado(rubros, fecha) {
  if (!planCompleto(rubros)) return null;
  const d = msDeIso(fecha);
  let s = 0;
  for (const r of rubros) {
    if (!Number(r.peso)) continue;
    const ini = msDeIso(r.inicio_plan), fin = msDeIso(r.fin_plan);
    const frac = d < ini ? 0 : d >= fin ? 1 : (Math.round((d - ini) / DIA) + 1) / (Math.round((fin - ini) / DIA) + 1);
    s += Number(r.peso) * frac;
  }
  return Math.round(s * 100) / 100;
}

/** Puntos de quiebre de la curva planificada: el día anterior a cada inicio y cada fin, ordenados. */
export function curvaPlan(rubros) {
  if (!planCompleto(rubros)) return [];
  const conPeso = rubros.filter((r) => Number(r.peso));
  const fechas = [...new Set(conPeso.flatMap((r) => [isoDeMs(msDeIso(r.inicio_plan) - DIA), r.fin_plan]))].sort();
  return fechas.map((fecha) => ({ fecha, avance: avancePlanificado(rubros, fecha) }));
}

/** Rango del plan: primer inicio y último fin (o null). */
export function rangoPlan(rubros) {
  const r = (rubros || []).filter((x) => x.inicio_plan && x.fin_plan);
  if (!r.length) return null;
  return { inicio: r.map((x) => x.inicio_plan).sort()[0], fin: r.map((x) => x.fin_plan).sort().at(-1) };
}
