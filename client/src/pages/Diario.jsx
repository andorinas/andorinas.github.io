// Diario de obra (empresa): parte diario (clima, si se trabajó, personal) y novedades para el cliente.
import { useEffect, useMemo, useState } from 'react';
import {
  listarPartesDiarios, guardarParteDiario, listarNovedades, crearNovedad, anularNovedad, subirFotos, CLIMA, ICONO_CLIMA, TRABAJO,
} from '../datos.js';
import { dmy, hoyISO } from '../lib.js';
import { useObra, useToast } from '../ctx.js';
import { Campo, FechaInput, Aviso, Chip, Segmentado, Sheet, useCargando } from '../components/ui.jsx';
import { FotosInput, GaleriaFotos } from '../components/Gremios.jsx';
import { Calendario, useLluvia, resumenDias, LLUVIA_MM } from '../components/Portal.jsx';

function ParteDelDia({ obra, partes, fecha, setFecha, lluvia, onGuardado }) {
  const toast = useToast();
  const existente = partes.find((p) => p.fecha === fecha);
  const vacio = { clima: 'sol', trabajo: 'normal', personal: '', comentario: '' };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  useEffect(() => {
    setError(null);
    setF(existente ? { clima: existente.clima, trabajo: existente.trabajo, personal: existente.personal ?? '', comentario: existente.comentario || '' }
      : { ...vacio, clima: lluvia[fecha] >= LLUVIA_MM ? 'lluvia' : 'sol' });
  }, [fecha, existente?.id, existente?.actualizado_en]);
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        await guardarParteDiario(obra.id, { fecha, ...f, personal: f.personal === '' ? null : f.personal });
        toast(`Parte del ${dmy(fecha)} guardado`); onGuardado();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <form className="form" onSubmit={enviar}>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Campo label="Día" req hint={existente ? `Ya cargado por ${existente.usuario || '—'}: si guardás, se reemplaza.` : 'Tocá un día del calendario para verlo o corregirlo'}>
        <FechaInput value={fecha} onChange={(v) => v && setFecha(v)} max={hoyISO()} />
      </Campo>
      {lluvia[fecha] != null && <div className="chico texto-suave">Lluvia estimada en la zona ese día: <strong>{lluvia[fecha]} mm</strong></div>}
      <Campo label="Clima" req>
        <Segmentado value={f.clima} onChange={(v) => setF({ ...f, clima: v })} nombre="Clima del día"
          opciones={Object.keys(CLIMA).map((k) => [k, `${ICONO_CLIMA[k]} ${CLIMA[k]}`])} />
      </Campo>
      <Campo label="¿Se trabajó?" req>
        <Segmentado value={f.trabajo} onChange={(v) => setF({ ...f, trabajo: v })} nombre="Se trabajó"
          opciones={[['normal', 'Sí'], ['parcial', 'A medias'], ['no', 'No']]} />
      </Campo>
      <div className="fila-campos">
        <Campo label="Personal en obra" hint="Opcional"><input type="number" min="0" max="500" inputMode="numeric" value={f.personal} onChange={(e) => setF({ ...f, personal: e.target.value })} /></Campo>
      </div>
      <Campo label="Comentario interno" hint="El cliente no lo ve"><textarea rows={2} value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} maxLength={1000} placeholder="Ej.: Se suspendió el hormigonado por lluvia" /></Campo>
      <div className="pie-form"><button className="btn btn-primario" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar parte'}</button></div>
    </form>
  );
}

function NuevaNovedad({ obra, onClose, onListo }) {
  const toast = useToast();
  const [f, setF] = useState({ fecha: hoyISO(), titulo: '', texto: '', visible_cliente: true });
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        await crearNovedad(obra.id, { ...f, fotos });
        toast(f.visible_cliente ? 'Novedad publicada para el cliente' : 'Novedad interna guardada'); onListo();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <Sheet titulo="Publicar novedad" obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Título" req><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required maxLength={120} placeholder="Ej.: Terminamos la losa de planta alta" /></Campo>
        <Campo label="Texto" hint="Contale al cliente qué se hizo y qué sigue"><textarea rows={4} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} maxLength={3000} /></Campo>
        <Campo label="Fecha"><FechaInput value={f.fecha} onChange={(v) => setF({ ...f, fecha: v })} /></Campo>
        <Campo label="Fotos" hint="Opcional"><FotosInput archivos={archivos} onChange={setArchivos} max={12} /></Campo>
        <label className="fila-inline"><input type="checkbox" checked={f.visible_cliente} onChange={(e) => setF({ ...f, visible_cliente: e.target.checked })} /> Visible para el cliente</label>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Publicando…' : 'Publicar'}</button>
        </div>
      </form>
    </Sheet>
  );
}

