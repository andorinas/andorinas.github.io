# Pendientes de ControlAr

Temas detectados y dejados para más adelante por decisión. Origen: auditoría de QA del 25/11/2026
([informe](auditoria/informe-qa-2026-11-25.md)); lo demás de esa auditoría ya está corregido
(migraciones 010 y 011).

## 1. Cotización manual visible para clientes y gremios

- **Qué pasa:** la cotización manual del dólar de cada obra (`obras.cotizacion_manual`) está en la ficha de la obra.
  - Los clientes y gremios pueden leer esa ficha completa por la política `obras_leer` (`supabase/migraciones/008_clientes.sql`).
  - La app no la muestra en el portal, pero se puede ver con herramientas técnicas usando el propio usuario.
  - También se ve `creado_por`.
- **Por qué no es trivial:** todos los usuarios con sesión comparten el rol `authenticated` de la base. RLS filtra qué filas ve cada uno, no qué columnas; la empresa sí necesita el dato.
- **Riesgo:** bajo.
  - No es un importe, sólo el valor de referencia del dólar.
  - Sólo se ve hurgando.
  - Al 25/11/2026 no hay clientes ni gremios cargados en producción.

  Puede importar si se negocia con clientes en dólares.
- **Solución propuesta** (elegida, a hacer más adelante): mover la cotización manual a una tabla aparte (p. ej. `obras_config`) que sólo puedan leer administrador y encargados.
  - Ajustar `definir_cotizacion_manual`, la carga de la obra en `client/src/datos.js` y el cálculo.
  - Agregar un test de que cliente y gremio no la leen.
- **Alternativa:** que clientes y gremios no lean `obras` directamente y reciban sólo lo necesario vía funciones, como `portal_obra`.
- **Conviene hacerlo:** antes de dar usuarios a clientes con los que se negocie en dólares.

## 2. Lista de obras lenta con muchas obras

- **Qué pasa:** la pantalla de obras calcula cada obra completa para mostrar sus totales, con unos 8 pedidos a la base por obra (`client/src/datos.js`, ruta `GET /api/obras`).
  - Con pocas obras no se nota; con 30 o más serían más de 240 pedidos.
  - La pantalla de Usuarios usa esa misma ruta sólo para los nombres de las obras.
- **Solución propuesta:**
  - una función de resumen en la base que devuelva los totales de todas las obras en un solo pedido;
  - en Usuarios, pedir sólo `id, nombre`.
- **Conviene hacerlo:** cuando la lista de obras empiece a tardar o haya alrededor de 15 obras activas.
