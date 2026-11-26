// AGENTE DE DEMOSTRACIÓN: opera ControlAr de punta a punta, como lo harían la empresa, los gremios y el cliente,
// en la copia de prueba (app de demo con datos ficticios en memoria; no toca la app real ni manda emails).
// Todo pasa en UNA sesión del navegador (la base de demo vive en la página): cada rol entra y sale por la pantalla de ingreso.
// Deja los cuadros del video en docs/instructivo/capturas/O*.png y un registro de lo que hizo en agente/registro.txt.
// Uso (con el servidor de demo en marcha, "controlar-demo" en el puerto 5199): node docs/instructivo/agente/obra-completa.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirEdge, espera } from '../lib/edge.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAPTURAS = path.join(AQUI, '..', 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const BASE = 'http://localhost:5199/';
const q = JSON.stringify;
const registro = [];
const log = (t) => { const l = `${new Date().toLocaleTimeString('es-AR')} · ${t}`; registro.push(l); console.log(l); };

const { cdp, js, cerrar } = await abrirEdge({ puertoBase: 9700 });

// ── Pantalla y cuadros ──────────────────────────────────────────────────────
async function pantalla(w, h, movil = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: movil });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: movil });
  await espera(500);
}
const ESCRITORIO = () => pantalla(1280, 800);
const CELULAR = () => pantalla(390, 844, true);

/** Saca un cuadro: la pantalla visible, o una hoja (formulario) completa si hoja = true. */
async function cuadro(nombre, { hoja = false } = {}) {
  await espera(450);
  // Para el video: sin avisos sueltos del paso anterior y con la dirección real de la app en los textos.
  await js(`(document.querySelectorAll('.toasts .toast').forEach((t) => { t.style.display = 'none'; }), (() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue.includes('localhost')) n.nodeValue = n.nodeValue.replace(/http:\\/\\/localhost:\\d+\\/(\\?demo=\\w+)?/g, 'https://andorinas.github.io/'); return true; })())`);
  let clip;
  if (hoja) {
    const prev = await js('({ w: innerWidth, h: innerHeight })');
    if (prev.w >= 600) { await cdp('Emulation.setDeviceMetricsOverride', { width: prev.w, height: 1800, deviceScaleFactor: 2, mobile: false }); await espera(600); }
    clip = await js(`(() => { const e = [...document.querySelectorAll('.sheet')].pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 1800), scale: 1 }; })()`);
    const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), Buffer.from(r.data, 'base64'));
    if (prev.w >= 600) { await cdp('Emulation.setDeviceMetricsOverride', { width: prev.w, height: prev.h, deviceScaleFactor: 2, mobile: false }); await espera(400); }
  } else {
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), Buffer.from(r.data, 'base64'));
  }
  log(`cuadro ${nombre}`);
}
/** Señala un elemento, saca el cuadro y lo toca: así en el video se ve qué hace el agente. */
async function tocar(texto, { sel, foto } = {}) {
  await js(`apuntar(${q(texto)}, ${q(sel)})`);
  if (foto) await cuadro(foto);
  await js(`(soltar(), clic(${q(texto)}, ${q(sel)}))`);
  await espera(500);
}
const esperarTexto = (t, ms = 30000) => js(`hasta(() => hay(${q(t)}), ${ms})`);
const ir = async (hash, texto) => { await js(`(location.hash = ${q(hash)}, true)`); if (texto) await esperarTexto(texto); await espera(900); };
const cerrarHoja = async () => { await js(`(document.querySelector('.sheet [aria-label=Cerrar]')?.click(), true)`); await espera(400); };
const toast = () => js(`[...document.querySelectorAll('.toasts .toast')].pop()?.innerText || ''`);
async function sinError(paso) {
  const e = await js(`[...document.querySelectorAll('.aviso-error')].filter(visible).map((x) => x.innerText).join(' | ')`);
  if (e) throw new Error(`${paso}: la app mostró un error → ${e}`);
}

