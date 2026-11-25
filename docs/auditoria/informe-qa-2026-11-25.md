# Reporte de QA — ControlAr (Andorinas) — Auditoría general — 25/11/2026

## 1. Resumen ejecutivo

Se auditó la app completa: seguridad de los datos por rol, la app publicada (sin usuario y sin modificar nada), el código y la copia de prueba con datos ficticios.

La base es sólida:
- Desde afuera no se puede leer ningún dato.
- Las 52 pruebas automáticas pasan.
- Los cálculos de dinero se revisaron sin errores.
- Ninguna pantalla se desborda en el celular.

Se encontraron **3 problemas importantes**, todos reproducidos dos veces:
- un cliente o gremio puede ver los **nombres** de personas de otras obras;
- un gremio al que se le quitó la obra **sigue viendo sus reclamos**;
- el **informe mensual deja la pantalla en blanco** en obras que todavía no empezaron.

Hoy no hay clientes ni gremios cargados en la app real, así que ninguno afectó a nadie todavía. **Recomendación: corregir los 3 antes de dar usuarios a clientes y gremios.**

## 2. Alcance probado

- **Versión:** commit `3f78f6d` (25/11/2026), publicada en https://andorinas.github.io.
- **Entornos:**
  - copia local con datos ficticios (modo demo y base en memoria con las migraciones reales);
  - app publicada, sólo lectura y sin usuario (autorizado por el usuario).
- **Roles:** sin usuario, pendiente, encargado, administrador, gremio, cliente y usuario desactivado.
- **Módulos:** ingreso, obras, gastos y pagos, avance y plan de obra, diario, fotos, documentos, reclamos y consultas, portal del cliente, informe mensual, usuarios, cotización, archivos.
- **Áreas:**
  - permisos y seguridad de datos;
  - lógica de cálculo;
  - validaciones y manejo de errores;
  - responsive y accesibilidad básica;
  - dependencias y rendimiento.

## 3. Alcance NO probado

- **La app real con usuario:** no se ingresó con ninguna cuenta ni se creó ni modificó nada allí.
- **Supabase Storage real:** el comportamiento real de archivos (nombres con `..`, límites de tipo y tamaño, enlaces firmados). Se probó con una simulación.
- **Emails:** el contenido y la entrega de los emails de Supabase (confirmación y recuperación).
- **Navegadores:** Firefox y Safari/iPhone. Se usó Chromium/Edge.
- **Accesibilidad:** lector de pantalla real y contraste de colores medido.
- **Carga:** pruebas con muchas obras o usuarios a la vez.
- **Exportaciones:** el contenido de PDF y Excel en detalle (sí se generaron en sesiones anteriores).

## 4. Riesgos principales

1. **Datos entre roles:** que un cliente o gremio vea datos de otros. Ese es el centro de la confianza en el portal.
2. **Montos:** que un cálculo de dinero o de cotización salga mal.
3. **Pantallas en blanco:** errores que dejan la app vacía, sin un mensaje ni una forma de volver.
4. **Fechas mal cargadas:** fechas imposibles que distorsionan informes y curvas.
5. **Rendimiento:** la lista de obras se vuelve lenta cuando haya muchas obras.

## 5. Casos planificados — 83

| Grupo | Casos | Prioridad |
|---|---|---|
| Pruebas automáticas existentes | 52 | Alta |
| Seguridad de la base por rol (nuevas) | 21 verificaciones | Alta |
| App publicada, sin usuario, sólo lectura | 5 | Alta |
| Exploratorias en la copia de prueba | 3 (una cubre 12 pantallas) | Media |
| Dependencias y peso de la app | 2 | Media |

Además se hizo una revisión de código (frontend, cálculo de dinero, fechas, expresiones regulares, manejo de errores, rendimiento y accesibilidad), que no se cuenta como casos.

## 6. Casos ejecutados — 82 de 83

## 7. Casos aprobados — 70

- **Pruebas automáticas:** las 52 pasan.
- **App publicada sin usuario (5):**
  - las 20 tablas responden "permiso denegado";
  - sólo `ping` responde;
  - no se pueden listar archivos;
  - el registro exige confirmar el email;
  - no existen usuarios anónimos.
