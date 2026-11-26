// Revisión: extrae cuadros de un MP4 (a los segundos indicados) y verifica que tenga audio.
// Uso: node cuadros.mjs salida/archivo.mp4 3,10,20
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const archivo = path.resolve(DIR, process.argv[2]); const tiempos = (process.argv[3] || '2,10').split(',').map(Number);
const salida = path.join(DIR, 'cuadros'); fs.mkdirSync(salida, { recursive: true });
const P = 9900 + Math.floor(Math.random() * 90);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-video-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${P}`, `--user-data-dir=${perfil}`, '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 50 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${P}/json/list`)).json()).find((x) => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((ok) => (ws.onopen = ok)); } } catch {} if (!ws) await espera(300); }
let nid = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const ev = (expression) => new Promise((ok) => { const id = ++nid; pend.set(id, ok); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); }).then((d) => d.result.result.value ?? d.result.exceptionDetails?.exception?.description);
await ev(`location.href = ${JSON.stringify(pathToFileURL(path.join(DIR, 'render.html')).href)}; 1`); await espera(1200);
const info = await ev(`(async () => {
  const v = document.createElement('video'); v.src = ${JSON.stringify(pathToFileURL(archivo).href)}; v.muted = false; document.body.append(v);
  await new Promise((ok, mal) => { v.onloadedmetadata = ok; v.onerror = () => mal(new Error('no carga')); });
  await v.play(); await new Promise((r) => setTimeout(r, 3000)); v.pause();
  const audio = v.webkitAudioDecodedByteCount;
  const c = document.createElement('canvas'); c.width = 960; c.height = 540; const x = c.getContext('2d'); const cuadros = [];
  for (const t of ${JSON.stringify(tiempos)}) { v.currentTime = Math.min(t, v.duration - 0.1); await new Promise((ok) => (v.onseeked = ok)); x.drawImage(v, 0, 0, 960, 540); cuadros.push(c.toDataURL('image/jpeg', 0.8)); }
  return { duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight, audioBytes: audio, cuadros };
})()`);
console.log(typeof info, JSON.stringify(info).slice(0, 300)); if (typeof info === 'string' || !info?.cuadros) { console.log('Error:', info); } else {
  info.cuadros.forEach((d, i) => fs.writeFileSync(path.join(salida, `${path.basename(archivo, '.mp4')}-${tiempos[i]}s.jpg`), Buffer.from(d.split(',')[1], 'base64')));
  console.log({ duracion: info.duracion, ancho: info.ancho, alto: info.alto, audioBytes: info.audioBytes });
}
spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); setTimeout(() => process.exit(0), 500);