// ── Ingreso y salida ────────────────────────────────────────────────────────
const CLAVE = 'demo-1234'; // la demo no verifica contraseñas
async function ingresar(perfil, email, { fotoPortada, fotoForm } = {}) {
  await js(`hasta(() => hay('¿Cómo querés ingresar?') || hay('Cambiar tipo de ingreso'))`);
  if (await js(`hay('Cambiar tipo de ingreso')`)) { await js(`clic('Cambiar tipo de ingreso')`); await espera(300); }
  await tocar(perfil, { sel: 'button', foto: fotoPortada });
  await js(`(llenar('Email', ${q(email)}), llenar('Contraseña', ${q(CLAVE)}))`);
  if (fotoForm) await cuadro(fotoForm);
  await js(`(clic('Ingresar', 'button.btn-primario'), true)`);
  await js(`hasta(() => !hay('¿Cómo querés ingresar?') && !document.querySelector('.login-form input[type=password]'))`);
  await espera(1500);
  log(`ingresó ${email} (${perfil})`);
}
async function registrarse(perfil, nombre, email, { fotoForm, fotoPendiente } = {}) {
  await js(`hasta(() => hay('¿Cómo querés ingresar?') || hay('Cambiar tipo de ingreso'))`);
  if (await js(`hay('Cambiar tipo de ingreso')`)) { await js(`clic('Cambiar tipo de ingreso')`); await espera(300); }
  await js(`clic(${q(perfil)}, 'button')`); await espera(300);
  await js(`clic('Crear cuenta', '[role=radio]')`); await espera(300);
  await js(`(llenar('Nombre y apellido', ${q(nombre)}), llenar('Email', ${q(email)}), llenar('Contraseña', ${q(CLAVE)}))`);
  if (fotoForm) await cuadro(fotoForm);
  await js(`(clic('Crear cuenta', 'button.btn-primario'), true)`);
  await esperarTexto('Te enviamos un email');
  log(`se registró ${nombre} <${email}>`);
  await js(`(llenar('Contraseña', ${q(CLAVE)}), clic('Ingresar', 'button.btn-primario'))`);
  await esperarTexto('pendiente de habilitación'); await espera(600);
  if (fotoPendiente) await cuadro(fotoPendiente);
  await js(`clic('Salir', 'button')`); await espera(800);
}
async function salir() { await js(`clic('Salir', 'button')`); await espera(1000); log('salió'); }

// ── Formularios de la obra ──────────────────────────────────────────────────
async function gasto({ condicion, fecha, concepto, rubro, tipo, importe, proveedor, anticipo, comprobante, foto }) {
  await js(`clic('＋ Agregar gasto')`); await esperarTexto('Condición de pago');
  await js(`clic(${q(condicion)}, '[role=radio]')`); await espera(300);
  await js(`(llenar('Fecha', ${q(fecha)}), llenar('Concepto', ${q(concepto)}), llenar('Rubro de obra', ${q(rubro)}), llenar('Tipo de gasto', ${q(tipo)}))`);
  await js(`llenar(${q(condicion === 'Contado' ? 'Importe' : 'Importe acordado')}, ${q(importe)})`);
  if (proveedor) await js(`llenar('Proveedor', ${q(proveedor)})`);
  if (anticipo) await js(`llenar('Anticipo', ${q(anticipo)})`);
  if (comprobante) await js(`(async () => adjuntar([[await window.__demo.comprobante(${q(comprobante[0])}, ${q(comprobante[1])}, ${q(comprobante[2])}), 'comprobante.jpg']]))()`);
  await espera(900);
  if (foto) await cuadro(foto, { hoja: true });
  await js(`clic('Guardar gasto', 'button')`);
  await js(`hasta(() => !document.querySelector('.sheet') || [...document.querySelectorAll('.aviso-error')].some(visible))`);
  await sinError(`Gasto "${concepto}"`);
  log(`gasto: ${concepto} · ${importe} · ${await toast()}`);
  await espera(800);
}
async function pago({ compra, fecha, monto, nota, foto, fotoConfirmar }) {
  await js(`clic('$ Registrar pago')`); await esperarTexto('Elegí la compra');
  await js(`hasta(() => buscar(${q(compra)}, '.sheet li button'))`);
  await js(`clic(${q(compra)}, '.sheet li button')`); await esperarTexto('Dinero entregado');
  await js(`(llenar('Fecha del pago', ${q(fecha)}), llenar('Dinero entregado', ${q(monto)}))`);
  if (nota) await js(`llenar('Nota', ${q(nota)})`);
  await espera(600);
  if (foto) await cuadro(foto, { hoja: true });
  await js(`clic('Revisar pago', 'button')`); await esperarTexto('Revisá antes de confirmar');
  if (fotoConfirmar) await cuadro(fotoConfirmar, { hoja: true });
  await js(`clic('Confirmar pago', 'button')`);
  await js(`hasta(() => !document.querySelector('.sheet') || [...document.querySelectorAll('.aviso-error')].some(visible))`);
  await sinError(`Pago de "${compra}"`);
  log(`pago: ${compra} · ${monto} · ${await toast()}`);
  await espera(800);
}
async function avance({ rubro, fecha, pct, comentario, foto }) {
  await js(`clic('▲ Cargar avance')`); await esperarTexto('Avance acumulado');
  await js(`(llenar('Rubro', ${q(rubro)}), llenar('Avance acumulado (%)', ${q(String(pct))}), llenar('Fecha', ${q(fecha)}))`);
  if (comentario) await js(`llenar('Comentario', ${q(comentario)})`);
  await espera(500);
  if (foto) await cuadro(foto, { hoja: true });
  await js(`clic('Guardar avance', 'button')`);
  await js(`hasta(() => !document.querySelector('.sheet') || [...document.querySelectorAll('.aviso-error')].some(visible))`);
  await sinError(`Avance ${rubro}`);
  log(`avance: ${rubro} ${pct} % al ${fecha}`);
  await espera(700);
}
async function parteDiario({ fecha, clima, trabajo, personal, comentario }) {
  await js(`llenar('Día', ${q(fecha)})`); await espera(500);
  await js(`clic(${q(clima)}, '[role=radio]')`);
  await js(`clic(${q(trabajo)}, '[role=radio]')`);
  if (personal != null) await js(`llenar('Personal en obra', ${q(String(personal))})`);
  if (comentario) await js(`llenar('Comentario interno', ${q(comentario)})`);
  await js(`clic('Guardar parte', 'button')`); await espera(1200);
  await sinError(`Parte diario ${fecha}`);
  log(`parte diario ${fecha}: ${clima} · ${trabajo}`);
}
const fotosEjemplo = (lista) => `Promise.all(${q(lista)}.map(async ([escena, semilla, nombre]) => [await window.__demo.foto(escena, semilla), nombre]))`;

