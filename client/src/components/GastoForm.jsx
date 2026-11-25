import { useEffect, useMemo, useRef, useState } from 'react';
import { api, subirAdjunto, hoyISO, uuid, money, dmy, tc } from '../lib.js';
import { Sheet, Campo, Segmentado, FechaInput, ImporteInput, Aviso, AdjuntoInput, useCargando } from './ui.jsx';
import { useToast } from '../ctx.js';

/** Selector con alta en línea: crea el ítem sin salir del formulario (no se pierde lo escrito). */
function SelectConAlta({ label, value, onChange, opciones, onCrear, placeholderNuevo }) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [err, setErr] = useState(null);
  const [cargando, run] = useCargando();
  const crear = () => run(async () => {
    try { setErr(null); const id = await onCrear(nombre.trim()); onChange(id); setCreando(false); setNombre(''); }
    catch (e) { setErr(e.message); }
  });
  return (
    <Campo label={label} req error={err}>
      {!creando ? (
        <div className="fila-inline">
          <select value={value || ''} onChange={(e) => onChange(Number(e.target.value) || null)} required>
            <option value="">Elegí…</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <button type="button" className="btn btn-sec" onClick={() => setCreando(true)}>+ Nuevo</button>
        </div>
      ) : (
        <div className="fila-inline">
          <input autoFocus placeholder={placeholderNuevo} value={nombre} onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (nombre.trim()) crear(); } if (e.key === 'Escape') setCreando(false); }} />
          <button type="button" className="btn btn-primario" disabled={!nombre.trim() || cargando} onClick={crear}>Crear</button>
          <button type="button" className="btn btn-fantasma" onClick={() => setCreando(false)}>Volver</button>
        </div>
      )}
    </Campo>
  );
}

