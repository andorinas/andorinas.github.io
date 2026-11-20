// Saca las capturas del instructivo desde la app de DEMOSTRACIÓN (datos ficticios en memoria).
// Requiere el servidor de demo en http://localhost:5199 (vite.demo.config.js) y Microsoft Edge.
// Uso: node docs/instructivo/capturas.mjs [filtro]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas');
fs.mkdirSync(DIR, { recursive: true });
const BASE = 'http://localhost:5199/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PUERTO = 9400 + Math.floor(Math.random() * 500);
const filtro = process.argv[2];

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-capturas-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--hide-scrollbars', '--lang=es-AR', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nid = 0; const pend = new Map();
async function conectar() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const pag = t.find((x) => x.type === 'page');
      if (pag) { ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise((ok) => (ws.onopen = ok)); break; }
    } catch { /* todavía no */ }
    await espera(300);
  }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const [ok, mal] = pend.get(d.id); pend.delete(d.id); d.error ? mal(new Error(d.error.message)) : ok(d.result); } };
}
const cdp = (method, params = {}) => new Promise((ok, mal) => { const id = ++nid; pend.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })); });
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${AYUDAS}; return (${expr}); })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

// Ayudas que corren dentro de la página
const AYUDAS = `
const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
const norm = (x) => (x || '').toLowerCase().replace(/\\s+/g, '');
const raiz = () => [...document.querySelectorAll('.sheet')].pop() || document;
const buscar = (t, sel = 'button, a, [role=radio], [role=tab], summary, label, .fila-click, li, tr, .tarjeta') => {
  const els = [...raiz().querySelectorAll(sel)].filter(visible);
  const n = norm(t); return els.find((e) => norm(e.innerText) === n) || els.filter((e) => norm(e.innerText).startsWith(n)).sort((a, b) => a.innerText.length - b.innerText.length || (a.contains(b) ? 1 : b.contains(a) ? -1 : 0))[0] || els.filter((e) => norm(e.innerText).includes(n)).sort((a, b) => a.innerText.length - b.innerText.length || (a.contains(b) ? 1 : b.contains(a) ? -1 : 0))[0];
};
const clic = (t, sel) => { const e = buscar(t, sel); if (!e) throw new Error('No encontré: ' + t); e.scrollIntoView({ block: 'center' }); e.click(); return true; };
const campo = (etq) => {
  const c = [...raiz().querySelectorAll('.campo')].filter(visible).find((x) => x.querySelector('.campo-label')?.innerText.trim().replace(/ \\*$/, '').startsWith(etq));
  if (!c) throw new Error('No encontré el campo: ' + etq);
  return c.querySelector('input:not([type=checkbox]):not([type=file]), textarea, select');
};
const poner = (el, v) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  if (el.tagName === 'SELECT') { const o = [...el.options].find((o) => o.text.trim().startsWith(v) || o.value === String(v)); if (!o) throw new Error('Opción no encontrada: ' + v); v = o.value; }
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
};
const llenar = (etq, v) => poner(campo(etq), v);
const hay = (t) => norm(document.body.innerText).includes(norm(t));
const bloque = (txt) => { const ts = txt.split('|').map(norm); const c = [...document.querySelectorAll('section, .panel, .card, form, div, li, article')].filter(visible).filter((e) => ts.every((t) => norm(e.innerText).includes(t))).filter((e) => e.getBoundingClientRect().height > 60); c.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height); return c[0]; };
const hasta = async (f, ms = 60000) => { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando'); await new Promise((r) => setTimeout(r, 150)); } return true; };
`;

