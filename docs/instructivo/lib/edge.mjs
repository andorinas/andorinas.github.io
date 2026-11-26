// Control de Microsoft Edge sin ventana (protocolo DevTools) para operar la app de DEMOSTRACIÓN.
// Lo usa el agente de demostración (agente/obra-completa.mjs). La app de demo corre en http://localhost:5199.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Ayudas que corren dentro de la página: buscar por texto visible, llenar campos por su etiqueta, señalar lo que se toca.
export const AYUDAS = `
const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
const norm = (x) => (x || '').toLowerCase().replace(/\\s+/g, '');
const raiz = () => [...document.querySelectorAll('.sheet')].pop() || document;
const buscar = (t, sel = 'button, a, [role=radio], [role=tab], summary, label, .fila-click, li, tr, .tarjeta', base = raiz()) => {
  const els = [...base.querySelectorAll(sel)].filter(visible);
  const n = norm(t);
  const e = els.find((e) => norm(e.innerText) === n) || els.filter((e) => norm(e.innerText).startsWith(n)).sort((a, b) => a.innerText.length - b.innerText.length)[0] || els.filter((e) => norm(e.innerText).includes(n)).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  // Un ítem de lista o fila que envuelve un botón: se toca el botón (es el que tiene la acción).
  return e && /^(LI|TR)$/.test(e.tagName) && e.querySelector('button, a') ? e.querySelector('button, a') : e;
};
const exigir = (e, t) => { if (!e) throw new Error('No encontré: ' + t); return e; };
const clic = (t, sel, base) => { const e = exigir(buscar(t, sel, base), t); e.scrollIntoView({ block: 'center' }); e.click(); return true; };
const campo = (etq, base = raiz()) => {
  const c = [...base.querySelectorAll('.campo')].filter(visible).find((x) => x.querySelector('.campo-label')?.innerText.trim().replace(/ \\*$/, '').startsWith(etq));
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
const llenar = (etq, v, base) => poner(campo(etq, base), v);
const hay = (t) => norm(document.body.innerText).includes(norm(t));
const hasta = async (f, ms = 30000) => { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando'); await new Promise((r) => setTimeout(r, 150)); } return true; };
// Puntero dibujado sobre el elemento que el agente va a tocar (sólo para el video).
const apuntar = (t, sel, base) => {
  const e = exigir(typeof t === 'string' ? buscar(t, sel, base) : t, t); e.scrollIntoView({ block: 'center' });
  soltar(); const r = e.getBoundingClientRect(); const d = document.createElement('div'); d.id = '__ptr';
  d.style.cssText = 'position:fixed;left:' + (r.left + Math.min(r.width / 2, 60)) + 'px;top:' + (r.top + r.height / 2) + 'px;z-index:99999;pointer-events:none';
  d.innerHTML = '<div style="position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;background:rgba(214,96,23,.22);border:3px solid rgba(214,96,23,.85)"></div>'
    + '<svg width="34" height="40" viewBox="0 0 34 40" style="position:absolute;left:2px;top:2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M2 2 L2 32 L10 25 L16 38 L22 35 L16 22 L27 22 Z" fill="#fff" stroke="#111" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(d); return true;
};
const soltar = () => { document.getElementById('__ptr')?.remove(); return true; };
// Adjunta archivos generados en la página a un input de archivos (fotos o comprobantes de ejemplo).
const adjuntar = async (blobs, base = raiz()) => {
  const inp = [...base.querySelectorAll('input[type=file]')].pop(); if (!inp) throw new Error('No hay campo de archivos');
  const dt = new DataTransfer(); blobs.forEach(([b, nombre]) => dt.items.add(new File([b], nombre, { type: b.type || 'image/jpeg' })));
  inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); return true;
};
`;

/** Abre Edge sin ventana y devuelve funciones para operarlo. */
export async function abrirEdge({ puertoBase = 9200, args = [] } = {}) {
  const puerto = puertoBase + Math.floor(Math.random() * 500);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-agente-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--hide-scrollbars', '--lang=es-AR', ...args, 'about:blank'], { stdio: 'ignore' });
  let ws; let nid = 0; const pend = new Map();
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const pag = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).find((x) => x.type === 'page');
      if (pag) { ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise((ok) => (ws.onopen = ok)); }
    } catch { /* todavía no */ }
    if (!ws) await espera(300);
  }
  if (!ws) throw new Error('No se pudo abrir Edge');
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const [ok, mal] = pend.get(d.id); pend.delete(d.id); d.error ? mal(new Error(d.error.message)) : ok(d.result); } };
  const cdp = (method, params = {}) => new Promise((ok, mal) => { const id = ++nid; pend.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${AYUDAS}; return (${expr}); })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const cerrar = () => { try { ws.close(); } catch { /* ya cerrado */ } spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); };
  return { cdp, js, cerrar };
}
