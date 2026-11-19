import { crearBase, crearUsuario, como, cargarDatosObra } from './db.js';
import { calcularObra } from '../shared/calc.js';
import { parametrosVista } from '../shared/vista.js';

// Serie FICTICIA, exclusiva de prueba (no son cotizaciones reales). Carga manual del administrador.
export const SERIE_PRUEBA = {
  '2026-03-02': 1200, '2026-03-03': 1200, '2026-03-04': 1210, '2026-03-05': 1220, '2026-03-06': 1230,
  '2026-03-09': 1250, '2026-03-10': 1260, '2026-04-01': 1300, '2026-04-02': 1300,
};

export const $ = (x) => Math.round(x * 100); // pesos/dólares -> centavos

export async function entorno({ cotizaciones = true } = {}) {
  const pg = await crearBase();
  await pg.query("insert into configuracion values ('admin_email', 'admin@test')");
  const admin = como(pg, await crearUsuario(pg, 'admin@test'));
  const enc = como(pg, await crearUsuario(pg, 'enc@test', 'encargado'));
  if (cotizaciones) for (const [fecha, venta] of Object.entries(SERIE_PRUEBA)) await admin.rpc('cargar_cotizacion', { p_fecha: fecha, p_venta: venta });
  return { pg, admin, enc };
}

export async function obraCon(admin, rubros = ['Estructura', 'Electricidad']) {
  const obraId = await admin.rpc('crear_obra', { p: { nombre: 'Obra de prueba', fecha_inicio: '2026-03-01', rubros } });
  const r = Object.fromEntries((await admin.query('select id, nombre from rubros where obra_id = $1', [obraId])).map((x) => [x.nombre, x.id]));
  const t = Object.fromEntries((await admin.query('select id, nombre from tipos_gasto')).map((x) => [x.nombre, x.id]));
  return { obraId, r, t };
}

export async function ver(cli, obraId, q = {}) {
  const datos = await cargarDatosObra(cli, obraId);
  return calcularObra(datos, parametrosVista({ moneda: 'ARS', criterio: 'historico', corte: '2026-12-31', ...q }, datos.obra));
}
export const fila = (inf, nombre) => inf.rubros.find((x) => x.nombre === nombre);