- **Exploratorias (2):**
  - 12 pantallas en celular (375 px) sin desborde horizontal, sin botones ni campos sin nombre y sin imágenes sin descripción;
  - plan de obra, documentos e informe mensual en una obra en curso.
- **Peso de la app (1):** la app pesa 166 KB comprimida y Excel y PDF se cargan recién al usarse.
- **Controles de seguridad correctos (10):**
  - ninguna función privilegiada tiene la falla de `search_path`;
  - un encargado no puede tocar otra obra;
  - un cliente o gremio desactivado no ve nada;
  - nadie puede auto-asignarse el rol de administrador;
  - el portal no devuelve importes.

## 8. Casos fallidos — 12

- **E-01:** informe mensual con obra futura (QA-01).
- **10 de seguridad de la base:**
  - QA-02, QA-03, QA-04 y QA-05;
  - S-05 (documentos con importes);
  - S-06 (re-anular pisa el motivo);
  - parte en rubro desactivado;
  - reenvío con otros datos;
  - cotización manual visible;
  - S-07 (nombre libre).
- **D-01:** alertas de dependencias.

Los detalles están en las secciones 10, 11 y 14.

## 9. Casos bloqueados — 1

Storage real de Supabase: no se puede probar sin escribir en producción.

## 10. Bugs confirmados

Todos se reprodujeron 2 de 2 veces. Quedan **para tu confirmación**.

### QA-01 · [ALTA][Portal] El informe mensual deja la pantalla en blanco en obras que todavía no empezaron
- **Severidad / prioridad:** alta / alta. Bloquea al usuario y la pantalla se vacía; el arreglo es simple.
- **Pasos:**
  1. Ir a una obra con fecha de inicio futura (en la demo: "Local comercial Calle 12", inicio 15/01/2027).
  2. Abrir "Vista del cliente".
  3. Tocar "📄 Informe mensual".
- **Esperado:** el mensaje "Todavía no hay meses para informar".
- **Real:** la app entera queda en blanco (el texto en pantalla pasa de 1642 caracteres a 0). El error es `Cannot read properties of undefined (reading 'split')`. Hay que recargar la página.
- **Dónde:** `client/src/components/InformeMensual.jsx` (la lista de meses queda vacía).
- **Impacto:** un cliente con obra por empezar ve la app "rota".

### QA-02 · [CRÍTICA*][Base · directorio] Clientes y gremios ven los nombres de personas de otras obras
- **Severidad / prioridad:** crítica / alta.
  - *Es crítica por política: expone datos personales (nombres) de otros usuarios.*
  - *Prioridad alta y no urgente porque hoy no hay clientes ni gremios en la app real.*
- **Pasos:** como cliente de la obra A, la app consulta `directorio()`.
- **Esperado:** sólo los nombres de la empresa que lo atiende.
- **Real:** aparecen todos los gremios y los clientes de otras obras (`["admin","cliente","electricista","enc","encb","otro-cliente"]`).
- **Agravante:**
  - el cliente puede cruzar quién sacó cada foto con el gremio correspondiente;
  - el nombre lo elige cada uno al registrarse, así que alguien puede llamarse "Administración Andorinas" (S-07).
- **Dónde:** `supabase/migraciones/008_clientes.sql:330-335`.
- **Arreglo:** filtrar por rol.
  - El cliente ve al administrador y a los encargados de sus obras.
  - El gremio ve lo mismo.

### QA-03 · [ALTA][Base · reclamos] Un gremio al que se le quitan las obras sigue viendo y respondiendo sus reclamos
- **Severidad / prioridad:** alta / alta.
- **Pasos:**
  1. La empresa le hace un reclamo a un gremio.
  2. Después le quita todos los rubros.
  3. La empresa sigue escribiendo en el reclamo.
- **Real:** el gremio sigue viendo:
  - el reclamo y los mensajes nuevos;
  - la foto adjunta.

  Además puede marcarlo "resuelto".
- **Esperado:** pierde el acceso, igual que pasa con un cliente.
- **Dónde:** `008_clientes.sql:76-94`. La rama del gremio de `ve_reclamo` y `ve_foto` no exige `gremio_en_obra`.
- **Impacto:** un subcontratista desvinculado sigue leyendo información interna de la obra.

