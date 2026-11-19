// Capa de datos: resuelve en el navegador, contra Supabase, las mismas "rutas" que usaba la versión con servidor.
// Lecturas: tablas con RLS. Escrituras: funciones RPC que validan reglas y permisos en la base.
// Cálculos: motor único compartido (shared/calc.js) — el mismo que usan PDF y Excel.
import { supabase } from './supabase.js';
import { calcularObra } from '../../shared/calc.js';
import { parametrosVista } from '../../shared/vista.js';

export class ApiError extends Error { constructor(status, msg, data) { super(msg); this.status = status; this.data = data; } }

const traducir = (msg = '') => {
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos';
  if (/Email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu email: revisá tu casilla.';
  if (/JWT expired|invalid JWT/i.test(msg)) return 'La sesión venció. Volvé a ingresar.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'Sin conexión con el servidor. Revisá internet y reintentá (si ya se había guardado, no se duplica).';
  if (/PKCE|code verifier|code_verifier|auth code/i.test(msg)) return 'El enlace del email se abrió en otro navegador. Abrilo en el mismo navegador donde lo pediste, o pedí uno nuevo.';
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos.';
  if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/User already registered/i.test(msg)) return 'Ya existe una cuenta con ese email.';
  return msg;
};
const chk = ({ data, error }) => {
  if (error) {
    if (/JWT/.test(error.message)) window.dispatchEvent(new Event('sesion-vencida'));
    const e = new ApiError(400, traducir(error.message));
    e.red = /Failed to fetch|NetworkError|Load failed|network/i.test(error.message || '');
    throw e;
  }
  return data;
};
const rpc = async (fn, args) => chk(await supabase.rpc(fn, args));

/** Trae todas las filas (PostgREST devuelve hasta 1000 por pedido). */
async function todo(build) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const data = chk(await build().range(desde, desde + 999));
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const tabla = (t) => supabase.from(t);

// ── Sesión ────────────────────────────────────────────────────────────────
export async function perfilActual() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await tabla('perfiles').select('id, email, nombre, rol, activo').eq('id', session.user.id).maybeSingle();
  if (error) throw new ApiError(400, traducir(error.message));
  return data ? { ...data, email: data.email || session.user.email } : { id: session.user.id, email: session.user.email, nombre: '', rol: 'pendiente', activo: true };
}
export async function ingresar(email, password) {
  chk(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
  return perfilActual();
}
export async function registrarse({ email, password, nombre }) {
  const base = window.location.href.split('#')[0];
  const r = chk(await supabase.auth.signUp({ email: email.trim(), password, options: { data: { nombre }, emailRedirectTo: base } }));
  return { requiereConfirmacion: !r.session };
}
export async function recuperarPassword(email) {
  const base = window.location.href.split('#')[0];
  chk(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: base }));
}
export async function nuevaPassword(password) { chk(await supabase.auth.updateUser({ password })); }
export async function salir() { await supabase.auth.signOut(); }

let _dir = null;
async function directorio() {
  if (!_dir) _dir = Object.fromEntries((chk(await supabase.rpc('directorio')) || []).map((u) => [u.id, u.nombre]));
  return _dir;
}

// ── Datos de obra para el motor de cálculo ────────────────────────────────
export async function cargarDatosObra(obraId) {
  const obra = chk(await tabla('obras').select('*').eq('id', obraId).maybeSingle());
  if (!obra) throw new ApiError(403, 'No tenés acceso a esta obra o no existe');
  const [rubros, tipos, presupuestos, compromisos, pagos, avances] = await Promise.all([
    todo(() => tabla('rubros').select('*').eq('obra_id', obraId).order('orden').order('id')),
    todo(() => tabla('tipos_gasto').select('*').order('orden').order('nombre')),
    todo(() => tabla('presupuestos').select('*').eq('obra_id', obraId).order('id')),
    todo(() => tabla('compromisos').select('*').eq('obra_id', obraId).order('fecha').order('id')),
    todo(() => tabla('pagos').select('*').eq('obra_id', obraId).order('fecha').order('id')),
    todo(() => tabla('avances').select('*').eq('obra_id', obraId).order('fecha').order('id')),
  ]);
  const provIds = [...new Set(compromisos.map((c) => c.proveedor_id).filter(Boolean))];
  const proveedores = provIds.length ? chk(await tabla('proveedores').select('*').in('id', provIds)) : [];
  return { obra, rubros, tipos, proveedores, presupuestos, compromisos, pagos, avances };
}

export async function informe(obraId, q = {}) {
  const datos = await cargarDatosObra(obraId);
  return calcularObra(datos, parametrosVista(q, datos.obra));
}

