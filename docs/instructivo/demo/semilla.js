// Datos de EJEMPLO (ficticios) para las capturas del instructivo.
const $ = (x) => Math.round(x * 100);

// ── Imágenes ilustrativas dibujadas en el navegador ───────────────────────
function lienzo(w = 960, h = 720) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const aBlob = (c) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));

function foto(escena, semilla = 1) {
  const [c, g] = lienzo();
  const r = (() => { let s = semilla * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const cielo = g.createLinearGradient(0, 0, 0, 480);
  cielo.addColorStop(0, ['#7fb3e0', '#9cc3e6', '#f2c48d', '#8fb9de'][semilla % 4]); cielo.addColorStop(1, '#e9f1f8');
  g.fillStyle = cielo; g.fillRect(0, 0, 960, 720);
  g.fillStyle = '#b9a58a'; g.fillRect(0, 520, 960, 200);
  g.fillStyle = '#a39072'; for (let i = 0; i < 60; i++) g.fillRect(r() * 960, 520 + r() * 200, 6 + r() * 20, 3);
  const gris = (v) => `rgb(${v},${v},${v + 4})`;
  if (escena === 'estructura' || escena === 'losa') {
    const pisos = escena === 'losa' ? 2 : 3;
    for (let p = 0; p < pisos; p++) {
      g.fillStyle = gris(170 - p * 8); g.fillRect(150, 470 - p * 140, 660, 26);
      for (let k = 0; k < 5; k++) { g.fillStyle = gris(150); g.fillRect(170 + k * 150, 496 - p * 140 - 114, 26, 114); }
    }
    g.strokeStyle = '#6d5a3c'; g.lineWidth = 4;
    for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(120 + k * 52, 520); g.lineTo(120 + k * 52, 160); g.stroke(); }
    for (let y = 200; y < 520; y += 80) { g.beginPath(); g.moveTo(110, y); g.lineTo(830, y); g.stroke(); }
  } else if (escena === 'mamposteria' || escena === 'fachada') {
    g.fillStyle = escena === 'fachada' ? '#e8e2d6' : '#b5653f'; g.fillRect(170, 220, 620, 300);
    if (escena === 'mamposteria') {
      g.strokeStyle = '#d9c4b0'; g.lineWidth = 3;
      for (let y = 220; y < 520; y += 22) { g.beginPath(); g.moveTo(170, y); g.lineTo(790, y); g.stroke();
        for (let x = 170 + ((y / 22) % 2) * 25; x < 790; x += 50) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); } }
    } else {
      g.fillStyle = '#5b6b78'; [[230, 300], [430, 300], [630, 300]].forEach(([x, y]) => g.fillRect(x, y, 110, 120));
      g.fillStyle = '#3d3d3d'; g.fillRect(170, 205, 620, 18);
    }
    g.fillStyle = '#2f2f2f'; g.fillRect(140, 200, 8, 320); g.fillRect(812, 200, 8, 320);
  } else if (escena === 'electricidad' || escena === 'sanitaria') {
    g.fillStyle = '#ddd6c8'; g.fillRect(0, 0, 960, 560);
    g.fillStyle = '#c9c0ae'; g.fillRect(0, 560, 960, 160);
    g.strokeStyle = escena === 'electricidad' ? '#f2a516' : '#2a7fd4'; g.lineWidth = escena === 'electricidad' ? 10 : 22;
    g.beginPath(); g.moveTo(80, 120); g.lineTo(420, 120); g.lineTo(420, 430); g.lineTo(860, 430); g.stroke();
    g.beginPath(); g.moveTo(600, 60); g.lineTo(600, 430); g.stroke();
    g.fillStyle = escena === 'electricidad' ? '#4d4d4d' : '#9aa7b2';
    [[395, 95], [575, 405], [835, 405]].forEach(([x, y]) => g.fillRect(x, y, 50, 50));
  } else if (escena === 'pileta') {
    g.fillStyle = '#7d8b96'; g.fillRect(250, 380, 460, 160); g.fillStyle = '#5e6a73'; g.fillRect(270, 400, 420, 120);
  }
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 668, 960, 52);
  g.fillStyle = '#fff'; g.font = '600 26px sans-serif'; g.fillText('Imagen ilustrativa (ejemplo)', 24, 703);
  return aBlob(c);
}

