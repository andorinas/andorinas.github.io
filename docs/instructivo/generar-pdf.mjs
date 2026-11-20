// Convierte instructivo.html (paginado con paged.js) en PDF con Microsoft Edge sin ventana.
// Uso: node docs/instructivo/generar-pdf.mjs   → docs/instructivo/ControlAr-Instructivo.pdf
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(DIR, 'ControlAr-Instructivo.pdf');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PUERTO = 9400 + Math.floor(Math.random() * 500);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-pdf-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--allow-file-access-from-files', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ws; let nid = 0; const pend = new Map();
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const pag = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((x) => x.type === 'page');
    if (pag) { ws = new WebSocket(pag.webSocketDebuggerUrl); await new Promise((ok) => (ws.onopen = ok)); }
  } catch { /* esperando */ }
  if (!ws) await espera(300);
}
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const [ok, mal] = pend.get(d.id); pend.delete(d.id); d.error ? mal(new Error(d.error.message)) : ok(d.result); } };
const cdp = (method, params = {}) => new Promise((ok, mal) => { const id = ++nid; pend.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })); });

await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.navigate', { url: pathToFileURL(path.join(DIR, 'instructivo.html')).href });
for (let i = 0; i < 240; i++) {
  const r = await cdp('Runtime.evaluate', { expression: 'window.__listo === true', returnByValue: true });
  if (r.result.value) break;
  await espera(500);
}
const info = await cdp('Runtime.evaluate', { expression: 'document.querySelectorAll(".pagedjs_page").length', returnByValue: true });
console.log('Páginas:', info.result.value);
if (process.argv[2] === 'paginas') {
  const dir = path.join(DIR, 'revision'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp('Runtime.evaluate', { expression: 'document.head.insertAdjacentHTML("beforeend", "<style>.pagedjs_pages{display:flex!important;flex-wrap:wrap;width:1620px;gap:20px}.pagedjs_page{margin:0!important}</style>")' });
  await espera(1500);
  const rects = JSON.parse((await cdp('Runtime.evaluate', { expression: 'JSON.stringify([...document.querySelectorAll(".pagedjs_page")].map(p => { const r = p.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }))', returnByValue: true })).result.value);
  for (let i = 0; i < rects.length; i += 2) {
    const a = rects[i], b = rects[i + 1] || a;
    const img = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 75, captureBeyondViewport: true, clip: { x: a.x, y: a.y, width: (b.x + b.w) - a.x, height: a.h, scale: 1 } });
    fs.writeFileSync(path.join(dir, String(i + 1).padStart(2, '0') + '.jpg'), Buffer.from(img.data, 'base64'));
  }
  console.log('Páginas guardadas en', dir);
  ws.close(); spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); setTimeout(() => process.exit(0), 300); await espera(1000);
}
const pdf = await cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, generateDocumentOutline: true, generateTaggedPDF: true });
fs.writeFileSync(SALIDA, Buffer.from(pdf.data, 'base64'));
console.log('PDF:', SALIDA, Math.round(fs.statSync(SALIDA).size / 1024), 'KB');
ws.close(); spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
setTimeout(() => process.exit(0), 300);