// ── Adjuntos (Supabase Storage, bucket privado) ───────────────────────────
const FIRMAS = {
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  'image/heic': (b) => String.fromCharCode(...b.slice(4, 8)) === 'ftyp',
  'image/heif': (b) => String.fromCharCode(...b.slice(4, 8)) === 'ftyp',
};
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

export async function subirAdjunto(obraId, file) {
  const mime = file.type || (/\.heic$/i.test(file.name) ? 'image/heic' : '');
  if (!FIRMAS[mime]) throw new ApiError(400, 'Formato no admitido: subí una foto (JPG, PNG, WEBP, HEIC) o un PDF');
  if (file.size > 15 * 1024 * 1024) throw new ApiError(400, 'El archivo supera 15 MB');
  const cab = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!FIRMAS[mime](cab)) throw new ApiError(400, 'El archivo no es una imagen o PDF válido');
  const ruta = `obra-${obraId}/${crypto.randomUUID()}.${EXT[mime]}`;
  chk(await supabase.storage.from('adjuntos').upload(ruta, file, { contentType: mime, upsert: false }));
  const id = await rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: file.name, p_mime: mime, p_tamano: file.size });
  return { id, nombre: file.name, mime };
}

/** Abre un comprobante con un enlace temporal (60 s) firmado por Supabase, sólo si hay permiso. */
export async function verAdjunto(adjuntoId) {
  const w = window.open('', '_blank');
  try {
    const a = chk(await tabla('adjuntos').select('ruta').eq('id', adjuntoId).maybeSingle());
    if (!a) throw new ApiError(403, 'Sin acceso al comprobante');
    const { signedUrl } = chk(await supabase.storage.from('adjuntos').createSignedUrl(a.ruta, 60));
    if (w) w.location.href = signedUrl; else window.location.href = signedUrl;
  } catch (e) { w?.close(); throw e; }
}

// ── Informes descargables (generados en el navegador con el mismo cálculo) ─
export async function generarArchivo(obraId, q, tipo) {
  const inf = await informe(obraId, q);
  const nombreBase = `${inf.obra.nombre.replace(/[^\p{L}\p{N}]+/gu, '_')}_corte_${inf.parametros.corte.split('-').reverse().join('-')}_${inf.parametros.moneda}`;
  if (tipo === 'pdf') {
    const { generarPdf } = await import('../../shared/exports/pdf.js');
    return new File([await generarPdf(inf)], `${nombreBase}.pdf`, { type: 'application/pdf' });
  }
  const { generarExcel } = await import('../../shared/exports/excel.js');
  return new File([await generarExcel(inf)], `${nombreBase}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export function descargar(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export async function descargarRespaldo() {
  const data = await rpc('exportar_respaldo');
  const f = new File([JSON.stringify(data, null, 1)], `controlar-respaldo-${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, { type: 'application/json' });
  descargar(f);
}

// ── Cotizaciones ──────────────────────────────────────────────────────────
export const listarCotizaciones = () => todo(() => tabla('cotizaciones').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }));
export const cargarCotizacion = (fecha, venta, motivo, reaplicar = true) => rpc('cargar_cotizacion', { p_fecha: fecha, p_venta: venta, p_motivo: motivo || null, p_reaplicar: reaplicar });

// ── Rutas compatibles con la versión anterior ─────────────────────────────
const n = Number;
async function ultimoAvancePorRubro(obraId) {
  const avs = await todo(() => tabla('avances').select('*').eq('obra_id', obraId).eq('anulado', false).order('fecha', { ascending: false }).order('id', { ascending: false }));
  const m = {};
  for (const a of avs) if (!m[a.rubro_id]) m[a.rubro_id] = a;
  return m;
}