async function tam(w, h, movil = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: movil });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: movil });
}
async function abrir(usuario, hash = '#/', w = 1280, h = 800, movil = false) {
  await tam(w, h, movil);
  await cdp('Page.navigate', { url: `${BASE}?demo=${usuario}${hash}` });
  await espera(800);
  await js(`hasta(() => window.__demo?.listo && !document.querySelector('.cargando-pantalla'), 120000)`);
  await espera(1200);
}
async function ir(hash, textoEsperado) {
  await js(`(location.hash = ${JSON.stringify(hash)}, true)`);
  if (textoEsperado) await js(`hasta(() => hay(${JSON.stringify(textoEsperado)}))`);
  await espera(900);
}
const HOJA = { selector: '.sheet', margen: 0, alto: 1800 };
const cerrar = async () => { await js(`(document.querySelector('.sheet [aria-label=Cerrar]').click(), true)`); await espera(400); };
async function foto(nombre, { selector, margen = 12, completa = false, alto } = {}) {
  let previo;
  if (alto) { previo = await js('({ w: innerWidth, h: innerHeight })'); await cdp('Emulation.setDeviceMetricsOverride', { width: previo.w, height: alto, deviceScaleFactor: 2, mobile: previo.w < 600 }); await espera(700); }
  await js(`(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue.includes('localhost')) n.nodeValue = n.nodeValue.replace(/http:\\/\\/localhost:\\d+\\/(\\?demo=\\w+)?/g, 'https://andorinas.github.io/'); return true; })()`);
  await espera(500);
  let clip;
  if (selector) {
    clip = await js(`(() => { const e = typeof ${JSON.stringify(selector)} === 'string' && ${JSON.stringify(selector)}.startsWith('texto:') ? bloque(${JSON.stringify(selector)}.slice(6)) : document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Sin selector ${selector}'); window.scrollTo(0, 0); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX - ${margen}), y: Math.max(0, r.top + scrollY - ${margen}), width: r.width + ${margen * 2}, height: r.height + ${margen * 2}, scale: 1 }; })()`);
  } else if (completa) {
    const m = await cdp('Page.getLayoutMetrics');
    clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 2600), scale: 1 };
  }
  await espera(300);
  const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  fs.writeFileSync(path.join(DIR, nombre + '.png'), Buffer.from(r.data, 'base64'));
  if (alto) { await cdp('Emulation.setDeviceMetricsOverride', { width: previo.w, height: previo.h, deviceScaleFactor: 2, mobile: previo.w < 600 }); await espera(400); }
  console.log('✓', nombre);
}
const paso = async (nombre, fn) => {
  if (filtro && !nombre.includes(filtro)) return;
  try { await fn(); } catch (e) { console.log('✗', nombre, '→', e.message.split('\n')[0]); }
};

await conectar();
await cdp('Page.enable'); await cdp('Runtime.enable');

// ── Sin sesión ────────────────────────────────────────────────────────────
await paso('01-login', async () => {
  await abrir('ninguno', '#/');
  await foto('01-login');
  
  await js(`clic('Ingresar', '[role=radio]')`); await js(`clic('Olvidé mi contraseña')`); await foto('03-olvide');
  await abrir('ninguno', '#/', 390, 844, true); await js(`buscar('Volver a ingresar') ? clic('Volver a ingresar') : true`); await espera(300); await js(`clic('Crear cuenta')`); await espera(400); await foto('02-crear-cuenta'); await js(`clic('Ingresar', '[role=radio]')`); await js(`clic('Olvidé mi contraseña')`); await espera(400); await foto('04-login-celular');
});
await paso('05-pendiente', async () => { await abrir('pendiente', '#/', 390, 844, true); await foto('05-pendiente'); });