export function useCotizacion(fecha) {
  const [cot, setCot] = useState(null);
  useEffect(() => {
    if (!fecha) return setCot(null);
    let vivo = true;
    setCot({ cargando: true });
    const t = setTimeout(() => api(`/api/cotizacion?fecha=${fecha}`).then((c) => vivo && setCot(c)).catch((e) => vivo && setCot({ estado: 'pendiente', error: e.message })), 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [fecha]);
  return cot;
}

export function LineaCotizacion({ cot, fecha }) {
  if (!cot) return null;
  if (cot.cargando) return <div className="cotizacion-linea">Buscando cotización BNA…</div>;
  if (cot.estado === 'ok') {
    return (
      <div className="cotizacion-linea">
        BNA billete venta: <strong>{tc(cot.valor)}</strong>
        {cot.fecha !== fecha && <> · publicada el <strong>{dmy(cot.fecha)}</strong> (sin publicación el {dmy(fecha)})</>}
      </div>
    );
  }
  return <div className="cotizacion-linea alerta">⚠ Cotización pendiente: {cot.error}. Podés guardar igual: el importe queda en su moneda original y se convierte solo cuando el administrador cargue la cotización.</div>;
}

export default function GastoForm({ obra, onClose, onListo, rubroInicial, recargarObra }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const [cat, setCat] = useState({ tipos: [], proveedores: [] });
  const [rubros, setRubros] = useState(obra.rubros.filter((r) => r.activo));
  const [f, setF] = useState({
    fecha: hoyISO(), concepto: '', rubro_id: rubroInicial || null, tipo_id: null, moneda: 'ARS', importe: null,
    condicion: 'contado', proveedor: '', vencimiento: '', anticipo: null, anticipoFecha: '',
  });
  const [archivo, setArchivo] = useState(null);
  const subido = useRef(null); // comprobante ya subido en un intento anterior
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const cot = useCotizacion(f.fecha);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { api('/api/catalogo').then(setCat).catch((e) => setError(`No se pudieron cargar rubros y tipos de gasto (${e.message}). Revisá la conexión y volvé a intentar.`)); }, []);

  const crearRubro = async (nombre) => {
    const { id } = await api(`/api/obras/${obra.id}/rubros`, { method: 'POST', body: { nombre } });
    const o = await api(`/api/obras/${obra.id}`); setRubros(o.rubros.filter((r) => r.activo)); recargarObra?.();
    return id;
  };
  const crearTipo = async (nombre) => {
    const { id } = await api('/api/tipos', { method: 'POST', body: { nombre } });
    setCat(await api('/api/catalogo'));
    return id;
  };

  const enviar = (e) => {
    e.preventDefault();
    if (!f.importe || f.importe <= 0) return setError('Ingresá un importe mayor a cero');
    if (!f.rubro_id || !f.tipo_id) return setError('Elegí rubro y tipo de gasto');
    if (f.anticipo && f.anticipo > f.importe) return setError('El anticipo no puede superar el importe acordado');
    run(async () => {
      try {
        setError(null);
        let adjunto_id = null;
        // Si el alta falla después de subir el comprobante, el reintento reusa ese archivo (no lo sube dos veces).
        if (archivo) { if (subido.current?.archivo !== archivo) subido.current = { archivo, id: (await subirAdjunto(obra.id, archivo)).id }; adjunto_id = subido.current.id; }
        const body = {
          fecha: f.fecha, concepto: f.concepto, rubro_id: f.rubro_id, tipo_id: f.tipo_id, moneda: f.moneda, importe: f.importe,
          condicion: f.condicion, proveedor: f.proveedor || null, adjunto_id, clave_idem: clave,
          vencimiento: f.condicion !== 'contado' ? f.vencimiento || null : null,
          anticipo: f.condicion !== 'contado' && f.anticipo ? { importe: f.anticipo, fecha: f.anticipoFecha || f.fecha } : null,
        };
        const r = await api(`/api/obras/${obra.id}/gastos`, { method: 'POST', body });
        toast(r.duplicado ? 'Ese gasto ya estaba registrado (no se duplicó).' : `Gasto registrado: ${money(f.importe, f.moneda)}${f.condicion === 'contado' ? ' (pagado al contado)' : ''}`);
        onListo();
      } catch (err) { setError(err.message); }
    });
  };

  const aCuenta = f.condicion !== 'contado';
  return (
    <Sheet titulo="Agregar gasto" obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Condición de pago" req>
            <Segmentado value={f.condicion} onChange={set('condicion')} nombre="Condición de pago"
              opciones={[['contado', 'Contado'], ['a_cuenta', 'A cuenta'], ['contrato', 'Contratación']]} />
          </Campo>
        <Campo label="Fecha" req><FechaInput value={f.fecha} onChange={set('fecha')} required /></Campo>
        <p className="texto-suave chico ayuda-condicion">
          {f.condicion === 'contado' ? 'Se registra la compra y su pago total en un solo paso.'
            : f.condicion === 'a_cuenta' ? 'Compra a pagar después: queda pendiente con su saldo.'
              : 'Contratación por importe acordado: admite anticipo, pagos parciales y vencimiento.'}
        </p>
        <Campo label="Concepto" req><input value={f.concepto} onChange={(e) => set('concepto')(e.target.value)} required maxLength={200} placeholder="Ej.: Cables unipolares 2,5 mm²" /></Campo>
        <div className="fila-campos">
          <SelectConAlta label="Rubro de obra" value={f.rubro_id} onChange={set('rubro_id')} opciones={rubros} onCrear={crearRubro} placeholderNuevo="Nombre del rubro" />
          <SelectConAlta label="Tipo de gasto" value={f.tipo_id} onChange={set('tipo_id')} opciones={cat.tipos} onCrear={crearTipo} placeholderNuevo="Nombre del tipo" />
        </div>
        <div className="fila-campos">
          <Campo label="Moneda" req><Segmentado value={f.moneda} onChange={set('moneda')} nombre="Moneda" opciones={[['ARS', 'ARS'], ['USD', 'USD']]} /></Campo>
          <Campo label={aCuenta ? 'Importe acordado' : 'Importe'} req><ImporteInput value={f.importe} onChange={set('importe')} moneda={f.moneda} /></Campo>
        </div>
        <LineaCotizacion cot={cot} fecha={f.fecha} />
        <Campo label={aCuenta ? 'Proveedor o contratista' : 'Proveedor'} hint="Opcional">
          <input list="lista-proveedores" value={f.proveedor} onChange={(e) => set('proveedor')(e.target.value)} placeholder="Escribí o elegí" />
          <datalist id="lista-proveedores">{cat.proveedores.map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
        </Campo>
        {aCuenta && (
          <fieldset className="grupo">
            <legend>Saldo y anticipo</legend>
            <div className="fila-campos">
              <Campo label="Vencimiento" hint="Opcional"><FechaInput value={f.vencimiento} onChange={set('vencimiento')} /></Campo>
              <Campo label={`Anticipo pagado hoy (${f.moneda})`} hint="Opcional"><ImporteInput value={f.anticipo} onChange={set('anticipo')} moneda={f.moneda} /></Campo>
            </div>
            {f.anticipo > 0 && (
              <>
                <Campo label="Fecha del anticipo"><FechaInput value={f.anticipoFecha || f.fecha} onChange={set('anticipoFecha')} /></Campo>
                <p className="texto-suave chico">Quedará pendiente: <strong>{money(Math.max(0, (f.importe || 0) - f.anticipo), f.moneda)}</strong></p>
              </>
            )}
          </fieldset>
        )}
        <Campo label="Comprobante" hint="Foto o PDF, opcional"><AdjuntoInput archivo={archivo} onFile={setArchivo} /></Campo>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar gasto'}</button>
        </div>
      </form>
    </Sheet>
  );
}