### QA-04 · [ALTA][Base · archivos] Un cliente o gremio puede renombrar archivos que subió la empresa
- **Severidad / prioridad:** alta / normal. Es un permiso indebido que cambia lo que ven todos. Se puede discutir si es media, porque no toca el contenido del archivo.
- **Pasos:** como cliente, tomar la ruta de un documento del portal y llamar `registrar_adjunto` con esa ruta y un nombre nuevo.
- **Real:** el documento de la empresa pasa a llamarse "HACKEADO.exe" en el portal.
- **Esperado:** un error. Sólo quien subió un archivo puede cambiarle el nombre.
- **Dónde:** `008_clientes.sql:148` (`on conflict (ruta) do update`).

### QA-05 · [MEDIA][Base · validación] Se aceptan fechas imposibles (año 2099 o 1900)
- **Funciones afectadas:**
  - `crear_gasto`, `cargar_avance`, `crear_parte_avance`, `crear_novedad` y `agregar_fotos` aceptan fecha 2099;
  - `crear_gasto` también acepta 1900, anterior al inicio de la obra.
- **Comparación:** el parte diario sí rechaza fechas futuras.
- **Impacto:** un error de tipeo (2062 en vez de 2026) distorsiona informes, la curva de avance y la cotización (queda "pendiente").
- **Arreglo:** exigir una fecha entre el inicio de la obra y hoy, con margen donde haga falta.

### QA-06 · [MEDIA][App] Algunas fechas se muestran un día adelantadas a la noche
- **Dónde:**
  - la fecha de los documentos en la pestaña Documentos de la empresa;
  - la "última actualización" de reclamos.
- **Ejemplo:** un documento subido el 25/11 a las 21:30 aparece con fecha 26/11.
- **Causa:** se corta la fecha en hora universal y no en hora argentina.

### QA-07 · [MEDIA][App] Sin "red de contención" ante errores
- No hay un `ErrorBoundary`. Cualquier error inesperado al dibujar una pantalla (como QA-01) deja la app en blanco, sin mensaje ni botón para volver.

### QA-08 · [MEDIA][App] Si falla la conexión al abrir un formulario, las listas quedan vacías sin aviso
- **Dónde:**
  - el catálogo en "Agregar gasto", "Movimientos" y "Detalle";
  - el historial de Avance;
  - las obras en Usuarios y Nueva obra;
  - Configuración.
- **Ejemplo:** "Tipo de gasto" queda sin opciones, no aparece ningún mensaje y no se puede guardar.

## 11. Bugs sospechados / menores (para revisar)

- **S-05 · Documentos con importes:** se puede compartir como documento el comprobante de un gasto (con importes y proveedor), y por defecto queda visible al cliente. Es una decisión de la empresa, pero conviene bloquearlo o advertirlo. *Media.*
- **S-06 · Re-anular pisa el motivo:** volver a anular algo ya anulado reemplaza el motivo original (pagos, gastos, avances, novedades, documentos). *Baja.*
- **Parte en rubro desactivado:** un gremio puede mandar un parte de un rubro desactivado; recién falla cuando la empresa lo aprueba. *Baja.*
- **Reenvío con otros datos:** si se reenvía un parte o reclamo con otros datos, se descarta el segundo sin avisar. *Baja.*
- **Cotización manual visible:** el cliente y el gremio pueden leer la "cotización manual" de la obra. No es un importe, pero es un dato interno. *Baja.*
- **S-07 · Nombre libre al registrarse:** el nombre lo escribe quien se registra, sin control. *Baja.*
- **Comprobante duplicado:** al reintentar un gasto o pago que falló, el comprobante se sube de nuevo y queda un archivo huérfano. *Baja.*
- **Fecha a medio escribir:** Enter con una fecha incompleta puede guardar la fecha anterior. *Baja, sospechado.*
- **Peso inválido:** un peso escrito mal ("veinte") se guarda vacío sin avisar. *Baja.*
- **Cambio rápido de obra:** un cliente con dos obras que cambia rápido entre ellas podría ver la anterior un instante. *Baja, sospechado.*

## 12. Problemas de entorno / datos / test (no son bugs de la app)

- Al reiniciar el servidor de prueba, la base en memoria a veces no terminó de cargar y la pantalla quedó vacía. Se resolvió recargando; no afecta a la app publicada.
- El servidor de prueba no detecta migraciones nuevas sin reiniciarse.

