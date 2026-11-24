// Portal de clientes: el cliente ve sólo SU obra (avance, días, novedades y fotos elegidas), nunca importes ni datos internos.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, $ } from './helpers.js';
import { como, crearUsuario } from './db.js';

let ctx, O, B, cli, otro, gremio;
const subir = async (c, obraId, nombre) => {
  const ruta = `obra-${obraId}/${nombre}`;
  await c.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [ruta]);
  return c.rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: nombre, p_mime: 'image/jpeg', p_tamano: 10 });
};

before(async () => {
  ctx = await entorno();
  const { pg, admin } = ctx;
  O = await obraCon(admin);
  B = await obraCon(admin, ['Pintura']);
  cli = como(pg, await crearUsuario(pg, 'cliente@test', 'cliente'));
  otro = como(pg, await crearUsuario(pg, 'otro-cliente@test', 'cliente'));
  gremio = como(pg, await crearUsuario(pg, 'gremio@test', 'gremio'));
  await admin.rpc('asignar_obras_cliente', { p_usuario: cli.id, p_obras: [O.obraId] });
  await admin.rpc('asignar_obras_cliente', { p_usuario: otro.id, p_obras: [B.obraId] });
  await admin.rpc('asignar_rubros_gremio', { p_usuario: gremio.id, p_rubros: [O.r.Electricidad] });
  // Datos de la empresa que el cliente NO debe ver
  await admin.rpc('definir_presupuesto', { p_rubro: O.r.Estructura, p: { moneda: 'ARS', importe: $(5000), fecha_ref: '2026-03-02' } });
  await admin.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha: '2026-03-02', concepto: 'Hierro', rubro_id: O.r.Estructura, tipo_id: O.t.Materiales,
    moneda: 'ARS', importe: $(1234), condicion: 'contado', proveedor: 'Corralón Secreto' } });
  await admin.rpc('definir_pesos', { p_obra: O.obraId, p_pesos: [{ rubro_id: O.r.Estructura, peso: 60 }, { rubro_id: O.r.Electricidad, peso: 40 }] });
  await admin.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: '2026-03-05', porcentaje: 50 } });
  await admin.rpc('cargar_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2026-03-05', porcentaje: 25 } });
});

test('el cliente sólo ve su obra y ninguna tabla interna', async () => {
  assert.deepEqual((await cli.query('select id from obras')).map((x) => x.id), [O.obraId]);
  for (const t of ['compromisos', 'pagos', 'presupuestos', 'avances', 'rubros', 'proveedores', 'auditoria', 'cotizaciones',
    'partes_avance', 'gremio_rubros', 'partes_diarios', 'tipos_gasto', 'obra_usuarios']) {
    assert.equal((await cli.query(`select * from ${t}`)).length, 0, t);
  }
  await assert.rejects(() => cli.rpc('crear_gasto', { p_obra: O.obraId, p: {} }), /acceso|habilitado/);
  await assert.rejects(() => cli.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: '2026-03-06', porcentaje: 60 } }), /acceso|habilitado/);
  await assert.rejects(() => cli.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2026-03-06', clima: 'sol', trabajo: 'normal' } }), /acceso/);
  await assert.rejects(() => cli.rpc('portal_obra', { p_obra: B.obraId }), /acceso/);
});

test('portal: avance general ponderado, por rubro y evolución, sin importes', async () => {
  const p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.equal(p.obra.nombre, 'Obra de prueba');
  assert.equal(Number(p.avance_general), 40); // 60 % de 50 + 40 % de 25
  assert.deepEqual(p.rubros.map((r) => [r.nombre, r.avance]), [['Estructura', 50], ['Electricidad', 25]]);
  assert.equal(Number(p.serie.at(-1).avance), 40);
  assert.equal(Number(p.serie[0].avance), 40, 'fin de marzo ya tiene los avances del 5/3');
  const texto = JSON.stringify(p);
  for (const prohibido of ['importe', 'Corralón Secreto', 'Hierro', 'presupuesto', '123400', 'gremio@test']) {
    assert.ok(!texto.includes(prohibido), `el portal no debe incluir "${prohibido}"`);
  }
  // Sin pesos completos no se inventa un número
  await ctx.admin.rpc('definir_pesos', { p_obra: O.obraId, p_pesos: [{ rubro_id: O.r.Electricidad, peso: null }] });
  assert.equal((await cli.rpc('portal_obra', { p_obra: O.obraId })).avance_general, null);
  await ctx.admin.rpc('definir_pesos', { p_obra: O.obraId, p_pesos: [{ rubro_id: O.r.Electricidad, peso: 40 }] });
});

