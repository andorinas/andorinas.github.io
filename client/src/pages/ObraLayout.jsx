import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { api, hoyISO, ESTADO_OBRA } from '../lib.js';
import { pendientesObra } from '../datos.js';
import { ObraCtx, useAuth, useToast } from '../ctx.js';
import { Aviso, Chip } from '../components/ui.jsx';
import GastoForm from '../components/GastoForm.jsx';
import PagoForm from '../components/PagoForm.jsx';
import AvanceForm from '../components/AvanceForm.jsx';
import DetalleCompromiso from '../components/DetalleCompromiso.jsx';

const leerVista = (id) => {
  try { const v = JSON.parse(localStorage.getItem(`vista-${id}`)); if (v) return { ...v, corte: '' }; } catch { /* sin almacenamiento */ }
  return { moneda: 'ARS', criterio: 'historico', corte: '' };
};

export default function ObraLayout() {
  const { obraId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [obra, setObra] = useState(null);
  const [error, setError] = useState(null);
  const [vista, setVistaState] = useState(() => leerVista(obraId));
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState(null); // {tipo, ...opciones}
  const [pend, setPend] = useState({ partes: 0, reclamos: 0 });
  useEffect(() => { pendientesObra(obraId).then(setPend).catch(() => {}); }, [obraId, version]);

  const recargarObra = useCallback(() => api(`/api/obras/${obraId}`).then(setObra)
    .catch((e) => setObra((actual) => { if (actual) { toast(e.message, 'error'); return actual; } setError(e); return actual; })), [obraId]);
  useEffect(() => { setObra(null); setError(null); setVistaState(leerVista(obraId)); recargarObra(); }, [obraId, recargarObra]);
  const setVista = (v) => setVistaState((prev) => {
    const n = { ...prev, ...v };
    try { localStorage.setItem(`vista-${obraId}`, JSON.stringify({ moneda: n.moneda, criterio: n.criterio })); } catch { /* ignore */ }
    return n;
  });
  const refrescar = useCallback(() => { setVersion((v) => v + 1); recargarObra(); }, [recargarObra]);

  const ctx = useMemo(() => ({
    obra, recargarObra, vista: { ...vista, corte: vista.corte || hoyISO(), esHoy: !vista.corte }, setVista, version, refrescar,
    abrir: (tipo, op = {}) => setModal({ tipo, ...op }),
  }), [obra, vista, version, recargarObra, refrescar]);

  if (error) {
    return <main className="contenedor"><Aviso tipo="error">{error.status === 403 ? 'No tenés acceso a esta obra.' : error.message}</Aviso><Link to="/" className="btn">Volver a obras</Link></main>;
  }
  if (!obra) return <main className="contenedor"><div className="esqueleto" /></main>;

  const cerrar = () => setModal(null);
  const listo = () => { setModal(null); refrescar(); };

  return (
    <ObraCtx.Provider value={ctx}>
      {/* Nombre de la obra activa SIEMPRE visible (barra fija) */}
      <div className="obra-barra">
        <div className="obra-barra-int">
          <div className="obra-activa">
            <Link to="/" className="obra-cambiar" aria-label="Cambiar de obra">‹</Link>
            <div className="obra-activa-txt">
              <span className="obra-activa-label">Obra activa</span>
              <strong className="obra-activa-nombre">{obra.nombre}</strong>
            </div>
            <Chip tipo={obra.estado === 'en_curso' ? 'ok' : 'neutro'}>{ESTADO_OBRA[obra.estado]}</Chip>
          </div>
          <div className="acciones-cab">
            <button className="btn btn-accion" onClick={() => ctx.abrir('gasto')}>＋ Agregar gasto</button>
            <button className="btn btn-accion" onClick={() => ctx.abrir('pago')}>$ Registrar pago</button>
            <button className="btn btn-accion" onClick={() => ctx.abrir('avance')}>▲ Cargar avance</button>
          </div>
        </div>
        <nav className="pestanas" aria-label="Secciones de la obra">
          <NavLink end to="">Tablero</NavLink>
          <NavLink to="movimientos">Movimientos</NavLink>
          <NavLink to="avance">Avance{pend.partes > 0 && <span className="badge">{pend.partes}</span>}</NavLink>
          <NavLink to="diario">Diario</NavLink>
          <NavLink to="fotos">Fotos</NavLink>
          <NavLink to="documentos">Documentos</NavLink>
          <NavLink to="reclamos">Reclamos{pend.reclamos > 0 && <span className="badge">{pend.reclamos}</span>}</NavLink>
          <NavLink to="cliente">Vista del cliente</NavLink>
          {user.rol === 'admin' && <NavLink to="configuracion">Configuración</NavLink>}
        </nav>
      </div>

      <main className="contenedor con-barra-acciones"><Outlet /></main>

      {/* Celular: las tres acciones principales a un toque, fijas abajo */}
      <div className="barra-acciones" role="toolbar" aria-label="Acciones rápidas">
        <button onClick={() => ctx.abrir('gasto')}><span className="ico">＋</span>Gasto</button>
        <button onClick={() => ctx.abrir('pago')}><span className="ico">$</span>Pago</button>
        <button onClick={() => ctx.abrir('avance')}><span className="ico">▲</span>Avance</button>
      </div>

      {modal?.tipo === 'gasto' && <GastoForm obra={obra} onClose={cerrar} onListo={listo} rubroInicial={modal.rubroId} recargarObra={recargarObra} />}
      {modal?.tipo === 'pago' && <PagoForm obra={obra} onClose={cerrar} onListo={listo} compromisoId={modal.compromisoId} />}
      {modal?.tipo === 'avance' && <AvanceForm obra={obra} onClose={cerrar} onListo={listo} rubroInicial={modal.rubroId} />}
      {modal?.tipo === 'detalle' && <DetalleCompromiso obra={obra} id={modal.id} onClose={cerrar} onCambio={refrescar}
        onPagar={(id) => setModal({ tipo: 'pago', compromisoId: id })} />}
    </ObraCtx.Provider>
  );
}