## 13. Evidencias

- **Pruebas de seguridad:** `%LOCALAPPDATA%\Temp\qa-audit\audit.test.js`, ejecutado 2 veces con salidas idénticas. Las salidas están citadas arriba.
- **Scripts de lógica:** `%LOCALAPPDATA%\Temp\qa-front\t1.mjs` y `t2.mjs`.
- **QA-01:** reproducido 2 veces en el navegador de la app (página de 1642 a 0 caracteres, error en consola).
- **Producción:** respuestas HTTP 401 "permission denied" en las 20 tablas; `ping` = 200.
- **Pruebas automáticas:** `npm test`, 52 de 52 (173 s).
- **Dependencias:** `npm audit`.

## 14. Recomendaciones (no son bugs)

1. **Rendimiento:**
   - la lista de obras calcula cada obra completa (unos 8 pedidos por obra) y con 30 obras serán más de 240;
   - Usuarios usa esa misma lista sólo para los nombres.

   Conviene un resumen liviano.
2. **Exportar PDF:** también descarga la librería de Excel (~1 MB). Se puede separar.
3. **Ventanas emergentes:** no llevan el foco al abrir ni lo devuelven al cerrar. Importa a quien usa teclado o lector de pantalla.
4. **Archivos abiertos en otra pestaña:** cortar la referencia a la app (`opener`).
5. **Dependencias:** actualizar Vite, React Router y exceljs.
   - Las alertas (1 alta y 5 medias) afectan a herramientas de desarrollo o a usos que la app no hace.
   - No hay riesgo hoy, pero conviene mantenerlas al día.
6. **Encabezados de seguridad:** GitHub Pages no envía CSP ni X-Frame-Options. Riesgo bajo; se puede agregar una política básica por `<meta>`.
7. **Registro abierto:** cualquiera puede crear una cuenta, que queda "pendiente" y exige confirmar el email. Es lo previsto, pero puede llenarse de cuentas basura. Revisarlo de vez en cuando en Usuarios.
8. **Desbordes de lista:** algunas listas ordenan sin desempate y podrían saltearse filas pasados los 1000 registros.

## 15. Candidatos a automatización

- **Sí:**
  - QA-01 (informe con obra futura);
  - QA-02 (directorio por rol);
  - QA-03 (gremio desasignado);
  - QA-04 (renombrar adjunto ajeno);
  - QA-05 (fechas límite).

  Son estables, críticos y ya tienen una prueba armada; sólo hay que pasarlas a la suite.
- **No por ahora:** las de Storage real y emails, porque dependen de servicios externos y de escribir en producción.

## 16. Checklist de regresión

- [ ] QA-01: informe mensual con obra futura, con obra recién empezada y en el primer mes.
- [ ] QA-02: `directorio()` como cliente, gremio, encargado y admin.
- [ ] QA-03: gremio desasignado: reclamos, mensajes, fotos y responder.
- [ ] QA-04: `registrar_adjunto` sobre la ruta de otro usuario.
- [ ] QA-05: fechas futuras y anteriores al inicio en todas las funciones de alta.
- [ ] QA-06: fechas de documentos y reclamos cargados después de las 21 h.
- [ ] QA-07 y QA-08: error de render y corte de red al abrir formularios.

## 17. Riesgo residual

- **Storage real:** no se pudo verificar sin escribir en producción. Por las políticas, un cliente o gremio puede subir archivos de hasta 15 MB a la carpeta de su obra aunque después no se registren. Es abuso de espacio, no acceso a datos.
- **Emails y navegadores:** flujos de email y Safari/iPhone sin probar.
- **Volumen:** comportamiento con muchos datos (paginación pasados los 1000 registros, lista de obras lenta).
- **Modo demo:** el modo demo reemplaza a Supabase, así que no detecta diferencias de configuración entre la base local y la real.

## 18. Veredicto final

**No aprobado para habilitar clientes y gremios; aprobado con observaciones para el uso interno actual (administrador y encargados).**

- **Clientes y gremios:** QA-02 y QA-03 permiten ver información de otros, y QA-01 deja la app en blanco. Hay que corregirlos antes de dar usuarios a clientes o gremios.
- **Uso interno:** para el uso que la app tiene hoy no se encontraron fallas que afecten montos ni la seguridad frente a terceros.
