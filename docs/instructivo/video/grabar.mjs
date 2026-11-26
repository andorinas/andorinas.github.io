// Genera los videos narrados del instructivo: voz (Windows, Microsoft Laura) + capturas → MP4 grabado con Edge sin ventana.
// Uso: node docs/instructivo/video/grabar.mjs [empresa|gremios] [--prueba]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VIDEOS, PRONUNCIA } from './guion.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(DIR, 'audio'); const SALIDA = path.join(DIR, 'salida');
fs.mkdirSync(AUDIO, { recursive: true }); fs.mkdirSync(SALIDA, { recursive: true });
const filtro = process.argv.slice(2).find((a) => !a.startsWith('--'));
const prueba = process.argv.includes('--prueba');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const videos = VIDEOS.filter((v) => !filtro || v.archivo.includes(filtro)).map((v) => ({
  ...v, archivo: v.archivo + (prueba ? '-prueba' : ''),
  escenas: (prueba ? v.escenas.slice(0, 3) : v.escenas).map((e, i) => ({ ...e, audio: `audio/${v.archivo}-${String(i + 1).padStart(2, '0')}.wav` })),
}));

// 1. Voces
const lista = videos.flatMap((v) => v.escenas.map((e) => ({ archivo: path.join(DIR, e.audio), texto: PRONUNCIA.reduce((t, [re, por]) => t.replace(re, por), e.texto) })));
const listaJson = path.join(AUDIO, 'voces.json');
fs.writeFileSync(listaJson, JSON.stringify(lista), 'utf8');
// Voz, en este orden:
//  1. Microsoft Azure (voces neuronales), si están las variables de entorno AZURE_SPEECH_KEY y AZURE_SPEECH_REGION.
//     La voz se elige con AZURE_SPEECH_VOICE (por defecto es-US-AlonsoNeural). La clave nunca se escribe en el código.
//  2. Piper con "Daniela" (español de Argentina, gratuita y local).
//  3. La voz de Windows.
const PIPER = path.join(process.env.LOCALAPPDATA, 'Programs', 'piper');
const MODELO = path.join(PIPER, 'es_AR-daniela-high.onnx');
const AZ = { clave: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION, voz: process.env.AZURE_SPEECH_VOICE || 'es-US-AlonsoNeural' };
const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
if (AZ.clave && AZ.region && !process.argv.includes('--voz-local')) {
  const idioma = AZ.voz.slice(0, 5);
  for (const it of lista) {
    const ssml = `<speak version="1.0" xml:lang="${idioma}"><voice name="${AZ.voz}"><prosody rate="-4%">${xml(it.texto.replace(/\s+/g, ' '))}</prosody></voice></speak>`;
    let r;
    for (let intento = 1; intento <= 3; intento++) {
      r = await fetch(`https://${AZ.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', body: ssml,
        headers: { 'Ocp-Apim-Subscription-Key': AZ.clave, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm', 'User-Agent': 'controlar-instructivo' },
      });
      if (r.ok || (r.status !== 429 && r.status < 500)) break;
      await espera(2000 * intento); // límite de uso del plan gratuito o falla momentánea: reintenta
    }
    if (!r.ok) throw new Error(`Azure respondió ${r.status} ${r.statusText} (revisá la clave, la región y la voz ${AZ.voz})`);
    fs.writeFileSync(it.archivo, Buffer.from(await r.arrayBuffer()));
    console.log('voz', path.basename(it.archivo), `(Azure ${AZ.voz})`);
  }
} else if (fs.existsSync(MODELO) && !process.argv.includes('--voz-windows')) {
  for (const it of lista) {
    // Daniela "ajustada": más pausada (length_scale), más aire entre frases y pronunciación más pareja (noise).
    execFileSync(path.join(PIPER, 'piper', 'piper.exe'), ['--model', MODELO, '--output_file', it.archivo,
      '--sentence_silence', '0.55', '--length_scale', '1.12', '--noise_scale', '0.5', '--noise_w', '0.6'],
      { input: it.texto.replace(/\s+/g, ' ') + '\n', stdio: ['pipe', 'ignore', 'ignore'] });
    console.log('voz', path.basename(it.archivo));
  }
} else {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DIR, 'voces.ps1'), listaJson], { stdio: 'inherit' });
}

// 2. Edge sin ventana
const PUERTO = 9600 + Math.floor(Math.random() * 300);
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-video-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  // El codificador H.264 por placa de video se cuelga en Edge 158 sin ventana: se usa el de software (igual de nítido).
  '--disable-accelerated-video-encode',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const cerrar = () => spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });

async function conectar(url) {
  const ws = new WebSocket(url); await new Promise((ok) => (ws.onopen = ok));
  let nid = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const [ok, mal] = pend.get(d.id); pend.delete(d.id); d.error ? mal(new Error(d.error.message)) : ok(d.result); } };
  return (method, params = {}) => new Promise((ok, mal) => { const id = ++nid; pend.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })); });
}
let navegador, pagina;
for (let i = 0; i < 60 && !pagina; i++) {
  try {
    const ver = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
    const p = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((x) => x.type === 'page');
    if (p) { navegador = await conectar(ver.webSocketDebuggerUrl); pagina = await conectar(p.webSocketDebuggerUrl); }
  } catch { /* esperando */ }
  if (!pagina) await espera(300);
}
await navegador('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SALIDA });
await pagina('Runtime.enable');
const evaluar = async (expr) => { const r = await pagina('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

try {
  for (const v of videos) {
    const destino = path.join(SALIDA, v.archivo + '.mp4');
    fs.rmSync(destino, { force: true });
    await pagina('Page.navigate', { url: pathToFileURL(path.join(DIR, 'render.html')).href });
    await espera(1500);
    await evaluar(`window.__iniciar(${JSON.stringify(v)}).catch((e) => { window.__error = e.message; }), true`);
    let ultimo = -1;
    for (;;) {
      await espera(2000);
      const est = await evaluar('({ e: window.__estado, t: window.__t, total: window.__total, fin: window.__fin, error: window.__error })');
      if (process.env.DEPURAR) console.log('  estado:', JSON.stringify({ e: est.e, t: est.t, total: est.total, error: est.error }));
      if (est.error) throw new Error(est.error);
      if (est.e === 'listo') { console.log(`✓ ${v.archivo}: ${(est.fin.tamano / 1048576).toFixed(1)} MB, ${Math.round(est.fin.duracion)} s, ${est.fin.mime}`); break; }
      const pct = est.total ? Math.floor((est.t / est.total) * 10) : 0;
      if (pct !== ultimo) { ultimo = pct; console.log(`  ${v.archivo}: ${pct * 10} %`); }
    }
    for (let i = 0; i < 120; i++) { if (fs.existsSync(destino) && !fs.readdirSync(SALIDA).some((f) => f.endsWith('.crdownload'))) break; await espera(500); }
    console.log('  archivo:', destino, fs.existsSync(destino) ? 'ok' : 'NO APARECIÓ');
  }
} finally { cerrar(); setTimeout(() => process.exit(0), 500); }