// ── Administrador ─────────────────────────────────────────────────────────
await paso('10-admin', async () => {
  await abrir('admin', '#/');
  await foto('10-obras');
  await js(`clic('Laura Gómez')`); await js(`hasta(() => hay('Contraseña actual'))`); await foto('11-mi-contrasena', HOJA);
  await cerrar();
  await ir('#/obras/nueva', 'Rubros de la obra'); await foto('12-nueva-obra', { selector: 'form.form', margen: 16 });
  await ir('#/cotizaciones', 'Historial'); await foto('13-dolar-bna');
  await js(`llenar('Fecha de publicación', '20/11/2026')`); await espera(800); await foto('14-dolar-correccion', { selector: 'texto:Cargar cotización|Motivo de la corrección' });

  await ir('#/obras/1', '¿Cuánto avanzó?'); await foto('20-tablero');
  await foto('25-por-rubro', { selector: 'texto:Por rubro|Total obra' });
  await foto('26-grafico', { selector: 'texto:Presupuesto vs comprometido|Excedido' });
  await js(`clic('Dólar manual')`); await espera(700); await foto('23-dolar-manual', { selector: 'texto:Moneda de visualización|Fecha de corte' });
  await js(`clic('BNA histórico')`); await espera(800);

  await ir('#/obras/1/movimientos', 'movimiento'); await foto('30-movimientos');
  await js(`clic('Hierro, cemento')`); await js(`hasta(() => hay('Historial de cambios'))`); await foto('32-detalle', HOJA);
  await js(`clic('Corregir')`); await espera(600); await foto('33-corregir', HOJA);
  await js(`clic('Cancelar')`); await espera(300); await js(`clic('Anular', 'button')`); await espera(600); await foto('34-anular', { selector: 'texto:Anular movimiento|Confirmar anulación', margen: 6, alto: 1800 });
  await cerrar();

  await js(`clic('＋ Agregar gasto')`); await js(`hasta(() => hay('Condición de pago'))`);
  await js(`clic('Contratación')`); await espera(300);
  await js(`llenar('Concepto', 'Colocación de cerámicos')`);
  await js(`llenar('Rubro de obra', 'Terminaciones')`); await js(`llenar('Tipo de gasto', 'Mano de obra')`);
  await js(`llenar('Importe acordado', '3.500.000')`); await js(`llenar('Proveedor', 'Revestimientos Díaz')`);
  await js(`llenar('Anticipo', '500.000')`).catch(() => {});
  await espera(900); await foto('41-gasto-completo', HOJA);
  await cerrar();

  await js(`clic('$ Registrar pago')`); await js(`hasta(() => hay('Elegí la compra'))`); await foto('42-pago-elegir', HOJA);
  await js(`clic('Mampostería y revoques')`); await espera(600);
  await js(`llenar('Dinero entregado', '2.000.000')`); await js(`llenar('Nota', 'Quincena 2')`); await espera(700);
  await foto('43-pago', HOJA);
  await js(`clic('Revisar pago')`); await js(`hasta(() => hay('Revisá antes de confirmar'))`); await foto('44-pago-confirmar', { selector: 'texto:Revisá antes de confirmar|Confirmar pago', margen: 6, alto: 1800 });
  await js(`clic('Modificar')`); await espera(300);
  await js(`clic('USD', '[role=radio]')`); await espera(600); await js(`llenar('Dinero entregado', '1.000')`); await espera(500); await js(`llenar('Cancela en ARS', '1.460.000')`); await espera(700);
  await foto('45-pago-otra-moneda', HOJA);
  await cerrar();

  await ir('#/obras/1/avance', 'Partes de avance');
  await foto('51-partes', { selector: 'texto:Partes de avance de gremios|Aprobar' });
  await foto('54-pesos', { selector: 'texto:Peso de cada rubro en el avance general|Guardar pesos' });
  await foto('55-avance-rubros', { selector: 'texto:Por rubro|último registro' });
  await foto('56-historial-avance', { selector: 'texto:Historial|Anular|Planta baja levantada' });
  await js(`clic('Rechazar…')`); await espera(500); await foto('52-rechazar', { selector: 'texto:Baño PB y cocina con prueba|Aprobar con nota' });
  await js(`clic('Cancelar')`); await espera(300);
  await js(`clic('▲ Cargar avance')`); await js(`hasta(() => hay('Avance acumulado'))`);
  await js(`llenar('Rubro', 'Pintura')`); await js(`llenar('Avance acumulado', '15')`); await js(`llenar('Comentario', 'Primera mano en planta baja')`); await espera(600);
  await foto('53-cargar-avance', HOJA);
  await cerrar();

  await ir('#/obras/1/fotos', 'Fotos de la obra'); await espera(2500); await foto('60-fotos', { selector: 'texto:Fotos de la obra|Todo origen' });
  await js(`clic('📷 Agregar fotos')`); await espera(600); await foto('61-agregar-fotos', HOJA);
  await cerrar();

  await ir('#/obras/1/reclamos', 'Reclamos'); await espera(800);
  await js(`clic('Todos', '[role=radio]')`); await espera(700); await foto('71-reclamos-todos', { selector: 'texto:Reclamo a un gremio|Sin resolver|Faltan cajas' });
  await js(`clic('Faltan cajas')`); await js(`hasta(() => hay('Responder'))`); await espera(1500); await foto('72-reclamo-detalle', HOJA);
  await cerrar();
  await js(`clic('＋ Reclamo a un gremio')`); await espera(600);
  await js(`llenar('Gremio', 'Sanitarios')`); await js(`llenar('Asunto', 'Limpiar la obra al terminar')`); await espera(400); await foto('73-reclamo-nuevo', HOJA);
  await cerrar();

  await ir('#/obras/1/configuracion', 'Presupuesto por rubro');
  await foto('80-presupuestos', { selector: 'texto:Presupuesto por rubro|Cada modificación|Terminaciones' });
  await foto('83-datos-obra', { selector: 'texto:Datos de la obra|Guardar datos' });
  await foto('84-rubros', { selector: 'texto:Renombrar|Desactivar|Los pesos del avance' });
  await foto('85-tipos', { selector: 'texto:Tipos de gasto (empresa)|predefinido|Agregar' });
  await js(`clic('Modificar')`); await espera(600); await foto('81-presupuesto-modificar', { selector: 'texto:Motivo de la modificación|Vigente desde|Guardar' });
  await js(`clic('Eliminar esta obra…')`); await espera(500); await foto('82-eliminar', { selector: 'texto:Eliminar obra|Eliminar definitivamente' });

  await ir('#/usuarios', 'Equipo');
  await foto('90-usuarios', { selector: 'texto:Esperando habilitación|Habilitar encargado' });
  await foto('92-usuarios-cabecera', { selector: 'texto:Usuarios|Descargar copia de seguridad|Para sumar a alguien', margen: 0 });
  await js(`clic('Asignar rubros')`); await espera(600); await foto('91-rubros-gremio', { selector: 'texto:Equipo|Hacer administrador|Listo' });
});

