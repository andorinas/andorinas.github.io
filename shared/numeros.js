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

/** Coordenadas pegadas desde Google Maps: "-34.8812, -58.0512" | "(-34.8812,-58.0512)" | "-34,8812 -58,0512" -> { latitud, longitud } o null. */
export function leerCoordenadas(txt) {
  const s = String(txt ?? '').replace(/[()°]/g, ' ').trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/) || s.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);
  if (!m) return null;
  const latitud = Number(m[1].replace(',', '.')), longitud = Number(m[2].replace(',', '.'));
  if (!(Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180)) return null;
  return { latitud, longitud };
}