test('parte diario: un registro por día; el cliente ve clima y trabajo, no el comentario interno', async () => {
  const { admin } = ctx;
  await admin.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2026-03-10', clima: 'sol', trabajo: 'normal', personal: 6 } });
  await admin.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2026-03-10', clima: 'lluvia', trabajo: 'no', comentario: 'Faltó el capataz' } });
  await admin.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2026-03-11', clima: 'nublado', trabajo: 'parcial', personal: 3 } });
  await assert.rejects(() => admin.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2026-03-12', clima: 'granizo', trabajo: 'no' } }), /clima/);
  await assert.rejects(() => admin.rpc('guardar_parte_diario', { p_obra: O.obraId, p: { fecha: '2099-01-01', clima: 'sol', trabajo: 'no' } }), /futura/);
  const p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.deepEqual(p.dias.map((d) => [d.fecha, d.clima, d.trabajo]), [['2026-03-10', 'lluvia', 'no'], ['2026-03-11', 'nublado', 'parcial']]);
  assert.ok(!JSON.stringify(p).includes('capataz'), 'el comentario es interno');
});

test('novedades y fotos: el cliente ve sólo lo publicado y lo marcado como visible', async () => {
  const { admin } = ctx;
  const interna = await subir(admin, O.obraId, 'interna.jpg');
  await admin.rpc('agregar_fotos', { p_obra: O.obraId, p: { descripcion: 'Foto interna', fotos: [interna] } });
  let p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.equal(p.fotos.length, 0, 'por defecto las fotos no se muestran al cliente');
  assert.equal((await cli.query("select * from storage.objects where name like '%interna.jpg'")).length, 0);
  const [f] = await admin.query('select id from fotos where descripcion = $1', ['Foto interna']);
  await admin.rpc('marcar_foto_cliente', { p_foto: f.id, p_visible: true });
  p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.equal(p.fotos.length, 1);
  assert.equal((await cli.query("select * from storage.objects where name like '%interna.jpg'")).length, 1, 'puede abrir el archivo');
  assert.equal((await otro.query("select * from storage.objects where name like '%interna.jpg'")).length, 0, 'otro cliente no');
  await assert.rejects(() => cli.rpc('marcar_foto_cliente', { p_foto: f.id, p_visible: false }), /acceso/);

  const losa = await subir(admin, O.obraId, 'losa.jpg');
  const nv = await admin.rpc('crear_novedad', { p_obra: O.obraId, p: { fecha: '2026-03-12', titulo: 'Hormigonamos la losa', texto: 'Quedó lista.', fotos: [losa] } });
  await admin.rpc('crear_novedad', { p_obra: O.obraId, p: { fecha: '2026-03-12', titulo: 'Nota interna', visible_cliente: false } });
  p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.deepEqual(p.novedades.map((n) => n.titulo), ['Hormigonamos la losa']);
  assert.equal(p.fotos.filter((x) => x.novedad_id === nv.id).length, 1, 'las fotos de la novedad se ven');
  assert.deepEqual((await cli.query('select titulo from novedades')).map((x) => x.titulo), ['Hormigonamos la losa']);
  await admin.rpc('anular_novedad', { p_id: nv.id });
  p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.equal(p.novedades.length, 0);
  assert.equal(p.fotos.filter((x) => x.novedad_id === nv.id).length, 0, 'al anular la novedad, sus fotos dejan de verse');
});

test('consultas: cliente ↔ empresa; ni el gremio ni otros clientes las ven', async () => {
  const { admin } = ctx;
  const foto = await subir(cli, O.obraId, 'grieta.jpg');
  const c1 = await cli.rpc('crear_reclamo', { p_obra: O.obraId, p: { titulo: '¿Cuándo terminan la losa?', fotos: [foto] } });
  await assert.rejects(() => cli.rpc('crear_reclamo', { p_obra: B.obraId, p: { titulo: 'x' } }), /acceso/);
  const [r] = await admin.query('select direccion, cliente_id from reclamos where id = $1', [c1.id]);
  assert.equal(r.direccion, 'cliente_a_empresa');
  assert.equal(r.cliente_id, cli.id);
  await admin.rpc('responder_reclamo', { p_reclamo: c1.id, p: { texto: 'La semana próxima', estado: 'resuelto' } });
  assert.equal((await cli.query('select * from reclamo_mensajes')).length, 1);
  assert.equal((await gremio.query('select * from reclamos where id = $1', [c1.id])).length, 0);
  assert.equal((await otro.query('select * from reclamos')).length, 0);
  assert.equal((await cli.query("select * from storage.objects where name like '%grieta.jpg'")).length, 1);
  const c2 = await admin.rpc('crear_reclamo', { p_obra: O.obraId, p: { cliente_id: cli.id, titulo: 'Necesitamos que elija los cerámicos' } });
  await assert.rejects(() => admin.rpc('crear_reclamo', { p_obra: O.obraId, p: { cliente_id: otro.id, titulo: 'x' } }), /cliente de esta obra/);
  assert.deepEqual((await cli.query('select id, direccion from reclamos order by id')).map((x) => x.direccion), ['cliente_a_empresa', 'empresa_a_cliente']);
  assert.ok(c2.id);
  // El cliente no puede subir PDF ni archivos a otra obra
  await assert.rejects(() => cli.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [`obra-${B.obraId}/x.jpg`]), /row-level security/);
});

test('administración: sólo el admin asigna obras al cliente y define ubicación; eliminar la obra limpia todo', async () => {
  const { admin, enc, pg } = ctx;
  await assert.rejects(() => enc.rpc('asignar_obras_cliente', { p_usuario: cli.id, p_obras: [O.obraId] }), /administrador/);
  await assert.rejects(() => admin.rpc('asignar_obras_cliente', { p_usuario: gremio.id, p_obras: [O.obraId] }), /no es un cliente/);
  await admin.rpc('definir_datos_portal', { p_obra: O.obraId, p: { latitud: -34.88, longitud: -58.05, fecha_fin_prevista: '2026-12-20' } });
  await assert.rejects(() => admin.rpc('definir_datos_portal', { p_obra: O.obraId, p: { latitud: -34.88 } }), /latitud y longitud/);
  const p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.equal(p.obra.latitud, -34.88);
  assert.equal(p.obra.fecha_fin_prevista, '2026-12-20');
  const nombre = (await admin.query('select nombre from obras where id = $1', [O.obraId]))[0].nombre;
  await admin.rpc('eliminar_obra', { p_obra: O.obraId, p_confirmacion: nombre });
  for (const t of ['obra_clientes', 'partes_diarios', 'novedades', 'fotos', 'reclamos']) {
    assert.equal((await pg.query(`select count(*)::int n from ${t} where obra_id = $1`, [O.obraId])).rows[0].n, 0, t);
  }
});