// ── Celular (encargado) ───────────────────────────────────────────────────
await paso('95-celular', async () => {
  await abrir('encargado', '#/', 390, 844, true); await foto('95-obras-celular');
  await ir('#/obras/1', '¿Cuánto avanzó?'); await foto('96-tablero-celular');
  await js(`clic('＋ Gasto')`); await js(`hasta(() => hay('Condición de pago'))`); await foto('97-gasto-celular');
});

// ── Gremio ────────────────────────────────────────────────────────────────
await paso('A0-gremio', async () => {
  await abrir('gremio', '#/', 390, 844, true); await espera(1500); await foto('A0-gremio-obra');
  await js(`clic('Reclamos')`); await espera(700); await foto('A1-gremio-reclamos');
  await js(`clic('Mis fotos')`); await espera(1500); await foto('A2-gremio-fotos');
  await js(`clic('▲ Avance')`); await js(`hasta(() => hay('Avance acumulado'))`);
  await js(`llenar('Avance acumulado', '70')`); await js(`llenar('Comentario', 'Tomas y llaves de planta alta')`); await espera(500);
  await foto('A3-gremio-parte');
  await js(`(document.querySelector('.sheet [aria-label=Cerrar]').click(), true)`); await espera(400);
  await js(`clic('! Reclamo')`); await espera(600);
  await js(`llenar('Asunto', 'Falta cable de 2,5 mm')`); await espera(300); await foto('A4-gremio-reclamo');
  await abrir('gremio', '#/', 1280, 800); await espera(1500); await foto('A5-gremio-escritorio');
});

ws.close(); spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
setTimeout(() => process.exit(0), 300);