// ════════════════════════════════════════════════════════════════════════════
try {
  await ESCRITORIO();
  await cdp('Page.navigate', { url: `${BASE}?demo=ninguno#/` });
  await espera(800);
  await js(`hasta(() => window.__demo?.listo && !document.querySelector('.cargando-pantalla'), 120000)`);
  await js(`(localStorage.removeItem('perfil-ingreso'), true)`);
  await espera(1200);
  log('Copia de prueba lista (datos ficticios en memoria).');

  // ── 1. La empresa crea la obra ────────────────────────────────────────────
  await ingresar('Administración de obra', 'admin@ejemplo.com', { fotoPortada: 'O01-portada', fotoForm: 'O02-ingreso-admin' });
  await esperarTexto('Obras');
  await tocar('+ Nueva obra', { foto: 'O03-obras' });
  await esperarTexto('Rubros de la obra');
  await js(`(llenar('Nombre de la obra', 'Casa Las Acacias'), llenar('Ubicación', 'Calle 470 nº 2150, City Bell'), llenar('Fecha de inicio', '01/09/2026'))`);
  await js(`(() => { const l = [...document.querySelectorAll('label.check')].find((x) => x.innerText.includes('Martín Ríos')); if (l && !l.querySelector('input').checked) l.querySelector('input').click(); return true; })()`);
  await espera(500);
  await js(`(document.querySelector('form.form').scrollIntoView({ block: 'start' }), true)`);
  await cuadro('O04-nueva-obra');
  await tocar('Crear obra', { sel: 'button' });
  await js(`hasta(() => /#\\/obras\\/\\d+/.test(location.hash))`);
  const obraId = await js(`Number(location.hash.match(/obras\\/(\\d+)/)[1])`);
  const rubros = await js(`(await (async () => { await hasta(() => hay('¿Cuánto avanzó')); return [...document.querySelectorAll('.lista-avance strong, .tabla-rubros td:first-child')].map((x) => x.innerText); })())`).catch(() => []);
  log(`obra creada: Casa Las Acacias (id ${obraId})`);
  await espera(1200); await cuadro('O05-obra-creada');

  // Presupuestos y datos del portal
  await ir(`#/obras/${obraId}/configuracion`, 'Presupuesto por rubro');
  const PRES = [['Movimiento de suelo', '1.800.000'], ['Estructura', '24.000.000'], ['Albañilería', '16.500.000'], ['Instalación sanitaria', '6.200.000'], ['Electricidad', '5.800.000']];
  for (const [rubro, importe] of PRES) {
    await js(`(() => { const li = [...document.querySelectorAll('.pres-rubro')].find((x) => x.querySelector('strong')?.innerText === ${q(rubro)}); if (!li) throw new Error('Sin rubro ${rubro}'); li.querySelector('button.btn-sec').click(); return true; })()`);
    await espera(400);
    await js(`(() => { const li = [...document.querySelectorAll('.pres-rubro')].find((x) => x.querySelector('strong')?.innerText === ${q(rubro)}); const f = li.querySelector('form'); poner(campo('Importe', f), ${q(importe)}); poner(campo('Fecha de referencia', f).closest('.fecha-input').querySelector('input'), '01/09/2026'); return true; })()`);
    await espera(300);
    if (rubro === 'Estructura') await cuadro('O06-presupuesto');
    await js(`(() => { const li = [...document.querySelectorAll('.pres-rubro')].find((x) => x.querySelector('strong')?.innerText === ${q(rubro)}); li.querySelector('form button.btn-primario').click(); return true; })()`);
    await js(`hasta(() => ![...document.querySelectorAll('.pres-rubro')].find((x) => x.querySelector('strong')?.innerText === ${q(rubro)})?.querySelector('form'))`);
    log(`presupuesto ${rubro}: ARS ${importe}`);
    await espera(400);
  }
  await js(`(() => { const s = [...document.querySelectorAll('section.panel')].find((x) => x.innerText.startsWith('Portal del cliente')); s.scrollIntoView({ block: 'center' }); return true; })()`);
  await js(`(llenar('Ubicación (coordenadas)', '-34.8738, -58.0614'), llenar('Entrega prevista', '30/06/2027'))`);
  await espera(400); await cuadro('O07-portal-config');
  await js(`(() => { const s = [...document.querySelectorAll('section.panel')].find((x) => x.innerText.startsWith('Portal del cliente')); s.querySelector('button.btn-primario').click(); return true; })()`);
  await espera(1200); await sinError('Datos del portal'); log('portal del cliente: ubicación y entrega prevista cargadas');

  // Pesos y plan de obra
  await ir(`#/obras/${obraId}/avance`, 'Peso de cada rubro');
  const PESOS = { 'Movimiento de suelo': 5, Estructura: 30, Albañilería: 22, 'Instalación sanitaria': 10, Electricidad: 10, Carpintería: 8, Pintura: 7, Terminaciones: 8 };
  const nombresRubros = await js(`[...document.querySelectorAll('.lista-pesos li > span:first-child')].map((x) => x.innerText)`);
  log(`rubros de la obra: ${nombresRubros.join(', ')}`);
  for (const n of nombresRubros) await js(`poner(document.querySelector('input[aria-label="Peso ${n}"]'), ${q(String(PESOS[n] ?? 0))})`);
  await espera(400);
  await js(`(() => { const s = [...document.querySelectorAll('section.panel')].find((x) => x.innerText.startsWith('Peso de cada rubro')); s.scrollIntoView({ block: 'center' }); return true; })()`);
  await cuadro('O08-pesos');
  await js(`clic('Guardar pesos', 'button')`); await espera(1200); await sinError('Pesos'); log(`pesos: ${await toast()}`);
  const PLAN = { 'Movimiento de suelo': ['01/09/2026', '20/09/2026'], Estructura: ['15/09/2026', '15/12/2026'], Albañilería: ['15/10/2026', '28/02/2027'],
    'Instalación sanitaria': ['01/11/2026', '31/03/2027'], Electricidad: ['01/11/2026', '15/04/2027'], Carpintería: ['01/03/2027', '30/04/2027'],
    Pintura: ['15/04/2027', '31/05/2027'], Terminaciones: ['01/05/2027', '30/06/2027'] };
  await js(`hasta(() => hay('Plan de obra'))`);
  for (const n of nombresRubros) {
    const [ini, fin] = PLAN[n] || ['01/05/2027', '30/06/2027'];
    await js(`(() => { const li = [...document.querySelectorAll('.lista-plan li')].find((x) => x.querySelector('strong')?.innerText === ${q(n)}); const ins = li.querySelectorAll('.fecha-input input[placeholder]'); poner(ins[0], ${q(ini)}); poner(ins[1], ${q(fin)}); return true; })()`);
  }
  await espera(500);
  await js(`clic('Guardar plan', 'button')`); await espera(1500); await sinError('Plan de obra');
  await js(`(document.querySelector('.gantt').scrollIntoView({ block: 'center' }), true)`); await espera(500);
  await cuadro('O09-plan-cronograma'); log('plan de obra guardado');
  await salir();

  // ── 2. El gremio y el cliente crean su cuenta ─────────────────────────────
  await registrarse('Soy proveedor o gremio', 'Electricidad Sur', 'electricidad.sur@ejemplo.com', { fotoForm: 'O10-alta-gremio', fotoPendiente: 'O11-gremio-pendiente' });
  await registrarse('Soy cliente', 'Familia Benítez', 'familia.benitez@ejemplo.com', { fotoForm: 'O12-alta-cliente' });

  // ── 3. La empresa los habilita ────────────────────────────────────────────
  await ingresar('Administración de obra', 'admin@ejemplo.com');
  await ir('#/usuarios', 'Esperando habilitación');
  await cuadro('O13-usuarios-pendientes');
  const habilitar = async (nombre, boton) => {
    await js(`(() => { const li = [...document.querySelectorAll('li')].find((x) => x.innerText.includes(${q(nombre)}) && x.querySelector('button')); const b = [...li.querySelectorAll('button')].find((b) => b.innerText.trim() === ${q(boton)}); b.click(); return true; })()`);
    await espera(1200); log(`${nombre} habilitado como ${boton} · ${await toast()}`);
  };
  await habilitar('Electricidad Sur', 'Gremio');
  await habilitar('Familia Benítez', 'Cliente');
  // Rubros del gremio nuevo y del plomero que ya trabajaba con la empresa
  const asignarRubro = async (gremio, rubro) => {
    await js(`(() => { const li = [...document.querySelectorAll('li')].filter((x) => x.innerText.includes(${q(gremio)}) && x.innerText.includes('Asignar rubros')).pop(); [...li.querySelectorAll('button')].find((b) => b.innerText.includes('Asignar rubros')).click(); return true; })()`);
    await espera(500);
    await js(`(() => { const fs = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.innerText === 'Casa Las Acacias' && f.closest('li')?.innerText.includes(${q(gremio)})); const l = [...fs.querySelectorAll('label.check')].find((x) => x.innerText.trim() === ${q(rubro)}); l.querySelector('input').click(); return true; })()`);
    await espera(1200); log(`${gremio}: rubro ${rubro} en Casa Las Acacias · ${await toast()}`);
  };
  await asignarRubro('Electricidad Sur', 'Electricidad');
  await js(`(() => { const li = [...document.querySelectorAll('li')].filter((x) => x.innerText.includes('Electricidad Sur')).pop(); li.scrollIntoView({ block: 'center' }); return true; })()`);
  await cuadro('O14-gremio-rubros');
  await js(`(() => { const li = [...document.querySelectorAll('li')].filter((x) => x.innerText.includes('Electricidad Sur')).pop(); [...li.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Listo')?.click(); return true; })()`);
  await asignarRubro('Sanitarios Pérez', 'Instalación sanitaria');
  await js(`(() => { const li = [...document.querySelectorAll('li')].filter((x) => x.innerText.includes('Sanitarios Pérez')).pop(); [...li.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Listo')?.click(); return true; })()`);
  await js(`(() => { const li = [...document.querySelectorAll('li')].find((x) => x.innerText.includes('Familia Benítez') && x.innerText.includes('Ve las obras')); const l = [...li.querySelectorAll('label.check')].find((x) => x.innerText.trim() === 'Casa Las Acacias'); l.querySelector('input').click(); li.scrollIntoView({ block: 'center' }); return true; })()`);
  await espera(1200); log(`Familia Benítez ve Casa Las Acacias · ${await toast()}`);
  await cuadro('O15-cliente-obra');
  await salir();

  // ── 4. El encargado lleva la obra: gastos, pagos, avances, diario, novedades ─
  await ingresar('Administración de obra', 'encargado@ejemplo.com');
  await ir(`#/obras/${obraId}`, '¿Cuánto avanzó');
  await gasto({ condicion: 'Contratación', fecha: '03/09/2026', concepto: 'Estructura de hormigón armado', rubro: 'Estructura', tipo: 'Mano de obra',
    importe: '22.000.000', proveedor: 'Hormigones del Sur', anticipo: '6.000.000', comprobante: ['Contrato — Hormigones del Sur', [['Estructura H°A° completa', '$ 22.000.000'], ['Anticipo', '$ 6.000.000']], '$ 22.000.000'], foto: 'O16-gasto-contrato' });
  await gasto({ condicion: 'Contado', fecha: '05/09/2026', concepto: 'Movimiento de suelo y nivelación', rubro: 'Movimiento de suelo', tipo: 'Mano de obra',
    importe: '1.650.000', proveedor: 'Excavaciones Gómez', comprobante: ['Excavaciones Gómez', [['Nivelación y excavación de bases', '$ 1.650.000']], '$ 1.650.000'] });
  await gasto({ condicion: 'Contado', fecha: '12/10/2026', concepto: 'Ladrillos y cemento', rubro: 'Albañilería', tipo: 'Materiales',
    importe: '3.900.000', proveedor: 'Corralón El Pino', comprobante: ['Corralón El Pino', [['Ladrillos huecos 12x18x33', '$ 2.700.000'], ['Cemento x 50 kg', '$ 1.200.000']], '$ 3.900.000'] });
  await pago({ compra: 'Estructura de hormigón', fecha: '15/10/2026', monto: '8.000.000', nota: 'Certificado 1 de estructura', foto: 'O17-pago', fotoConfirmar: 'O18-pago-confirmar' });
  await avance({ rubro: 'Movimiento de suelo', fecha: '20/09/2026', pct: 100, comentario: 'Terreno nivelado y bases excavadas' });
  await avance({ rubro: 'Estructura', fecha: '30/09/2026', pct: 20 });
  await avance({ rubro: 'Estructura', fecha: '31/10/2026', pct: 55, comentario: 'Columnas y losa de planta baja', foto: 'O19-avance' });
  await avance({ rubro: 'Albañilería', fecha: '20/11/2026', pct: 12, comentario: 'Arrancamos muros de planta baja' });
  await ir(`#/obras/${obraId}/diario`, 'Parte diario');
  const DIAS = [
    ['01/09/2026', '☀️ Soleado', 'Sí', 5, 'Inicio de obra'], ['15/09/2026', '⛅ Nublado', 'Sí', 7], ['23/09/2026', '🌧️ Lluvia', 'No', null, 'Terreno anegado'],
    ['24/09/2026', '🌧️ Lluvia', 'A medias', 3], ['20/10/2026', '☀️ Soleado', 'Sí', 9], ['04/11/2026', '⛈️ Tormenta', 'No', null, 'Se suspendió el hormigonado'],
    ['05/11/2026', '⛅ Nublado', 'A medias', 4], ['19/11/2026', '☀️ Soleado', 'Sí', 10], ['20/11/2026', '☀️ Soleado', 'Sí', 10],
  ];
  for (const [fecha, clima, trabajo, personal, comentario] of DIAS) await parteDiario({ fecha, clima, trabajo, personal, comentario });
  await js(`(document.querySelector('.calendario').scrollIntoView({ block: 'center' }), true)`); await espera(800);
  await cuadro('O20-diario');
  await js(`clic('＋ Publicar novedad')`); await esperarTexto('Visible para el cliente');
  await js(`(llenar('Título', '¡Arrancamos la obra!'), llenar('Texto', 'Nivelamos el terreno y excavamos las bases. La semana que viene empieza la estructura de hormigón.'), llenar('Fecha', '20/09/2026'))`);
  await js(`(async () => adjuntar(await ${fotosEjemplo([['estructura', 21, 'bases.jpg'], ['estructura', 22, 'hierros.jpg']])}))()`);
  await espera(900); await cuadro('O21-novedad', { hoja: true });
  await js(`clic('Publicar', 'button.btn-primario')`); await js(`hasta(() => !document.querySelector('.sheet'))`); log(`novedad: ¡Arrancamos la obra! · ${await toast()}`);
  await espera(600);
  await js(`clic('＋ Publicar novedad')`); await esperarTexto('Visible para el cliente');
  await js(`(llenar('Título', 'Losa de planta baja terminada'), llenar('Texto', 'Terminamos columnas y la losa de planta baja. Las lluvias del 4 y 5 de noviembre atrasaron un poco el hormigonado.'), llenar('Fecha', '06/11/2026'))`);
  await js(`(async () => adjuntar(await ${fotosEjemplo([['losa', 23, 'losa-pb.jpg']])}))()`);
  await espera(600); await js(`clic('Publicar', 'button.btn-primario')`); await js(`hasta(() => !document.querySelector('.sheet'))`); log(`novedad: Losa de planta baja terminada · ${await toast()}`);
  await espera(800);
  // Documentos
  await ir(`#/obras/${obraId}/documentos`, 'Documentos de la obra');
  for (const [titulo, tipo, archivo, ver] of [['Plano de arquitectura', 'Plano', 'plano-arquitectura.pdf', true], ['Contrato de obra', 'Contrato', 'contrato.pdf', true], ['Permiso de obra municipal', 'Permiso municipal', 'permiso.pdf', true]]) {
    await js(`clic('＋ Subir documento')`); await espera(400);
    await js(`(async () => adjuntar([[new Blob(['%PDF-1.4\\n% ' + ${q(titulo)} + '\\n%%EOF\\n'], { type: 'application/pdf' }), ${q(archivo)}]], document))()`);
    await espera(300);
    await js(`(llenar('Título', ${q(titulo)}, document), llenar('Tipo', ${q(tipo)}, document))`);
    if (!ver) await js(`clic('🔒 Sólo la empresa', '[role=radio]', document)`);
    await espera(300);
    if (titulo === 'Contrato de obra') await cuadro('O22-subir-documento');
    await js(`clic('Subir', 'button.btn-primario', document)`); await js(`hasta(() => !hay('¿Lo ve el cliente?'))`); await sinError(`Documento ${titulo}`);
    log(`documento: ${titulo} · ${await toast()}`); await espera(500);
  }
  await cuadro('O23-documentos');
  await salir();

  // ── 5. El gremio informa su avance desde el celular ───────────────────────
  await CELULAR();
  await ingresar('Soy proveedor o gremio', 'electricidad.sur@ejemplo.com', { fotoPortada: 'O24-gremio-ingreso' });
  await esperarTexto('Tus rubros'); await espera(800);

  await tocar('▲Avance', { sel: 'button', foto: 'O25b-gremio-tocar-avance' }); await esperarTexto('Avance acumulado');
  await js(`(llenar('Avance acumulado (%)', '25'), llenar('Comentario', 'Cañerías y cajas de planta baja colocadas. Sigo con planta alta.'), llenar('Fecha', '20/11/2026'))`);
  await js(`(async () => adjuntar(await ${fotosEjemplo([['electricidad', 31, 'canerias.jpg'], ['electricidad', 32, 'cajas.jpg']])}))()`);
  await espera(900); await cuadro('O26-gremio-parte');
  await js(`clic('Enviar parte', 'button')`); await js(`hasta(() => !document.querySelector('.sheet'))`); log(`parte del gremio · ${await toast()}`);
  await espera(800);
  await js(`clic('!Reclamo', 'button')`); await esperarTexto('Asunto');
  await js(`(llenar('Asunto', 'Faltan cajas rectangulares para planta alta'), llenar('Detalle', 'Necesito 30 cajas rectangulares para seguir con los tomas de planta alta.'))`);
  await espera(400); await cuadro('O27-gremio-reclamo');
  await js(`clic('Enviar', 'button.btn-primario')`); await js(`hasta(() => !document.querySelector('.sheet'))`); log(`reclamo del gremio · ${await toast()}`);
  await espera(800);
  await salir();

  // ── 6. La empresa aprueba el parte, responde y publica fotos ──────────────
  await ESCRITORIO();
  await ingresar('Administración de obra', 'admin@ejemplo.com');
  await ir(`#/obras/${obraId}/avance`, 'Partes de avance de gremios');
  await js(`(document.querySelector('.lista-partes').scrollIntoView({ block: 'center' }), true)`);
  await tocar('✓ Aprobar', { sel: 'button', foto: 'O28-aprobar-parte' });
  await espera(1200); log(`parte aprobado · ${await toast()}`);
  await ir(`#/obras/${obraId}/reclamos`, 'Reclamos');
  await js(`clic('Faltan cajas rectangulares')`); await esperarTexto('Responder');
  await js(`(poner(document.querySelector('.sheet textarea'), 'Ya las pedimos al corralón, llegan el lunes.'), clic('En curso', '[role=radio]'))`);
  await espera(400); await cuadro('O29-responder-reclamo', { hoja: true });
  await js(`clic('Enviar', 'button.btn-primario')`); await espera(1500); log(`reclamo respondido · ${await toast()}`);
  await cerrarHoja();
  await ir(`#/obras/${obraId}/fotos`, 'Fotos de la obra'); await espera(1500);
  for (let i = 0; i < 2; i++) {
    await js(`(() => { const b = [...document.querySelectorAll('button.foto-cliente')].find((x) => !x.classList.contains('si')); if (b) b.click(); return true; })()`);
    await espera(900);
  }
  await cuadro('O30-fotos-cliente'); log('fotos del gremio publicadas para el cliente');
  await salir();

  // ── 7. El cliente sigue su obra ───────────────────────────────────────────
  await pantalla(1280, 800);
  await ingresar('Soy cliente', 'familia.benitez@ejemplo.com', { fotoPortada: 'O31-cliente-ingreso' });
  await esperarTexto('¿Cuánto avanzó la obra?'); await espera(5000);
  await js(`(document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }), window.scrollTo(0, 0), true)`); await espera(1500);
  await cuadro('O32-portal');
  await js(`(document.querySelector('.portal-avance').scrollIntoView({ block: 'start' }), window.scrollBy(0, -20), true)`); await espera(600); await cuadro('O33-portal-avance');
  await js(`(document.querySelector('.gantt').scrollIntoView({ block: 'center' }), true)`); await espera(600); await cuadro('O34-portal-cronograma');
  await js(`(document.querySelector('.calendario').scrollIntoView({ block: 'center' }), true)`); await espera(600); await cuadro('O35-portal-clima');
  await js(`(document.querySelector('.novedades').scrollIntoView({ block: 'start' }), window.scrollBy(0, -60), true)`); await espera(900); await cuadro('O36-portal-novedades');
  await js(`(document.querySelector('.documentos').scrollIntoView({ block: 'center' }), true)`); await espera(600); await cuadro('O37-portal-documentos');
  await js(`(window.scrollTo(0, 0), clic('📄 Informe mensual'))`); await espera(2500); await cuadro('O38-informe-mensual');
  await js(`clic('Cerrar', 'button')`); await espera(500);
  await js(`clic('✉ Hacer una consulta')`); await esperarTexto('Tu consulta');
  await js(`(llenar('Asunto', '¿Podemos cambiar el color de las aberturas?'), llenar('Tu consulta', 'Preferimos aberturas negras en vez de blancas. ¿Llegamos a tiempo?'))`);
  await espera(400); await cuadro('O39-cliente-consulta', { hoja: true });
  await js(`clic('Enviar consulta', 'button')`); await js(`hasta(() => !document.querySelector('.sheet'))`); log(`consulta del cliente · ${await toast()}`);
  await espera(800);
  await salir();

  // ── 8. La empresa responde y el cliente ve la respuesta en el celular ─────
  await ingresar('Administración de obra', 'admin@ejemplo.com');
  await ir(`#/obras/${obraId}/reclamos`, 'Reclamos'); await espera(800);
  await js(`clic('Todos', '[role=radio]')`).catch(() => {}); await espera(500);
  await js(`clic('aberturas')`); await esperarTexto('Responder');
  await js(`(poner(document.querySelector('.sheet textarea'), '¡Sí! Las aberturas se encargan en enero, así que llegamos. Las pedimos en negro.'), clic('Resuelto', '[role=radio]'))`);
  await espera(400); await js(`clic('Enviar', 'button.btn-primario')`); await espera(1500); log(`consulta respondida · ${await toast()}`);
  await cerrarHoja();
  await salir();
  await CELULAR();
  await ingresar('Soy cliente', 'familia.benitez@ejemplo.com');
  await esperarTexto('¿Cuánto avanzó la obra?'); await espera(4000);
  await cuadro('O40-cliente-celular');
  await js(`clic('Consultas', '[role=radio]')`); await espera(800);
  await js(`clic('aberturas')`); await esperarTexto('Las aberturas se encargan'); await espera(800);
  await cuadro('O41-cliente-respuesta');
  log('Recorrido completo sin errores.');
} catch (e) {
  log(`✗ ERROR: ${e.message.split('\n')[0]}`);
  try { await cuadro('O99-error'); } catch { /* sin captura */ }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(AQUI, 'registro.txt'), registro.join('\n') + '\n', 'utf8');
  cerrar(); setTimeout(() => process.exit(), 500);
}
