import { isValidElement, useEffect, useId, useRef, useState } from 'react';
import { dmy, parseDMY, parseImporte, numero } from '../lib.js';

// Logo real de Andorinas (recortado del archivo original): versiones negra y blanca con fondo transparente.
const marca = (n) => `${import.meta.env.BASE_URL}marca/${n}.png`;

/** Isologo (edificios + golondrina). claro = versión blanca para fondos oscuros. */
export function Isologo({ size = 32, claro = false }) {
  return <img src={marca(claro ? 'isologo-blanco' : 'isologo-negro')} alt="" aria-hidden="true" style={{ height: size, width: 'auto' }} />;
}

/** Marca completa. compacta = isologo + "ANDORINAS" en línea (encabezado); si no, el logo apilado original. */
export function Marca({ compacta, claro = false, alto }) {
  if (compacta) {
    return (
      <span className="marca">
        <img src={marca(claro ? 'isologo-blanco' : 'isologo-negro')} alt="" aria-hidden="true" style={{ height: alto || 30, width: 'auto' }} />
        <img src={marca(claro ? 'texto-blanco' : 'texto-negro')} alt="Andorinas Ingeniería & Construcción" style={{ height: (alto || 30) * 0.72, width: 'auto' }} />
      </span>
    );
  }
  return <img className="marca-logo" src={marca(claro ? 'logo-blanco' : 'logo-negro')} alt="Andorinas Ingeniería & Construcción" style={{ height: alto || 110, width: 'auto' }} />;
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

/** Campo con etiqueta. Sólo usa <label> si el hijo es un input/select/textarea simple: dentro de un <label>,
 *  tocar el texto activa el primer botón de un selector (p. ej. cambiaba la condición de pago a "Contado"). */
export function Campo({ label, hint, error, children, req }) {
  const id = useId();
  const simple = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const Tag = simple ? 'label' : 'div';
  return (
    <Tag className={`campo ${error ? 'con-error' : ''}`} {...(simple ? {} : { role: 'group', 'aria-labelledby': id })}>
      <span className="campo-label" id={id}>{label}{req && <span className="req"> *</span>}</span>
      {children}
      {hint && !error && <span className="campo-hint">{hint}</span>}
      {error && <span className="campo-error">{error}</span>}
    </Tag>
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
  const [invalida, setInvalida] = useState(false);
  const nativo = useRef(null);
  useEffect(() => {
    if (value) { setTxt(dmy(value)); setInvalida(false); }
    else if (value === '') { setTxt(''); setInvalida(false); } // el formulario se vació desde afuera
  }, [value]);
  // Enter con una fecha a medio escribir: no envía el formulario con la fecha anterior; marca el campo.
  const alEnter = (e) => {
    if (e.key !== 'Enter' || !txt || parseDMY(txt)) return;
    e.preventDefault(); setInvalida(true); onChange(null);
  };
  const cambiar = (s) => {
    const t = normalizarFecha(s); setTxt(t);
    const iso = parseDMY(t);
    if (iso && iso >= '1990-01-01' && iso <= '2100-12-31') { setInvalida(false); onChange(iso); }
    else if (!t) { setInvalida(false); onChange(''); }
    else if (t.length >= 10) { setInvalida(true); onChange(null); }
  };
  return (
    <div className={`fecha-input ${invalida ? 'invalida' : ''}`}>
      <input id={id} inputMode="numeric" placeholder="DD/MM/AAAA" value={txt} required={required} aria-invalid={invalida}
        onChange={(e) => cambiar(e.target.value)} onKeyDown={alEnter}
        onBlur={() => {
          // Fecha incompleta o inválida: queda marcada y el formulario no la toma (no se guarda otra fecha en silencio).
          if (txt && !parseDMY(txt)) { setInvalida(true); onChange(null); } else if (value) setTxt(dmy(value));
        }} />
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

/** "1/6/2025", "01062025", "2025-06-15" (pegado) -> "DD/MM/AAAA" mientras se escribe. */
export function normalizarFecha(s) {
  const t = String(s).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  if (/[/.-]/.test(t)) {
    const p = t.split(/[/.-]/).slice(0, 3).map((x) => x.replace(/\D/g, ''));
    return p.map((x, i) => (i < 2 && x.length === 1 && i < p.length - 1 ? x.padStart(2, '0') : x.slice(0, i < 2 ? 2 : 4))).join('/');
  }
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}

/** Aviso. Si es de error, se hace visible solo (scroll + foco) cada vez que cambia el mensaje:
 *  en el celular el formulario suele estar desplazado y el error quedaba fuera de la pantalla. */
export function Aviso({ tipo = 'info', children, accion }) {
  const ref = useRef(null);
  const ultimo = useRef('');
  useEffect(() => {
    const txt = ref.current?.textContent || '';
    if (tipo === 'error' && txt && txt !== ultimo.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
      ref.current.focus({ preventScroll: true });
    }
    ultimo.current = txt;
  });
  return <div ref={ref} tabIndex={-1} className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}><div>{children}</div>{accion}</div>;
}

export function Chip({ tipo = 'neutro', children }) { return <span className={`chip chip-${tipo}`}>{children}</span>; }

export function Barra({ valor, tono }) {
  return <div className="barra" aria-hidden="true"><div className={`barra-relleno ${tono || ''}`} style={{ width: `${Math.max(0, Math.min(100, valor || 0))}%` }} /></div>;
}

/** Campo de contraseña con botón para mostrarla u ocultarla (el ojo). Recibe las mismas props que un input. */
export function ClaveInput(props) {
  const [ver, setVer] = useState(false);
  return (
    <div className="clave-input">
      <input {...props} type={ver ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="clave-ver" onClick={() => setVer((v) => !v)} aria-pressed={ver}
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {ver && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
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