function comprobante(titulo, lineas, total) {
  const [c, g] = lienzo(720, 960);
  g.fillStyle = '#fdfdfb'; g.fillRect(0, 0, 720, 960);
  g.fillStyle = '#222'; g.font = '700 34px sans-serif'; g.fillText(titulo, 48, 90);
  g.font = '20px sans-serif'; g.fillStyle = '#555'; g.fillText('COMPROBANTE DE EJEMPLO — sin validez fiscal', 48, 128);
  g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(48, 160); g.lineTo(672, 160); g.stroke();
  g.fillStyle = '#222'; g.font = '24px sans-serif';
  lineas.forEach(([d, v], i) => { g.fillText(d, 48, 220 + i * 50); g.fillText(v, 520, 220 + i * 50); });
  g.font = '700 30px sans-serif'; g.fillText('TOTAL ' + total, 360, 820);
  return aBlob(c);
}

// ── Cotizaciones ficticias (sólo días hábiles) ────────────────────────────
function serie(desde, hasta) {
  const out = []; const d = new Date(desde + 'T12:00:00Z'); const fin = new Date(hasta + 'T12:00:00Z');
  const total = (fin - d) / 864e5; let i = 0;
  for (; d <= fin; d.setUTCDate(d.getUTCDate() + 1), i++) {
    if ([0, 6].includes(d.getUTCDay())) continue;
    const v = 1180 + (270 * i) / total + Math.round(Math.sin(i / 3) * 6);
    out.push([d.toISOString().slice(0, 10), Math.round(v)]);
  }
  return out;
}

