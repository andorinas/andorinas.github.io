-- ControlAr · 005 · Quién puede ejecutar cada función
-- Por defecto Postgres permite ejecutar funciones a cualquiera: se restringe a usuarios autenticados,
-- y las funciones internas (prefijo _) no se exponen.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.es_admin(), public.es_usuario_activo(), public.puede_ver_obra(bigint),
  public.cotizacion_para(date), public.cargar_cotizacion(date, double precision, text, boolean),
  public.actualizar_usuario(uuid, jsonb),
  public.crear_obra(jsonb), public.actualizar_obra(bigint, jsonb), public.definir_cotizacion_manual(bigint, double precision),
  public.crear_rubro(bigint, text), public.actualizar_rubro(bigint, jsonb), public.definir_pesos(bigint, jsonb), public.crear_tipo(text),
  public.definir_presupuesto(bigint, jsonb), public.crear_gasto(bigint, jsonb), public.preparar_pago(bigint, jsonb),
  public.registrar_pago(bigint, jsonb), public.corregir_compromiso(bigint, jsonb), public.anular_compromiso(bigint, text),
  public.anular_pago(bigint, text), public.cargar_avance(bigint, jsonb), public.anular_avance(bigint, text),
  public.registrar_adjunto(bigint, text, text, text, bigint), public.exportar_respaldo(), public._obra_de_ruta(text),
  public.directorio()
to authenticated;

-- Las políticas de Storage evalúan estas funciones con el rol del usuario.
grant execute on function public._obra_de_ruta(text), public.puede_ver_obra(bigint) to authenticated;

-- Única función abierta sin sesión: ping para mantener activo el proyecto gratuito.
grant execute on function public.ping() to anon, authenticated;

-- Que futuras funciones tampoco queden abiertas por defecto.
-- (ver 006: los privilegios por defecto se ajustan "for role postgres", que es quien crea las funciones)
