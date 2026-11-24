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
export function GaleriaFotos({ fotos, vacia = 'Todavía no hay fotos.', mostrarOrigen = true, onToggleCliente }) {
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
            {onToggleCliente && (
              <button type="button" className={`foto-cliente ${f.visible_cliente ? 'si' : ''}`} onClick={() => onToggleCliente(f)}
                aria-pressed={!!f.visible_cliente} title={f.visible_cliente ? 'El cliente ve esta foto. Tocá para ocultarla.' : 'El cliente no ve esta foto. Tocá para mostrársela.'}>
                {f.visible_cliente ? '👁 La ve el cliente' : '🔒 Sólo la empresa'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Quién le escribe a quién, para mostrar en listas y detalle. */
export function direccionReclamo(r) {
  switch (r.direccion) {
    case 'gremio_a_empresa': return `${r.gremio || 'Gremio'} → empresa`;
    case 'empresa_a_gremio': return `Empresa → ${r.gremio || 'gremio'}`;
    case 'cliente_a_empresa': return `${r.cliente || 'Cliente'} → empresa`;
    case 'empresa_a_cliente': return `Empresa → ${r.cliente || 'cliente'}`;
    default: return '';
  }
}

/** Nuevo reclamo / consulta. Empresa: elige gremio o cliente. Gremio: uno de sus rubros. Cliente: consulta a la empresa. */
export function NuevoReclamo({ obra, rubros, gremios, clientes = [], esGremio, esCliente, onClose, onListo }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const empresa = !esGremio && !esCliente;
  const [f, setF] = useState({ titulo: '', descripcion: '', rubro_id: rubros.length === 1 ? rubros[0].id : '', para: '' });
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const [tipoPara, idPara] = f.para.split(':');
  const rubrosVisibles = empresa && tipoPara === 'g' ? rubros.filter((r) => gremios.find((g) => g.id === idPara)?.rubros.includes(r.id)) : rubros;
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        await crearReclamo(obra.id, { titulo: f.titulo, descripcion: f.descripcion, rubro_id: f.rubro_id || null,
          gremio_id: tipoPara === 'g' ? idPara : null, cliente_id: tipoPara === 'c' ? idPara : null, fotos, clave_idem: clave });
        toast(esCliente ? 'Consulta enviada' : 'Mensaje enviado'); onListo();
      } catch (err) { setError(err.message); }
    });
  };
  const titulo = esCliente ? 'Nueva consulta a Andorinas' : esGremio ? 'Nuevo reclamo a la empresa' : 'Nuevo mensaje a un gremio o cliente';
  return (
    <Sheet titulo={titulo} obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {empresa && (
          <Campo label="Para" req>
            <select value={f.para} onChange={(e) => setF({ ...f, para: e.target.value, rubro_id: '' })} required>
              <option value="">Elegí…</option>
              {gremios.length > 0 && <optgroup label="Gremios">{gremios.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.nombre}</option>)}</optgroup>}
              {clientes.length > 0 && <optgroup label="Clientes">{clientes.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.nombre}</option>)}</optgroup>}
            </select>
          </Campo>
        )}
        {empresa && !gremios.length && !clientes.length && <Aviso tipo="info">Esta obra no tiene gremios ni clientes asignados. Asignalos en Usuarios.</Aviso>}
        {!esCliente && (
          <Campo label="Rubro" req={esGremio}>
            <select value={f.rubro_id} onChange={(e) => setF({ ...f, rubro_id: e.target.value })} required={esGremio}>
              <option value="">{esGremio ? 'Elegí…' : 'General (sin rubro)'}</option>
              {rubrosVisibles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Asunto" req><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required maxLength={120}
          placeholder={esCliente ? 'Ej.: ¿Cuándo empiezan con la pintura?' : esGremio ? 'Ej.: Falta material' : 'Ej.: Pérdida en el baño PB'} /></Campo>
        <Campo label={esCliente ? 'Tu consulta' : 'Detalle'}><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={3} /></Campo>
        <Campo label="Fotos" hint={esCliente ? 'Opcional' : undefined}><FotosInput archivos={archivos} onChange={setArchivos} /></Campo>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Enviando…' : esCliente ? 'Enviar consulta' : esGremio ? 'Enviar reclamo' : 'Enviar'}</button>
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
        <span className="chico texto-suave">{direccionReclamo(r)}{r.rubro ? ` · ${r.rubro}` : ''} · {dmyHora(r.creado_en)}</span>
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
export function ListaReclamos({ reclamos, onAbrir, vacia = 'No hay reclamos.' }) {
  if (!reclamos.length) return <p className="texto-suave">{vacia}</p>;
  return (
    <ul className="lista-movs">
      {reclamos.map((r) => (
        <li key={r.id}>
          <button className="mov" onClick={() => onAbrir(r.id)}>
            <div className="mov-fecha">{dmy(r.actualizado_en)}</div>
            <div className="mov-info">
              <div className="mov-concepto">{r.titulo}</div>
              <div className="mov-sub">{direccionReclamo(r)}{r.rubro ? ` · ${r.rubro}` : ''}</div>
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
