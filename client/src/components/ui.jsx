import { useEffect, useRef, useState } from 'react';
import { dmy, parseDMY, parseImporte, numero } from '../lib.js';

export const LOGO_EDIFICIOS = 'M8 56 V36 H18 V56 M18 56 V18 H28 V10 H36 V56 M36 56 V28 H46 V36 H52 V56 M4 56 H60 M22 24 V52 M32 16 V52 M41 34 V52';
export const LOGO_GOLONDRINA = 'M44 9 C47 9 49 10 51 12 L57 6 L54 13 C56 14 58 14 60 13 C57 16 53 16 50 15 L47 19 L48 14 C46 13 45 11 44 9 Z';

export function Isologo({ size = 32, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d={LOGO_EDIFICIOS} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
      <path d={LOGO_GOLONDRINA} fill={color} />
    </svg>
  );
}

export function Marca({ compacta }) {
  return (
    <div className="marca">
      <Isologo size={compacta ? 30 : 40} />
      <div>
        <div className="marca-nombre">ANDORINAS</div>
        {!compacta && <div className="marca-sub">Ingeniería &amp; Construcción</div>}
      </div>
    </div>
  );
}

/** Modal tipo "hoja": pantalla completa en celular, centrado en tablet/escritorio. */
export function Sheet({ titulo, obra, onClose, children, ancho }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('sin-scroll');
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('sin-scroll'); };
  }, [onClose]);
  return (
    <div className="sheet-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${ancho ? 'sheet-ancho' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="sheet-cab">
          <div>
            <h2>{titulo}</h2>
            {obra && <div className="sheet-obra">Obra: <strong>{obra}</strong></div>}
          </div>
          <button type="button" className="btn-icono" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="sheet-cuerpo">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ label, hint, error, children, req }) {
  return (
    <label className={`campo ${error ? 'con-error' : ''}`}>
      <span className="campo-label">{label}{req && <span className="req"> *</span>}</span>
      {children}
      {hint && !error && <span className="campo-hint">{hint}</span>}
      {error && <span className="campo-error">{error}</span>}
    </label>
  );
}

export function Segmentado({ value, onChange, opciones, nombre, chico }) {
  return (
    <div className={`segmentado ${chico ? 'chico' : ''}`} role="radiogroup" aria-label={nombre}>
      {opciones.map(([v, t]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'activo' : ''} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  );
}

/** Fecha en formato DD/MM/AAAA con botón de calendario nativo. value/onChange en ISO. */
export function FechaInput({ value, onChange, id, required, max }) {
  const [txt, setTxt] = useState(dmy(value));
  const nativo = useRef(null);
  useEffect(() => { setTxt(dmy(value)); }, [value]);
  const mask = (s) => {
    const d = s.replace(/\D/g, '').slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
  };
  return (
    <div className="fecha-input">
      <input id={id} inputMode="numeric" placeholder="DD/MM/AAAA" value={txt} required={required}
        onChange={(e) => { const t = mask(e.target.value); setTxt(t); const iso = parseDMY(t); if (iso) onChange(iso); else if (!t) onChange(''); }}
        onBlur={() => setTxt(dmy(value))} />
      <button type="button" className="btn-icono" aria-label="Abrir calendario"
        onClick={() => { try { nativo.current.showPicker(); } catch { nativo.current.focus(); } }}>📅</button>
      <input ref={nativo} type="date" tabIndex={-1} aria-hidden="true" className="oculto-nativo" value={value || ''} max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)} />
    </div>
  );
}

/** Importe con formato argentino. value/onChange en centavos. */
export function ImporteInput({ value, onChange, moneda, id, placeholder = '0,00', autoFocus }) {
  const [txt, setTxt] = useState(value != null ? numero(value) : '');
  const [foco, setFoco] = useState(false);
  useEffect(() => { if (!foco) setTxt(value != null ? numero(value) : ''); }, [value, foco]);
  return (
    <div className="importe-input">
      {moneda && <span className="importe-moneda">{moneda}</span>}
      <input id={id} inputMode="decimal" autoComplete="off" placeholder={placeholder} value={txt} autoFocus={autoFocus}
        onFocus={() => setFoco(true)}
        onBlur={() => { setFoco(false); const c = parseImporte(txt); setTxt(c != null ? numero(c) : txt); }}
        onChange={(e) => { setTxt(e.target.value); onChange(parseImporte(e.target.value)); }} />
    </div>
  );
}

export function Aviso({ tipo = 'info', children, accion }) {
  return <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}><div>{children}</div>{accion}</div>;
}

export function Chip({ tipo = 'neutro', children }) { return <span className={`chip chip-${tipo}`}>{children}</span>; }

export function Barra({ valor, tono }) {
  return <div className="barra" aria-hidden="true"><div className={`barra-relleno ${tono || ''}`} style={{ width: `${Math.max(0, Math.min(100, valor || 0))}%` }} /></div>;
}

export function AdjuntoInput({ onFile, archivo, foto }) {
  return (
    <div className="adjunto-input">
      <label className="btn btn-sec">
        {foto ? '📷 Foto' : '📎 Foto o PDF'}
        <input type="file" accept={foto ? 'image/*' : 'image/*,application/pdf'} hidden onChange={(e) => onFile(e.target.files[0] || null)} />
      </label>
      {archivo && <span className="adjunto-nombre">{archivo.name} <button type="button" className="link" onClick={() => onFile(null)}>quitar</button></span>}
    </div>
  );
}

export function useCargando() {
  const [cargando, set] = useState(false);
  const ref = useRef(false);
  /** Ejecuta fn bloqueando reentradas (evita el doble toque). */
  const run = async (fn) => {
    if (ref.current) return;
    ref.current = true; set(true);
    try { return await fn(); } finally { ref.current = false; set(false); }
  };
  return [cargando, run];
}