const RUTAS = [
  ['GET', /^\/api\/me$/, async () => { const p = await perfilActual(); if (!p) throw new ApiError(401, 'Sesión no iniciada'); return p; }],
  ['POST', /^\/api\/logout$/, async () => { await salir(); return { ok: true }; }],

  ['GET', /^\/api\/usuarios$/, async () => {
    const [us, asig] = await Promise.all([todo(() => tabla('perfiles').select('*').order('nombre')), todo(() => tabla('obra_usuarios').select('*'))]);
    return us.map((u) => ({ ...u, obras: asig.filter((a) => a.usuario_id === u.id).map((a) => a.obra_id) }));
  }],
  ['PATCH', /^\/api\/usuarios\/([\w-]+)$/, async ([id], b) => { await rpc('actualizar_usuario', { p_id: id, p: b }); _dir = null; return { ok: true }; }],

  ['GET', /^\/api\/catalogo$/, async () => {
    const [rubros, tipos, proveedores] = await Promise.all([
      todo(() => tabla('rubros_catalogo').select('nombre, orden').order('orden').order('nombre')),
      todo(() => tabla('tipos_gasto').select('id, nombre, sistema').order('orden').order('nombre')),
      todo(() => tabla('proveedores').select('id, nombre').order('nombre')),
    ]);
    return { rubros: rubros.map((r) => r.nombre), tipos, proveedores };
  }],
  ['POST', /^\/api\/tipos$/, async (_, b) => ({ id: await rpc('crear_tipo', { p_nombre: b.nombre }) })],
  ['GET', /^\/api\/cotizacion$/, async (_, __, q) => {
    const c = await rpc('cotizacion_para', { p_fecha: q.get('fecha') });
    return c.cot_estado === 'ok' ? { estado: 'ok', valor: c.cot_valor, fecha: c.cot_fecha, fuente: c.cot_fuente }
      : { estado: 'pendiente', error: 'todavía no está cargada la cotización BNA de esa fecha' };
  }],

  ['GET', /^\/api\/obras$/, async () => {
    const obras = await todo(() => tabla('obras').select('*').order('nombre'));
    obras.sort((a, b) => (a.estado === 'finalizada') - (b.estado === 'finalizada') || a.nombre.localeCompare(b.nombre));
    return Promise.all(obras.map(async (o) => {
      const inf = await informe(o.id, { moneda: 'ARS', criterio: 'historico' });
      return { ...o, avance: inf.avance, completo: inf.completo, desvios: inf.desvios.length, rubros: inf.rubros.length,
        totales: { comprometido: inf.totales.comprometido.valor, pagado: inf.totales.pagado.valor, pendiente: inf.totales.pendiente.valor, presupuesto: inf.totales.presupuesto.valor } };
    }));
  }],
  ['POST', /^\/api\/obras$/, async (_, b) => ({ id: await rpc('crear_obra', { p: b }) })],
  ['GET', /^\/api\/obras\/(\d+)$/, async ([id]) => {
    const obra = chk(await tabla('obras').select('*').eq('id', id).maybeSingle());
    if (!obra) throw new ApiError(403, 'No tenés acceso a esta obra o no existe');
    const [rubros, pres, ult, enc] = await Promise.all([
      todo(() => tabla('rubros').select('*').eq('obra_id', id).order('orden').order('id')),
      todo(() => tabla('presupuestos').select('*').eq('obra_id', id).order('version', { ascending: false })),
      ultimoAvancePorRubro(id),
      todo(() => tabla('obra_usuarios').select('usuario_id').eq('obra_id', id)),
    ]);
    const dir = await directorio();
    return { ...obra, rubros: rubros.map((r) => ({ ...r, ultimoAvance: ult[r.id] || null, presupuestoActual: pres.find((p) => p.rubro_id === r.id) || null })),
      encargados: enc.map((e) => ({ id: e.usuario_id, nombre: dir[e.usuario_id] || '' })) };
  }],
  ['PATCH', /^\/api\/obras\/(\d+)$/, async ([id], b) => { await rpc('actualizar_obra', { p_id: n(id), p: b }); return { ok: true }; }],
  ['PUT', /^\/api\/obras\/(\d+)\/cotizacion-manual$/, async ([id], b) => { await rpc('definir_cotizacion_manual', { p_obra: n(id), p_valor: b.valor }); return { valor: b.valor }; }],
  ['POST', /^\/api\/obras\/(\d+)\/rubros$/, async ([id], b) => ({ id: await rpc('crear_rubro', { p_obra: n(id), p_nombre: b.nombre }) })],
  ['PATCH', /^\/api\/rubros\/(\d+)$/, async ([id], b) => { await rpc('actualizar_rubro', { p_id: n(id), p: b }); return { ok: true }; }],
  ['PUT', /^\/api\/obras\/(\d+)\/pesos$/, async ([id], b) => ({ faltaAsignar: await rpc('definir_pesos', { p_obra: n(id), p_pesos: b.pesos }) })],
  ['GET', /^\/api\/rubros\/(\d+)\/presupuestos$/, async ([id]) => {
    const [ps, dir] = await Promise.all([todo(() => tabla('presupuestos').select('*').eq('rubro_id', id).order('version', { ascending: false })), directorio()]);
    return ps.map((p) => ({ ...p, usuario: dir[p.creado_por] || '' }));
  }],
  ['POST', /^\/api\/rubros\/(\d+)\/presupuestos$/, async ([id], b) => rpc('definir_presupuesto', { p_rubro: n(id), p: b })],

  ['POST', /^\/api\/obras\/(\d+)\/gastos$/, async ([id], b) => rpc('crear_gasto', { p_obra: n(id), p: b })],
  ['GET', /^\/api\/obras\/(\d+)\/compromisos-abiertos$/, async ([id]) => {
    const d = await cargarDatosObra(id);
    const nom = (arr, k) => Object.fromEntries(arr.map((x) => [x.id, x.nombre]))[k];
    return d.compromisos.filter((c) => !c.anulado).map((c) => {
      const canc = d.pagos.filter((p) => p.compromiso_id === c.id && !p.anulado).reduce((s, p) => s + p.importe_cancelado, 0);
      return { ...c, saldo: c.importe - canc, rubro: nom(d.rubros, c.rubro_id), tipo: nom(d.tipos, c.tipo_id), proveedor: nom(d.proveedores, c.proveedor_id) || null };
    }).filter((c) => c.saldo > 0).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  }],
  ['GET', /^\/api\/compromisos\/(\d+)$/, async ([id]) => {
    const c = chk(await tabla('compromisos').select('*').eq('id', id).maybeSingle());
    if (!c) throw new ApiError(404, 'Movimiento inexistente');
    const [pagos, rub, tip, prov, dir] = await Promise.all([
      todo(() => tabla('pagos').select('*').eq('compromiso_id', id).order('fecha').order('id')),
      tabla('rubros').select('nombre').eq('id', c.rubro_id).maybeSingle().then(chk),
      tabla('tipos_gasto').select('nombre').eq('id', c.tipo_id).maybeSingle().then(chk),
      c.proveedor_id ? tabla('proveedores').select('nombre').eq('id', c.proveedor_id).maybeSingle().then(chk) : null,
      directorio(),
    ]);
    const pagoIds = pagos.map((p) => p.id);
    const audit = chk(await tabla('auditoria').select('*')
      .or(`and(entidad.eq.compromiso,entidad_id.eq.${c.id})${pagoIds.length ? `,and(entidad.eq.pago,entidad_id.in.(${pagoIds.join(',')}))` : ''}`).order('id'));
    const cancelado = pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.importe_cancelado, 0);
    return { ...c, rubro: rub?.nombre, tipo: tip?.nombre, proveedor: prov?.nombre || null, usuario: dir[c.creado_por] || '',
      saldo: c.importe - cancelado, cancelado, pagos: pagos.map((p) => ({ ...p, usuario: dir[p.creado_por] || '' })),
      auditoria: audit.map((a) => ({ ...a, usuario: dir[a.usuario_id] || '', antes: a.antes && JSON.stringify(a.antes), despues: a.despues && JSON.stringify(a.despues) })) };
  }],
  ['PATCH', /^\/api\/compromisos\/(\d+)$/, async ([id], b) => { await rpc('corregir_compromiso', { p_id: n(id), p: b }); return { ok: true }; }],
  ['POST', /^\/api\/compromisos\/(\d+)\/anular$/, async ([id], b) => { await rpc('anular_compromiso', { p_id: n(id), p_motivo: b.motivo }); return { ok: true }; }],
  ['POST', /^\/api\/compromisos\/(\d+)\/pagos\/preview$/, async ([id], b) => rpc('preparar_pago', { p_comp: n(id), p: b })],
  ['POST', /^\/api\/compromisos\/(\d+)\/pagos$/, async ([id], b) => rpc('registrar_pago', { p_comp: n(id), p: b })],
  ['POST', /^\/api\/pagos\/(\d+)\/anular$/, async ([id], b) => { await rpc('anular_pago', { p_id: n(id), p_motivo: b.motivo }); return { ok: true }; }],

  ['POST', /^\/api\/rubros\/(\d+)\/avances$/, async ([id], b) => rpc('cargar_avance', { p_rubro: n(id), p: b })],
  ['GET', /^\/api\/obras\/(\d+)\/avances$/, async ([id]) => {
    const [avs, rubros, dir] = await Promise.all([
      todo(() => tabla('avances').select('*').eq('obra_id', id).order('fecha', { ascending: false }).order('id', { ascending: false })),
      todo(() => tabla('rubros').select('id, nombre').eq('obra_id', id)), directorio()]);
    const nr = Object.fromEntries(rubros.map((r) => [r.id, r.nombre]));
    return avs.map((a) => ({ ...a, rubro: nr[a.rubro_id], usuario: dir[a.creado_por] || '' }));
  }],
  ['POST', /^\/api\/avances\/(\d+)\/anular$/, async ([id], b) => { await rpc('anular_avance', { p_id: n(id), p_motivo: b.motivo }); return { ok: true }; }],

  ['GET', /^\/api\/obras\/(\d+)\/informe$/, async ([id], _, q) => informe(n(id), Object.fromEntries(q))],
];

/** Mismo contrato que el api() anterior: api(url, { method, body }). */
export async function api(url, { method = 'GET', body } = {}) {
  const [ruta, qs = ''] = url.split('?');
  for (const [m, re, fn] of RUTAS) {
    const k = re.exec(ruta);
    if (k && m === method) return fn(k.slice(1), body || {}, new URLSearchParams(qs));
  }
  throw new ApiError(404, `Operación no disponible: ${method} ${ruta}`);
}
