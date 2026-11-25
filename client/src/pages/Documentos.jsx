// Documentos de la obra (planos, contrato, permisos, etc.). La empresa elige cuáles ve el cliente en su portal.
import { useEffect, useState } from 'react';
import { listarDocumentos, crearDocumento, marcarDocumentoCliente, anularDocumento, CATEGORIA_DOC } from '../datos.js';
import { useObra, useToast } from '../ctx.js';
import { Aviso, Campo, Segmentado, AdjuntoInput, useCargando } from '../components/ui.jsx';
import { ListaDocumentos } from '../components/Portal.jsx';

const VACIO = { titulo: '', categoria: 'plano', visible: 'si', archivo: null };

export default function Documentos() {
  const { obra, version, refrescar } = useObra();
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [f, setF] = useState(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  useEffect(() => { listarDocumentos(obra.id).then(setDocs).catch((e) => setError(e.message)); }, [obra.id, version]);

  const guardar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null);
        await crearDocumento(obra.id, { archivo: f.archivo, titulo: f.titulo, categoria: f.categoria, visible_cliente: f.visible === 'si' });
        toast(f.visible === 'si' ? 'Documento subido: el cliente ya lo ve' : 'Documento subido (sólo la empresa)');
        setF(VACIO); setAbierto(false); refrescar();
      } catch (err) { setError(err.message); }
    });
  };
  const alternar = (d) => run(async () => {
    try { await marcarDocumentoCliente(d.id, !d.visible_cliente); toast(d.visible_cliente ? 'El cliente ya no lo ve' : 'Ahora lo ve el cliente'); refrescar(); }
    catch (err) { toast(err.message, 'error'); }
  });
  const quitar = (d) => {
    if (!window.confirm(`¿Quitar “${d.titulo}”? Deja de verse en la app (queda registrado en el historial).`)) return;
    run(async () => {
      try { await anularDocumento(d.id); toast('Documento quitado'); refrescar(); } catch (err) { toast(err.message, 'error'); }
    });
  };

  return (
    <section className="panel">
      <div className="fila-entre envolver">
        <h2>Documentos de la obra</h2>
        {!abierto && <button className="btn btn-primario" onClick={() => setAbierto(true)}>＋ Subir documento</button>}
      </div>
      <p className="texto-suave chico">Planos, contrato, permisos, memorias, certificados y garantías. Elegí cuáles ve el cliente en su portal. Formatos: PDF o foto, hasta 15 MB.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {abierto && (
        <form className="form grupo resaltado" onSubmit={guardar}>
          <Campo label="Archivo" req><AdjuntoInput archivo={f.archivo} onFile={(a) => setF((x) => ({ ...x, archivo: a, titulo: x.titulo || (a?.name || '').replace(/\.[^.]+$/, '') }))} /></Campo>
          <div className="fila-campos">
            <Campo label="Título" req><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={150} required placeholder="Ej.: Plano de planta baja" /></Campo>
            <Campo label="Tipo"><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {Object.entries(CATEGORIA_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          </div>
          <Campo label="¿Lo ve el cliente?"><Segmentado value={f.visible} onChange={(v) => setF({ ...f, visible: v })} nombre="Visible para el cliente" opciones={[['si', '👁 Sí, compartir'], ['no', '🔒 Sólo la empresa']]} /></Campo>
          <div className="pie-form">
            <button type="button" className="btn btn-fantasma" onClick={() => { setAbierto(false); setF(VACIO); setError(null); }}>Cancelar</button>
            <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Subiendo…' : 'Subir'}</button>
          </div>
        </form>
      )}
      {docs === null ? <div className="esqueleto" /> : (
        <ListaDocumentos documentos={docs} vacia="Todavía no se subieron documentos." acciones={(d) => (
          <div className="doc-acciones">
            <button type="button" className={`foto-cliente ${d.visible_cliente ? 'si' : ''}`} onClick={() => alternar(d)} disabled={cargando}
              aria-pressed={!!d.visible_cliente}>
              {d.visible_cliente ? '👁 La ve el cliente' : '🔒 Sólo la empresa'}</button>
            <button type="button" className="link chico" onClick={() => quitar(d)} disabled={cargando}>Quitar</button>
          </div>
        )} />
      )}
    </section>
  );
}