export default function Diario() {
  const { obra, version, refrescar } = useObra();
  const toast = useToast();
  const hoy = hoyISO();
  const [partes, setPartes] = useState([]);
  const [novedades, setNovedades] = useState(null);
  const [fecha, setFecha] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState(null);
  const { lluvia, estado } = useLluvia(obra, obra.fecha_inicio, hoy);
  useEffect(() => {
    Promise.all([listarPartesDiarios(obra.id), listarNovedades(obra.id)])
      .then(([p, n]) => { setPartes(p); setNovedades(n); }).catch((e) => setError(e.message));
  }, [obra.id, version]);
  const res = useMemo(() => resumenDias(partes, lluvia, obra.fecha_inicio, hoy), [partes, lluvia, obra.fecha_inicio, hoy]);
  const anular = async (n) => {
    const motivo = window.prompt(`¿Quitar la novedad “${n.titulo}”? El cliente deja de verla. Motivo (opcional):`, '');
    if (motivo === null) return;
    try { await anularNovedad(n.id, motivo); toast('Novedad quitada'); refrescar(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="dos-col">
        <section className="panel">
          <h2>Parte diario</h2>
          <p className="chico texto-suave">Un registro por día: clima y si se pudo trabajar. El cliente ve el clima y si se trabajó (no el comentario interno), para entender los días perdidos por lluvia.</p>
          <ParteDelDia obra={obra} partes={partes} fecha={fecha} setFecha={(f) => { setFecha(f); setMes(f.slice(0, 7)); }} lluvia={lluvia} onGuardado={refrescar} />
        </section>
        <section className="panel">
          <h2>Calendario de la obra</h2>
          <div className="portal-dias-resumen">
            <div><strong>{res.trabajados}</strong><span>trabajados</span></div>
            <div><strong>{res.parciales}</strong><span>a medias</span></div>
            <div><strong>{res.perdidos}</strong><span>sin trabajar</span></div>
            {estado === 'ok' && <div><strong>{res.diasLluvia}</strong><span>días de lluvia · {res.mmTotal} mm</span></div>}
          </div>
          <Calendario dias={partes} lluvia={lluvia} mes={mes} onMes={setMes} desde={obra.fecha_inicio} onDia={(f) => setFecha(f)} seleccionado={fecha} />
          {estado === 'sin-ubicacion' && <Aviso tipo="info">Para ver la lluvia de la zona, cargá la ubicación de la obra en Configuración → Portal del cliente.</Aviso>}
          {estado === 'error' && <p className="chico texto-suave">No se pudo consultar la lluvia de la zona en este momento.</p>}
        </section>
      </div>

      <section className="panel">
        <div className="fila-entre envolver">
          <h2>Novedades para el cliente</h2>
          <button className="btn btn-primario" onClick={() => setNueva(true)}>＋ Publicar novedad</button>
        </div>
        {novedades === null ? <div className="esqueleto" /> : !novedades.length ? <p className="texto-suave">Todavía no se publicaron novedades.</p> : (
          <ol className="novedades">
            {novedades.map((n) => (
              <li key={n.id} className={n.anulada ? 'novedad-anulada' : ''}>
                <div className="fila-entre envolver">
                  <span className="chico texto-suave">{dmy(n.fecha)} · {n.usuario || '—'}</span>
                  <span className="fila-inline">
                    {n.anulada ? <Chip>Quitada</Chip> : n.visible_cliente ? <Chip tipo="ok">Visible para el cliente</Chip> : <Chip>Interna</Chip>}
                    {!n.anulada && <button className="link chico" onClick={() => anular(n)}>Quitar</button>}
                  </span>
                </div>
                <h3>{n.titulo}</h3>
                {n.texto && <p>{n.texto}</p>}
                {n.fotos.length > 0 && <GaleriaFotos fotos={n.fotos} mostrarOrigen={false} />}
              </li>
            ))}
          </ol>
        )}
      </section>
      {nueva && <NuevaNovedad obra={obra} onClose={() => setNueva(false)} onListo={() => { setNueva(false); refrescar(); }} />}
    </>
  );
}
