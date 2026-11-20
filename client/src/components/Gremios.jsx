// Componentes compartidos por la empresa y los gremios: fotos, reclamos y partes de avance.
import { useEffect, useMemo, useState } from 'react';
import { dmy, dmyHora, hoyISO, uuid, pct, parseDecimal } from '../lib.js';
import {
  subirFotos, detalleReclamo, responderReclamo, crearReclamo, crearParte, ESTADO_RECLAMO, ESTADO_PARTE,
} from '../datos.js';
import { Sheet, Campo, FechaInput, Aviso, Chip, Segmentado, Barra, useCargando } from './ui.jsx';
import { useToast } from '../ctx.js';

export const TONO_RECLAMO = { abierto: 'error', en_curso: 'alerta', resuelto: 'ok' };
export const TONO_PARTE = { pendiente: 'alerta', aprobado: 'ok', rechazado: 'error' };

/** Selector de varias fotos con vista previa (cámara del celular o galería). */
export function FotosInput({ archivos, onChange, max = 8 }) {
  const previas = useMemo(() => archivos.map((f) => ({ f, url: URL.createObjectURL(f) })), [archivos]);
  useEffect(() => () => previas.forEach((p) => URL.revokeObjectURL(p.url)), [previas]);
  return (
    <div className="fotos-input">
      <div className="fotos-previas">
        {previas.map((p, i) => (
          <figure key={i} className="foto-previa">
            <img src={p.url} alt={p.f.name} />
            <button type="button" className="foto-quitar" aria-label={`Quitar ${p.f.name}`} onClick={() => onChange(archivos.filter((_, j) => j !== i))}>✕</button>
          </figure>
        ))}
        {archivos.length < max && (
          <label className="foto-agregar">
            <span aria-hidden="true">📷</span><span>Agregar fotos</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { onChange([...archivos, ...Array.from(e.target.files)].slice(0, max)); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <span className="campo-hint">Hasta {max} fotos. Desde el celular podés sacarlas en el momento.</span>
    </div>
  );
}

/** Grilla de fotos (miniaturas que abren la foto completa). */
export function GaleriaFotos({ fotos, vacia = 'Todavía no hay fotos.', mostrarOrigen = true }) {
  if (!fotos.length) return <p className="texto-suave">{vacia}</p>;
  return (
    <ul className="galeria">
      {fotos.map((f) => (
        <li key={f.id}>
          <a href={f.url || undefined} target="_blank" rel="noreferrer" className="galeria-item" title={f.descripcion || f.nombreArchivo || ''}>
            {f.url ? <img src={f.url} alt={f.descripcion || 'Foto de obra'} loading="lazy" /> : <span className="galeria-sin">Sin acceso</span>}
          </a>
          <div className="galeria-pie">
            <span>{dmy(f.fecha)}{f.rubro ? ` · ${f.rubro}` : ''}</span>
            {mostrarOrigen && f.origen !== 'Galería' && <Chip tipo="info">{f.origen}</Chip>}
            {f.descripcion && <span className="galeria-desc">{f.descripcion}</span>}
            {f.usuario && <span className="texto-suave">{f.usuario}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Nuevo reclamo. Empresa: elige gremio destinatario. Gremio: elige uno de sus rubros. */
export function NuevoReclamo({ obra, rubros, gremios, esGremio, onClose, onListo }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const [f, setF] = useState({ titulo: '', descripcion: '', rubro_id: rubros.length === 1 ? rubros[0].id : '', gremio_id: '' });
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const rubrosDelGremio = !esGremio && f.gremio_id ? rubros.filter((r) => gremios.find((g) => g.id === f.gremio_id)?.rubros.includes(r.id)) : rubros;
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        await crearReclamo(obra.id, { ...f, rubro_id: f.rubro_id || null, gremio_id: f.gremio_id || null, fotos, clave_idem: clave });
        toast('Reclamo enviado'); onListo();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <Sheet titulo={esGremio ? 'Nuevo reclamo a la empresa' : 'Nuevo reclamo a un gremio'} obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!esGremio && (
          <Campo label="Gremio" req>
            <select value={f.gremio_id} onChange={(e) => setF({ ...f, gremio_id: e.target.value, rubro_id: '' })} required>
              <option value="">Elegí…</option>
              {gremios.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
        )}
        {!esGremio && !gremios.length && <Aviso tipo="info">Esta obra no tiene gremios asignados. Asignalos en Usuarios.</Aviso>}
        <Campo label="Rubro" req={esGremio}>
          <select value={f.rubro_id} onChange={(e) => setF({ ...f, rubro_id: e.target.value })} required={esGremio}>
            <option value="">{esGremio ? 'Elegí…' : 'General (sin rubro)'}</option>
            {rubrosDelGremio.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Asunto" req><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required maxLength={120} placeholder={esGremio ? 'Ej.: Falta material' : 'Ej.: Pérdida en el baño PB'} /></Campo>
        <Campo label="Detalle"><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={3} /></Campo>
        <Campo label="Fotos"><FotosInput archivos={archivos} onChange={setArchivos} /></Campo>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Enviando…' : 'Enviar reclamo'}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Conversación de un reclamo, con respuesta, fotos y cambio de estado. */
export function ReclamoDetalle({ obra, id, onClose, onCambio }) {
  const toast = useToast();
  const [r, setR] = useState(null);
  const [txt, setTxt] = useState('');
  const [estado, setEstado] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const cargar = () => detalleReclamo(obra.id, id).then((d) => { setR(d); setEstado(d.estado); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        await responderReclamo(id, { texto: txt, estado: estado !== r.estado ? estado : null, fotos });
        setTxt(''); setArchivos([]); toast('Respuesta enviada'); await cargar(); onCambio?.();
      } catch (err) { setError(err.message); }
    });
  };
  if (!r) return <Sheet titulo="Reclamo" obra={obra.nombre} onClose={onClose}>{error ? <Aviso tipo="error">{error}</Aviso> : <div className="esqueleto" />}</Sheet>;
  return (
    <Sheet titulo={r.titulo} obra={obra.nombre} onClose={onClose} ancho>
      <div className="reclamo-cab">
        <Chip tipo={TONO_RECLAMO[r.estado]}>{ESTADO_RECLAMO[r.estado]}</Chip>
        <span className="chico texto-suave">{r.direccion === 'gremio_a_empresa' ? `De ${r.gremio || 'gremio'} a la empresa` : `De la empresa a ${r.gremio || 'gremio'}`}{r.rubro ? ` · ${r.rubro}` : ''} · {dmyHora(r.creado_en)}</span>
      </div>
      {r.descripcion && <p className="reclamo-desc">{r.descripcion}</p>}
      {r.fotos.length > 0 && <GaleriaFotos fotos={r.fotos} mostrarOrigen={false} />}
      <ol className="conversacion">
        {r.mensajes.map((m) => (
          <li key={m.id}>
            <div className="chico texto-suave"><strong>{m.usuario || '—'}</strong> · {dmyHora(m.creado_en)}</div>
            {m.texto && <p>{m.texto}</p>}
            {m.estado_nuevo && <div className="chico">Cambió el estado a <Chip tipo={TONO_RECLAMO[m.estado_nuevo]}>{ESTADO_RECLAMO[m.estado_nuevo]}</Chip></div>}
            {m.fotos.length > 0 && <GaleriaFotos fotos={m.fotos} mostrarOrigen={false} />}
          </li>
        ))}
      </ol>
      <form className="form grupo" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Responder"><textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={2} placeholder="Escribí una respuesta…" /></Campo>
        <Campo label="Fotos"><FotosInput archivos={archivos} onChange={setArchivos} max={4} /></Campo>
        <Campo label="Estado"><Segmentado value={estado} onChange={setEstado} nombre="Estado del reclamo" opciones={Object.entries(ESTADO_RECLAMO)} /></Campo>
        <div className="pie-form"><button className="btn btn-primario" disabled={cargando}>{cargando ? 'Enviando…' : 'Enviar'}</button></div>
      </form>
    </Sheet>
  );
}

/** Lista de reclamos (empresa o gremio). */
export function ListaReclamos({ reclamos, onAbrir }) {
  if (!reclamos.length) return <p className="texto-suave">No hay reclamos.</p>;
  return (
    <ul className="lista-movs">
      {reclamos.map((r) => (
        <li key={r.id}>
          <button className="mov" onClick={() => onAbrir(r.id)}>
            <div className="mov-fecha">{dmy(r.actualizado_en)}</div>
            <div className="mov-info">
              <div className="mov-concepto">{r.titulo}</div>
              <div className="mov-sub">{r.direccion === 'gremio_a_empresa' ? `${r.gremio || 'Gremio'} → empresa` : `Empresa → ${r.gremio || 'gremio'}`}{r.rubro ? ` · ${r.rubro}` : ''}</div>
            </div>
            <div className="mov-montos"><Chip tipo={TONO_RECLAMO[r.estado]}>{ESTADO_RECLAMO[r.estado]}</Chip></div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Parte de avance del gremio (porcentaje acumulado + fotos). */
export function ParteForm({ obra, rubros, ultimos = {}, onClose, onListo }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const [rubroId, setRubroId] = useState(rubros.length === 1 ? rubros[0].id : '');
  const [fecha, setFecha] = useState(hoyISO());
  const [txt, setTxt] = useState('');
  const [comentario, setComentario] = useState('');
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const valor = parseDecimal(txt);
  const ult = ultimos[rubroId];
  const enviar = (e) => {
    e.preventDefault();
    if (!rubroId) return setError('Elegí el rubro');
    if (valor == null || valor < 0 || valor > 100) return setError('El avance debe ser un porcentaje entre 0 y 100');
    if (!fecha) return setError('Fecha inválida');
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        await crearParte(rubroId, { fecha, porcentaje: valor, comentario, fotos, clave_idem: clave });
        toast('Parte de avance enviado: queda pendiente de aprobación'); onListo();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <Sheet titulo="Informar avance" obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Rubro" req>
          <select value={rubroId} onChange={(e) => setRubroId(Number(e.target.value) || '')} required>
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Campo>
        {ult && <div className="ultimo-avance"><span>Tu último parte</span><strong>{pct(ult.porcentaje)}</strong><span className="texto-suave chico">{dmy(ult.fecha)} · {ESTADO_PARTE[ult.estado]}</span><Barra valor={ult.porcentaje} /></div>}
        <div className="fila-campos">
          <Campo label="Fecha" req><FechaInput value={fecha} onChange={setFecha} required /></Campo>
          <Campo label="Avance acumulado (%)" req hint="Total del rubro a la fecha, no el incremento">
            <div className="importe-input"><input inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej.: 45" /><span className="importe-moneda">%</span></div>
          </Campo>
        </div>
        <Campo label="Comentario" hint="Qué se hizo"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} /></Campo>
        <Campo label="Fotos del avance"><FotosInput archivos={archivos} onChange={setArchivos} /></Campo>
        <p className="texto-suave chico">La empresa revisa el parte; cuando lo aprueba, pasa a ser el avance oficial del rubro.</p>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Enviando…' : 'Enviar parte'}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Tarjeta de un parte de avance (con fotos). */
export function TarjetaParte({ p, acciones }) {
  return (
    <li className="tarjeta-parte">
      <div className="fila-entre envolver">
        <div><strong>{p.rubro} · {pct(p.porcentaje)}</strong> <span className="chico texto-suave">al {dmy(p.fecha)} · {p.usuario}</span></div>
        <Chip tipo={TONO_PARTE[p.estado]}>{ESTADO_PARTE[p.estado]}</Chip>
      </div>
      {p.comentario && <p>{p.comentario}</p>}
      {p.motivo_revision && <p className="chico">{p.estado === 'rechazado' ? 'Motivo del rechazo' : 'Nota'}: {p.motivo_revision}{p.revisor ? ` (${p.revisor})` : ''}</p>}
      {p.fotos.length > 0 && <GaleriaFotos fotos={p.fotos} mostrarOrigen={false} />}
      {acciones}
    </li>
  );
}