export async function sembrar({ pg, clienteDe }) {
  await pg.query("insert into configuracion values ('admin_email', 'admin@ejemplo.com')");
  const usuarios = {};
  const alta = async (clave, email, nombre, rol) => {
    const id = crypto.randomUUID();
    await pg.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ nombre })]);
    if (rol) await pg.query('update public.perfiles set rol = $1 where id = $2', [rol, id]);
    usuarios[clave] = { id, email, nombre };
    return clienteDe(id);
  };
  const admin = await alta('admin', 'admin@ejemplo.com', 'Laura Gómez');
  const enc = await alta('encargado', 'encargado@ejemplo.com', 'Martín Ríos', 'encargado');
  const elec = await alta('gremio', 'electricista@ejemplo.com', 'Electricidad Ruiz', 'gremio');
  const plom = await alta('plomero', 'plomero@ejemplo.com', 'Sanitarios Pérez', 'gremio');
  await alta('pendiente', 'sofia@ejemplo.com', 'Sofía Luna');

  for (const [f, v] of serie('2026-06-01', '2026-11-20')) await admin.rpc('cargar_cotizacion', { p_fecha: f, p_venta: v });

  const RUBROS = ['Movimiento de suelo', 'Estructura', 'Albañilería', 'Instalación sanitaria', 'Electricidad', 'Carpintería', 'Pintura', 'Terminaciones'];
  const obra = await admin.rpc('crear_obra', { p: { nombre: 'Casa Los Aromos', ubicacion: 'Calle 14 nº 1234, City Bell', fecha_inicio: '2026-06-01', rubros: RUBROS, encargados: [usuarios.encargado.id] } });
  const obra2 = await admin.rpc('crear_obra', { p: { nombre: 'Dúplex Gonnet', ubicacion: 'Gonnet, La Plata', fecha_inicio: '2026-09-01', rubros: ['Estructura', 'Albañilería', 'Electricidad'], encargados: [usuarios.encargado.id] } });
  await admin.rpc('crear_obra', { p: { nombre: 'Local comercial Calle 12', ubicacion: 'Calle 12 y 50, La Plata', fecha_inicio: '2027-01-15', estado: 'planificada', rubros: ['Albañilería', 'Pintura'] } });
  await admin.rpc('actualizar_usuario', { p_id: usuarios.encargado.id, p: { obras: [obra, obra2] } }).catch(() => {});

  const r = Object.fromEntries((await admin.query('select id, nombre from rubros where obra_id = $1', [obra])).map((x) => [x.nombre, x.id]));
  const r2 = Object.fromEntries((await admin.query('select id, nombre from rubros where obra_id = $1', [obra2])).map((x) => [x.nombre, x.id]));
  const t = Object.fromEntries((await admin.query('select id, nombre from tipos_gasto')).map((x) => [x.nombre, x.id]));

  const pesos = { 'Movimiento de suelo': 5, Estructura: 25, Albañilería: 20, 'Instalación sanitaria': 12, Electricidad: 12, Carpintería: 8, Pintura: 8, Terminaciones: 10 };
  await admin.rpc('definir_pesos', { p_obra: obra, p_pesos: Object.entries(pesos).map(([n, peso]) => ({ rubro_id: r[n], peso })) });
  const presup = { 'Movimiento de suelo': ['ARS', 4_500_000], Estructura: ['USD', 42_000], Albañilería: ['ARS', 28_000_000], 'Instalación sanitaria': ['ARS', 11_000_000],
    Electricidad: ['ARS', 12_500_000], Carpintería: ['USD', 9_000], Pintura: ['ARS', 6_000_000], Terminaciones: ['ARS', 15_000_000] };
  for (const [n, [moneda, imp]] of Object.entries(presup)) await admin.rpc('definir_presupuesto', { p_rubro: r[n], p: { moneda, importe: $(imp), fecha_ref: '2026-06-01' } });
  // Una revisión de presupuesto (versión 2)
  await admin.rpc('definir_presupuesto', { p_rubro: r.Electricidad, p: { moneda: 'ARS', importe: $(13_800_000), fecha_ref: '2026-09-01', vigente_desde: '2026-09-01', motivo: 'Se agregan circuitos de aire acondicionado' } }).catch((e) => console.warn(e));

  await admin.rpc('definir_pesos', { p_obra: obra2, p_pesos: [{ rubro_id: r2.Estructura, peso: 50 }, { rubro_id: r2['Albañilería'], peso: 35 }, { rubro_id: r2.Electricidad, peso: 15 }] });
  await admin.rpc('definir_presupuesto', { p_rubro: r2.Estructura, p: { moneda: 'USD', importe: $(30_000), fecha_ref: '2026-09-01' } });
  await admin.rpc('definir_presupuesto', { p_rubro: r2['Albañilería'], p: { moneda: 'ARS', importe: $(18_000_000), fecha_ref: '2026-09-01' } });
  await admin.rpc('definir_presupuesto', { p_rubro: r2.Electricidad, p: { moneda: 'ARS', importe: $(7_000_000), fecha_ref: '2026-09-01' } });

  // Archivos
  let n = 0;
  const subir = async (cli, obraId, blob, nombre) => {
    const ruta = `obra-${obraId}/demo-${++n}.jpg`;
    await cli.subir(ruta, blob);
    return cli.rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: nombre, p_mime: 'image/jpeg', p_tamano: blob.size });
  };
  const fact = await subir(admin, obra, await comprobante('Corralón El Pino', [['Hierro del 8 (barras)', '$ 1.850.000'], ['Cemento x 50 kg', '$ 1.420.000'], ['Arena y piedra', '$ 930.000']], '$ 4.200.000'), 'factura-corralon.jpg');
  const recibo = await subir(enc, obra, await comprobante('Recibo — Hormigones del Sur', [['Anticipo contrato estructura', 'US$ 8.000']], 'US$ 8.000'), 'recibo-anticipo.jpg');

  // Gastos y pagos
  const G = (cli, p) => cli.rpc('crear_gasto', { p_obra: obra, p });
  await G(enc, { fecha: '2026-06-03', concepto: 'Limpieza de terreno y volquetes', rubro_id: r['Movimiento de suelo'], tipo_id: t.Alquileres, moneda: 'ARS', importe: $(850_000), condicion: 'contado', proveedor: 'Volquetes City Bell' });
  await G(enc, { fecha: '2026-06-08', concepto: 'Excavación de bases', rubro_id: r['Movimiento de suelo'], tipo_id: t['Mano de obra'], moneda: 'ARS', importe: $(2_300_000), condicion: 'contado', proveedor: 'Movimientos Sur' });
  const est = await G(admin, { fecha: '2026-06-10', concepto: 'Contrato estructura de hormigón', rubro_id: r.Estructura, tipo_id: t.Subcontratos, moneda: 'USD', importe: $(32_000), condicion: 'contrato', proveedor: 'Hormigones del Sur SRL', anticipo: { importe: $(8_000), fecha: '2026-06-10', adjunto_id: recibo }, adjunto_id: recibo });
  await admin.rpc('registrar_pago', { p_comp: est.id, p: { fecha: '2026-07-15', moneda_pago: 'USD', importe_pagado: $(8_000), nota: 'Certificado 1' } });
  const tc = (await admin.query("select venta from cotizaciones where fecha <= '2026-08-20' order by fecha desc limit 1"))[0].venta;
  await admin.rpc('registrar_pago', { p_comp: est.id, p: { fecha: '2026-08-20', moneda_pago: 'ARS', importe_pagado: $(6_000 * (tc + 15)), importe_cancelado: $(6_000), nota: 'Certificado 2, pagado en pesos' } });
  const hierro = await G(enc, { fecha: '2026-07-01', concepto: 'Hierro, cemento y áridos', rubro_id: r.Estructura, tipo_id: t.Materiales, moneda: 'ARS', importe: $(4_200_000), condicion: 'a_cuenta', vencimiento: '2026-07-31', proveedor: 'Corralón El Pino', adjunto_id: fact });
  await enc.rpc('registrar_pago', { p_comp: hierro.id, p: { fecha: '2026-07-20', moneda_pago: 'ARS', importe_pagado: $(2_000_000) } });
  await G(enc, { fecha: '2026-07-22', concepto: 'Alquiler de andamios (julio)', rubro_id: r.Estructura, tipo_id: t.Alquileres, moneda: 'ARS', importe: $(380_000), condicion: 'contado', proveedor: 'Andamios Platenses' });
  const elecC = await G(admin, { fecha: '2026-08-05', concepto: 'Instalación eléctrica completa', rubro_id: r.Electricidad, tipo_id: t.Subcontratos, moneda: 'ARS', importe: $(9_500_000), condicion: 'contrato', proveedor: 'Electricidad Ruiz', anticipo: { importe: $(2_000_000), fecha: '2026-08-05' } });
  await admin.rpc('registrar_pago', { p_comp: elecC.id, p: { fecha: '2026-09-10', moneda_pago: 'ARS', importe_pagado: $(1_500_000) } });
  await G(enc, { fecha: '2026-08-12', concepto: 'Caños y accesorios sanitarios', rubro_id: r['Instalación sanitaria'], tipo_id: t.Materiales, moneda: 'ARS', importe: $(1_350_000), condicion: 'contado', proveedor: 'Sanitarios Centro' });
  const sanC = await G(admin, { fecha: '2026-09-01', concepto: 'Instalación sanitaria (mano de obra)', rubro_id: r['Instalación sanitaria'], tipo_id: t.Subcontratos, moneda: 'ARS', importe: $(7_800_000), condicion: 'contrato', proveedor: 'Sanitarios Pérez', anticipo: { importe: $(1_500_000), fecha: '2026-09-01' } });
  await G(enc, { fecha: '2026-09-15', concepto: 'Ladrillos huecos y cal', rubro_id: r['Albañilería'], tipo_id: t.Materiales, moneda: 'USD', importe: $(2_500), condicion: 'contado', proveedor: 'Corralón El Pino' });
  await G(enc, { fecha: '2026-09-16', concepto: 'Flete de ladrillos', rubro_id: r['Albañilería'], tipo_id: t.Fletes, moneda: 'ARS', importe: $(180_000), condicion: 'contado' });
  const mamp = await G(admin, { fecha: '2026-10-05', concepto: 'Mampostería y revoques', rubro_id: r['Albañilería'], tipo_id: t['Mano de obra'], moneda: 'ARS', importe: $(12_000_000), condicion: 'contrato', proveedor: 'Cuadrilla Gómez', anticipo: { importe: $(3_000_000), fecha: '2026-10-05' } });
  await admin.rpc('registrar_pago', { p_comp: mamp.id, p: { fecha: '2026-11-05', moneda_pago: 'ARS', importe_pagado: $(2_500_000), nota: 'Quincena 1' } });
  const dup = await G(enc, { fecha: '2026-10-20', concepto: 'Ladrillos huecos (cargado dos veces)', rubro_id: r['Albañilería'], tipo_id: t.Materiales, moneda: 'ARS', importe: $(640_000), condicion: 'contado' });
  await admin.rpc('anular_compromiso', { p_id: dup.id, p_motivo: 'Cargado dos veces por error' });
  await G(enc, { fecha: '2026-10-28', concepto: 'Permiso de obra municipal', rubro_id: r['Movimiento de suelo'], tipo_id: t.Permisos, moneda: 'ARS', importe: $(420_000), condicion: 'contado', proveedor: 'Municipalidad de La Plata' });
  await G(enc, { fecha: '2026-11-10', concepto: 'Látex, enduido y fijador', rubro_id: r.Pintura, tipo_id: t.Materiales, moneda: 'ARS', importe: $(980_000), condicion: 'a_cuenta', vencimiento: '2026-12-10', proveedor: 'Pinturerías del Bosque' });
  await G(admin, { fecha: '2026-11-12', concepto: 'Aberturas de aluminio (seña)', rubro_id: r['Carpintería'], tipo_id: t.Materiales, moneda: 'USD', importe: $(9_400), condicion: 'contrato', proveedor: 'Aberturas Línea Norte', anticipo: { importe: $(3_000), fecha: '2026-11-12' } });
  void sanC;

  // Obra 2
  await admin.rpc('crear_gasto', { p_obra: obra2, p: { fecha: '2026-09-05', concepto: 'Hormigón elaborado', rubro_id: r2.Estructura, tipo_id: t.Materiales, moneda: 'ARS', importe: $(6_200_000), condicion: 'contado', proveedor: 'Hormigones del Sur SRL' } });
  await enc.rpc('cargar_avance', { p_rubro: r2.Estructura, p: { fecha: '2026-10-30', porcentaje: 40 } });

  // Avances (oficiales, cargados por la empresa)
  const A = (n, fecha, porcentaje, extra = {}) => enc.rpc('cargar_avance', { p_rubro: r[n], p: { fecha, porcentaje, ...extra } });
  await A('Movimiento de suelo', '2026-06-20', 100, { comentario: 'Terreno nivelado y bases excavadas' });
  await A('Estructura', '2026-07-31', 35); await A('Estructura', '2026-08-31', 70); await A('Estructura', '2026-09-30', 95);
  await A('Albañilería', '2026-10-15', 20); await A('Albañilería', '2026-11-13', 45, { comentario: 'Planta baja levantada' });
  await A('Instalación sanitaria', '2026-10-10', 30);
  await A('Electricidad', '2026-09-30', 15);

  // Gremios
  await admin.rpc('asignar_rubros_gremio', { p_usuario: usuarios.gremio.id, p_rubros: [r.Electricidad] });
  await admin.rpc('asignar_rubros_gremio', { p_usuario: usuarios.plomero.id, p_rubros: [r['Instalación sanitaria']] });
  const fe1 = await subir(elec, obra, await foto('electricidad', 2), 'canerias-pb.jpg');
  const p1 = await elec.rpc('crear_parte_avance', { p_rubro: r.Electricidad, p: { fecha: '2026-10-20', porcentaje: 35, comentario: 'Cañerías de planta baja terminadas', fotos: [fe1] } });
  await admin.rpc('revisar_parte', { p_parte: p1.id, p_aprobar: true });
  const fe2 = await subir(elec, obra, await foto('electricidad', 5), 'cableado-pa.jpg');
  const fe3 = await subir(elec, obra, await foto('electricidad', 7), 'tablero.jpg');
  await elec.rpc('crear_parte_avance', { p_rubro: r.Electricidad, p: { fecha: '2026-11-18', porcentaje: 55, comentario: 'Cableado de planta alta y tablero principal', fotos: [fe2, fe3] } });
  const fp1 = await subir(plom, obra, await foto('sanitaria', 3), 'banio-pb.jpg');
  const p3 = await plom.rpc('crear_parte_avance', { p_rubro: r['Instalación sanitaria'], p: { fecha: '2026-11-02', porcentaje: 70, comentario: 'Baño de planta baja y cocina', fotos: [fp1] } });
  await admin.rpc('revisar_parte', { p_parte: p3.id, p_aprobar: false, p_motivo: 'Falta la prueba hidráulica de la cocina; volvé a mandarlo cuando esté hecha.' });
  await plom.rpc('crear_parte_avance', { p_rubro: r['Instalación sanitaria'], p: { fecha: '2026-11-17', porcentaje: 60, comentario: 'Baño PB y cocina con prueba hidráulica' } });

  // Reclamos
  const fr = await subir(elec, obra, await foto('electricidad', 9), 'falta-cajas.jpg');
  const rc1 = await elec.rpc('crear_reclamo', { p_obra: obra, p: { rubro_id: r.Electricidad, titulo: 'Faltan cajas rectangulares', descripcion: 'No llegaron las 40 cajas para planta alta. Sin eso no puedo seguir con los tomas.', fotos: [fr] } });
  await admin.rpc('responder_reclamo', { p_reclamo: rc1.id, p: { texto: 'Ya están pedidas al corralón, llegan el jueves.', estado: 'en_curso' } });
  await elec.rpc('responder_reclamo', { p_reclamo: rc1.id, p: { texto: 'Perfecto, quedo atento.' } });
  await admin.rpc('crear_reclamo', { p_obra: obra, p: { gremio_id: usuarios.plomero.id, rubro_id: r['Instalación sanitaria'], titulo: 'Pérdida en el baño de planta baja', descripcion: 'Se ve humedad debajo del lavatorio. Por favor revisar la conexión.' } });
  const rc3 = await plom.rpc('crear_reclamo', { p_obra: obra, p: { rubro_id: r['Instalación sanitaria'], titulo: 'Necesito acceso a la cocina el lunes', descripcion: 'Para hacer la prueba hidráulica.' } });
  await admin.rpc('responder_reclamo', { p_reclamo: rc3.id, p: { texto: 'Listo, el lunes está libre.', estado: 'resuelto' } });

  // Galería de la empresa
  const g1 = await subir(enc, obra, await foto('estructura', 1), 'estructura-agosto.jpg');
  const g2 = await subir(enc, obra, await foto('losa', 4), 'losa-pa.jpg');
  await enc.rpc('agregar_fotos', { p_obra: obra, p: { rubro_id: r.Estructura, fecha: '2026-09-28', descripcion: 'Estructura terminada', fotos: [g1, g2] } });
  const g3 = await subir(enc, obra, await foto('mamposteria', 6), 'mamposteria.jpg');
  await enc.rpc('agregar_fotos', { p_obra: obra, p: { rubro_id: r['Albañilería'], fecha: '2026-11-13', descripcion: 'Mampostería de planta baja', fotos: [g3] } });
  const g4 = await subir(admin, obra, await foto('fachada', 8), 'fachada.jpg');
  await admin.rpc('agregar_fotos', { p_obra: obra, p: { fecha: '2026-11-19', descripcion: 'Vista del frente', fotos: [g4] } });

  // ── Portal del cliente ──
  await admin.rpc('definir_datos_portal', { p_obra: obra, p: { latitud: -34.8695, longitud: -58.0553, fecha_fin_prevista: '2027-04-30' } });
  const cliente = await alta('cliente', 'cliente@ejemplo.com', 'Familia Fernández', 'cliente');
  await admin.rpc('asignar_obras_cliente', { p_usuario: usuarios.cliente.id, p_obras: [obra] });
  // Fotos de la galería que la empresa eligió mostrar al cliente
  for (const f of await admin.query("select id from fotos where obra_id = $1 and descripcion in ('Estructura terminada', 'Vista del frente')", [obra])) {
    await admin.rpc('marcar_foto_cliente', { p_foto: f.id, p_visible: true });
  }
  // Parte diario: días hábiles desde el inicio, con algunos días de lluvia
  const lluviosos = new Set(['2026-06-15', '2026-06-16', '2026-07-08', '2026-08-03', '2026-08-04', '2026-08-21', '2026-09-10', '2026-09-24', '2026-10-06',
    '2026-10-07', '2026-10-27', '2026-11-03', '2026-11-14', '2026-11-17', '2026-11-20']);
  const parciales = new Set(['2026-06-17', '2026-08-05', '2026-10-08', '2026-11-18']);
  for (let d = new Date('2026-06-01T12:00:00Z'); d <= new Date('2026-11-20T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if ([0, 6].includes(d.getUTCDay())) continue;
    const fecha = d.toISOString().slice(0, 10);
    const llueve = lluviosos.has(fecha), parcial = parciales.has(fecha);
    await enc.rpc('guardar_parte_diario', { p_obra: obra, p: { fecha,
      clima: llueve ? (fecha === '2026-11-17' ? 'tormenta' : 'lluvia') : parcial ? 'nublado' : (d.getUTCDate() % 4 === 0 ? 'nublado' : 'sol'),
      trabajo: llueve ? 'no' : parcial ? 'parcial' : 'normal', personal: llueve ? 0 : parcial ? 3 : 5 + (d.getUTCDate() % 4),
      comentario: llueve ? 'Suspendido por lluvia' : null } });
  }
  // Novedades publicadas para el cliente
  const nv1 = await subir(enc, obra, await foto('losa', 11), 'losa-terminada.jpg');
  await enc.rpc('crear_novedad', { p_obra: obra, p: { fecha: '2026-09-30', titulo: 'Terminamos la estructura de hormigón',
    texto: 'Se completaron las losas de planta baja y planta alta. La semana próxima empezamos con la mampostería.', fotos: [nv1] } });
  const nv2 = await subir(enc, obra, await foto('mamposteria', 12), 'muros-pb.jpg');
  await enc.rpc('crear_novedad', { p_obra: obra, p: { fecha: '2026-11-13', titulo: 'Avanzamos con los muros de planta baja',
    texto: 'Ya está levantada la mampostería de planta baja. En paralelo, el electricista y el plomero hacen las cañerías.', fotos: [nv2] } });
  await enc.rpc('crear_novedad', { p_obra: obra, p: { fecha: '2026-11-18', titulo: 'Días de lluvia',
    texto: 'Las lluvias del 14 y del 17 de noviembre nos obligaron a suspender dos días de trabajo. Recuperamos parte del tiempo el sábado.' } });
  await enc.rpc('crear_novedad', { p_obra: obra, p: { fecha: '2026-11-19', titulo: 'Revisar pedido de aberturas', texto: 'Nota interna para el equipo.', visible_cliente: false } });
  // Consulta del cliente y respuesta de la empresa
  const cq = await cliente.rpc('crear_reclamo', { p_obra: obra, p: { titulo: '¿Cuándo colocan las aberturas?', descripcion: 'Queremos saber para coordinar la mudanza.' } });
  await admin.rpc('responder_reclamo', { p_reclamo: cq.id, p: { texto: 'Las aberturas están pedidas; calculamos colocarlas en la segunda quincena de diciembre.', estado: 'en_curso' } });

  return usuarios;
}
