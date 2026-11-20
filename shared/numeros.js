// Lectura de números tipeados por el usuario (formato argentino). Compartido para poder probarlo en Node.
/** "1.580,00" | "1580" | "12,5" | "40 %" -> número (o null si no es válido). */
export function parseDecimal(txt) {
  if (txt == null || txt === '') return null;
  let s = String(txt).trim().replace(/\s|ARS|%/gi, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.550" = mil quinientos cincuenta
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
