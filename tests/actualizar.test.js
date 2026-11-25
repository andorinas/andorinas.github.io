// supabase/actualizar.sql sobre una base como la de producción (instalada hasta gremios, con datos): no rompe nada y es re-ejecutable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearBase, crearUsuario, como } from './db.js';

test('actualizar.sql aplica la etapa 2 sobre una base como la de producción (hasta 008), dos veces seguidas', async () => {
  const pg = await crearBase({ hasta: '008_clientes.sql' });
  await pg.query("insert into configuracion values ('admin_email', 'admin@test')");
  const admin = como(pg, await crearUsuario(pg, 'admin@test'));
  const gremio = como(pg, await crearUsuario(pg, 'gremio@test', 'gremio'));
  const obra = await admin.rpc('crear_obra', { p: { nombre: 'Lote 27B', fecha_inicio: '2026-11-20', rubros: ['Estructura'] } });
  const [r] = await admin.query('select id from rubros where obra_id = $1', [obra]);
  await admin.rpc('asignar_rubros_gremio', { p_usuario: gremio.id, p_rubros: [r.id] });
  await gremio.rpc('crear_reclamo', { p_obra: obra, p: { rubro_id: r.id, titulo: 'Falta material' } });

  const sql = fs.readFileSync('supabase/actualizar.sql', 'utf8');
  await pg.exec(sql);
  await pg.exec(sql);

  const cliente = como(pg, await crearUsuario(pg, 'cliente@test', 'cliente'));
  await admin.rpc('asignar_obras_cliente', { p_usuario: cliente.id, p_obras: [obra] });
  const p = await cliente.rpc('portal_obra', { p_obra: obra });
  assert.equal(p.obra.nombre, 'Lote 27B');
  assert.equal((await gremio.query('select * from reclamos')).length, 1, 'los reclamos del gremio siguen visibles');
  assert.equal((await cliente.query('select * from reclamos')).length, 0);
  const anon = (await pg.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].n;
  assert.equal(anon, 1, 'anon sólo puede ejecutar ping()');
});
