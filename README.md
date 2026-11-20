# ControlAr · Andorinas Ingeniería & Construcción

Control de **presupuestos, gastos, pagos y avance físico** de obras, para usar desde el celular en obra y desde la computadora o tablet en la oficina. Interfaz en español de Argentina, fechas DD/MM/AAAA, importes `ARS 1.234.567,89` / `USD 1.000,00`.

## Cómo está armada (gratis, sin servidor propio)

| Parte | Dónde | Qué hace |
|---|---|---|
| App web (React) | **GitHub Pages** | Pantallas, cálculos, PDF y Excel (se generan en el dispositivo). Se publica sola en cada cambio. |
| Datos, usuarios y comprobantes | **Supabase** (plan gratis) | Base Postgres, inicio de sesión, fotos/PDF en almacenamiento privado. |
| Reglas y permisos | Funciones y políticas de la base (`supabase/migraciones`) | Toda escritura pasa por funciones que validan saldos, permisos, idempotencia y dejan auditoría. La app no puede escribir tablas directamente. |

* **Cálculo único** en `shared/calc.js`: tablero, PDF y Excel usan el mismo resultado; con los mismos parámetros los totales coinciden.
* **Cotización del dólar**: BNA billete **venta**, cargada a mano por el administrador en *Dólar BNA*. Cada movimiento toma la de su fecha o la última anterior (día sin publicación). Si todavía no hay una cotización cargada para esa fecha o una posterior, queda **“Cotización pendiente”** y se completa sola al cargarla, sin duplicar nada. Corregir una cotización exige motivo y conserva el historial.
* **Usuarios**: cada persona crea su cuenta desde la app; queda pendiente hasta que el administrador la habilita como encargado (eligiendo sus obras) o administrador. El email configurado en la instalación es el administrador inicial.

Guía de publicación paso a paso: **[PUBLICAR.md](PUBLICAR.md)**.

## Desarrollo

Requiere Node.js 22 (en esta PC: portable en `%LOCALAPPDATA%\Programs\node`).

```bash
npm install
npm test          # 39 pruebas: aceptación A–G, cotizaciones, seguridad (RLS), revisión independiente, gremios e instalación
npm run dev       # app en http://localhost:5173 (necesita .env con los datos de Supabase, ver .env.example)
npm run build     # compila a client/dist
npm run sql       # regenera supabase/instalar.sql a partir de las migraciones
```

Las pruebas corren el **esquema real de Supabase** sobre Postgres en memoria (PGlite), con usuarios administrador, encargado, pendiente y anónimo, verificando permisos por fila y en comprobantes.

## Estructura

```
client/                 app React (Vite). src/datos.js = acceso a Supabase
shared/calc.js          motor de cálculo único
shared/exports/         PDF ejecutivo y Excel (navegador y pruebas)
supabase/migraciones/   esquema, seguridad (RLS), reglas de negocio, almacenamiento, permisos
supabase/instalar.sql   todo junto para pegar en el SQL Editor de Supabase (proyecto nuevo)
supabase/actualizar.sql cambios para una base ya instalada (re-ejecutable, no borra datos)
tests/                  pruebas automáticas
.github/workflows/      publicar en GitHub Pages y mantener activa la base
_version-servidor/      versión anterior con servidor Node propio (no se publica; sirve si algún día se usa Fly.io)
```

## Respaldo

El administrador descarga una copia completa (JSON) desde *Usuarios → Descargar copia de seguridad*. Conviene hacerlo al menos una vez por semana y guardarla fuera de Supabase. El Excel de cada obra también sirve como respaldo legible.
