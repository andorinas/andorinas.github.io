import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money0, pct, dmy, ESTADO_OBRA } from '../lib.js';
import { useAuth } from '../ctx.js';
import { Barra, Chip, Aviso } from '../components/ui.jsx';

const TONO_ESTADO = { en_curso: 'ok', planificada: 'info', pausada: 'alerta', finalizada: 'neutro' };

export default function Obras() {
  const { user } = useAuth();
  const [obras, setObras] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/api/obras').then(setObras).catch((e) => setError(e.message)); }, []);

  return (
    <main className="contenedor">
      <div className="titulo-fila">
        <div>
          <h1>Obras</h1>
          <p className="texto-suave">Elegí una obra para abrir su tablero. Cifras en ARS, criterio BNA vendedor histórico.</p>
        </div>
        {user.rol === 'admin' && <Link to="/obras/nueva" className="btn btn-primario">+ Nueva obra</Link>}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {obras && !obras.length && (
        <div className="vacio">
          <p>{user.rol === 'admin' ? 'Todavía no hay obras cargadas.' : 'No tenés obras asignadas. Pedile al administrador que te asigne una.'}</p>
          {user.rol === 'admin' && <Link to="/obras/nueva" className="btn btn-primario">Crear la primera obra</Link>}
        </div>
      )}
      <div className="grilla-obras">
        {obras?.map((o) => (
          <Link key={o.id} to={`/obras/${o.id}`} className="tarjeta-obra">
            <div className="tarjeta-obra-cab">
              <h2>{o.nombre}</h2>
              <Chip tipo={TONO_ESTADO[o.estado]}>{ESTADO_OBRA[o.estado]}</Chip>
            </div>
            <div className="texto-suave chico">{[o.ubicacion, `Inicio ${dmy(o.fecha_inicio)}`].filter(Boolean).join(' · ')}</div>
            <div className="tarjeta-obra-avance">
              <div className="fila-entre"><span>Avance general</span>
                <strong>{o.avance.estado === 'ok' ? pct(o.avance.valor) : 'Pendiente de ponderación'}</strong></div>
              <Barra valor={o.avance.valor} />
            </div>
            <dl className="mini-kpis">
              <div><dt>Comprometido</dt><dd>{money0(o.totales.comprometido, 'ARS')}</dd></div>
              <div><dt>Pagado</dt><dd>{money0(o.totales.pagado, 'ARS')}</dd></div>
              <div><dt>Pendiente</dt><dd>{money0(o.totales.pendiente, 'ARS')}</dd></div>
            </dl>
            <div className="tarjeta-obra-alertas">
              {o.desvios > 0 && <Chip tipo="error">{o.desvios} rubro{o.desvios > 1 ? 's' : ''} con desvío</Chip>}
              {!o.completo && <Chip tipo="alerta">Cotización pendiente</Chip>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
