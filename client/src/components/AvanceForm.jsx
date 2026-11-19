import { useMemo, useState } from 'react';
import { api, subirAdjunto, hoyISO, uuid, pct, dmy, parseDecimal } from '../lib.js';
import { Sheet, Campo, FechaInput, Aviso, AdjuntoInput, Barra, useCargando } from './ui.jsx';
import { useToast } from '../ctx.js';

export default function AvanceForm({ obra, onClose, onListo, rubroInicial }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const rubros = obra.rubros.filter((r) => r.activo);
  const [rubroId, setRubroId] = useState(rubroInicial || null);
  const [fecha, setFecha] = useState(hoyISO());
  const [txt, setTxt] = useState('');
  const [comentario, setComentario] = useState('');
  const [motivo, setMotivo] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();

  const rubro = rubros.find((r) => r.id === rubroId);
  const ultimo = rubro?.ultimoAvance;
  const valor = parseDecimal(txt);
  const baja = ultimo && valor != null && valor < ultimo.porcentaje;
  const fuera = valor != null && (valor < 0 || valor > 100);

  const enviar = (e) => {
    e.preventDefault();
    if (!rubro) return setError('Elegí un rubro');
    if (valor == null || fuera) return setError('El avance acumulado debe estar entre 0 y 100 %');
    if (baja && !motivo.trim()) return setError('Indicá el motivo de la corrección a la baja');
    run(async () => {
      try {
        setError(null);
        let adjunto_id = null;
        if (archivo) adjunto_id = (await subirAdjunto(obra.id, archivo)).id;
        await api(`/api/rubros/${rubro.id}/avances`, { method: 'POST', body: { fecha, porcentaje: valor, comentario, motivo_baja: baja ? motivo : null, adjunto_id, clave_idem: clave } });
        toast(`Avance de ${rubro.nombre}: ${pct(valor)}`);
        onListo();
      } catch (err) { setError(err.message); }
    });
  };

  return (
    <Sheet titulo="Cargar avance" obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Rubro" req>
          <select value={rubroId || ''} onChange={(e) => setRubroId(Number(e.target.value) || null)} required autoFocus>
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.ultimoAvance ? ` — ${pct(r.ultimoAvance.porcentaje)}` : ' — sin avance'}</option>)}
          </select>
        </Campo>
        {rubro && (
          <div className="ultimo-avance">
            <span>Último avance cargado</span>
            {ultimo ? <><strong>{pct(ultimo.porcentaje)}</strong><span className="texto-suave"> el {dmy(ultimo.fecha)}</span><Barra valor={ultimo.porcentaje} /></>
              : <strong>Sin avance cargado</strong>}
          </div>
        )}
        <div className="fila-campos">
          <Campo label="Fecha" req><FechaInput value={fecha} onChange={setFecha} required /></Campo>
          <Campo label="Avance acumulado (%)" req hint="Porcentaje total del rubro a la fecha, no el incremento" error={fuera ? 'Debe estar entre 0 y 100' : null}>
            <div className="importe-input"><input inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej.: 45" /><span className="importe-moneda">%</span></div>
          </Campo>
        </div>
        <input type="range" min="0" max="100" step="5" value={valor ?? ultimo?.porcentaje ?? 0} onChange={(e) => setTxt(e.target.value)} aria-label="Deslizar avance" className="rango" />
        {baja && (
          <Campo label="Motivo de la corrección a la baja" req hint={`Baja de ${pct(ultimo.porcentaje)} a ${pct(valor)}`}>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} required />
          </Campo>
        )}
        <Campo label="Comentario" hint="Opcional"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} /></Campo>
        <Campo label="Foto" hint="Opcional"><AdjuntoInput foto archivo={archivo} onFile={setArchivo} /></Campo>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar avance'}</button>
        </div>
      </form>
    </Sheet>
  );
}
