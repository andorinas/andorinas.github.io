# Publicar ControlAr (GitHub Pages + Supabase, gratis y sin tarjeta)

> **Instalación actual:** la app está en **https://andorinas.github.io**, publicada desde el repositorio `andorinas/andorinas.github.io` (organización de GitHub **andorinas**). Esta guía queda como referencia para una instalación nueva.

Tiempo estimado: 20 minutos. Conviene crear las cuentas con un email de **Andorinas**, así la empresa queda como dueña de la app y de sus datos.

## 1. Supabase (datos y usuarios)

1. Entrá a **supabase.com** → *Start your project* → creá la cuenta (con GitHub o email).
2. *New project*:
   * **Name**: `controlar`
   * **Database password**: tocá *Generate a password* y guardala en un lugar seguro (no la vas a necesitar en la app).
   * **Region**: *South America (São Paulo)*.
   * Plan **Free** → *Create new project*. Esperá 1–2 minutos.
3. Menú izquierdo → **SQL Editor** → *New query*.
   * Abrí el archivo `supabase/instalar.sql` de esta carpeta, copiá todo y pegalo.
   * Al **final** del texto, reemplazá `TU-EMAIL@EJEMPLO.COM` por el email de quien va a administrar la app.
   * Tocá **Run**. Debe decir *Success*.
4. **Authentication → URL Configuration** (completalo después del paso 2.4, cuando tengas la dirección de GitHub Pages):
   * **Site URL**: `https://ORGANIZACION.github.io/`
   * **Redirect URLs** → *Add URL*: la misma dirección.
5. **Project Settings → API** (o *API Keys*): anotá
   * **Project URL** (`https://xxxx.supabase.co`)
   * **Publishable key** (o *anon public*). Esta clave es pública por diseño: la seguridad la dan los permisos de la base.

## 2. GitHub (la app)

1. Entrá a **github.com** → creá la cuenta. El nombre de usuario forma parte de la dirección (`USUARIO.github.io`).
2. *New repository*: nombre `ORGANIZACION.github.io` (así la app queda en la raíz de la dirección), **Public** (GitHub Pages gratis requiere repositorio público; el código no tiene datos ni claves privadas), sin README → *Create repository*.
3. En el repositorio → **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**:
   * `SUPABASE_URL` = Project URL del paso 1.5
   * `SUPABASE_ANON_KEY` = Publishable key del paso 1.5
4. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Subir el código (lo hace Claude con tu autorización; Git abre el navegador para que inicies sesión en GitHub).
6. En la pestaña **Actions** se ejecuta *Publicar en GitHub Pages*: corre las pruebas, compila y publica. Al terminar, la dirección es `https://ORGANIZACION.github.io/`.

## 3. Primer ingreso

1. Abrí la dirección → **Crear cuenta** con el email que pusiste en el paso 1.3 → confirmá el email que llega.
2. Ingresá: entrás como **administrador**.
3. **Dólar BNA**: cargá la cotización del día (bna.com.ar → Cotizaciones → Billetes → Dólar U.S.A → Venta).
4. **+ Nueva obra**, presupuestos y pesos.
5. Para sumar encargados: compartiles la dirección; crean su cuenta y vos los habilitás en **Usuarios**, eligiendo sus obras.
6. En el celular: abrí la dirección y usá *Agregar a pantalla de inicio* para tenerla como app.

## Mantenimiento

* **Cambios en la app**: se publican solos al subir a la rama `main`.
* **Base activa**: Supabase gratis pausa el proyecto tras 7 días sin uso. La tarea *Mantener activa la base* (pestaña Actions) la consulta cada 3 días. GitHub desactiva tareas programadas en repositorios sin actividad por 60 días: si pasa, reactivala desde Actions. Si el proyecto llega a pausarse, se reactiva desde el panel de Supabase sin perder datos.
* **Respaldo**: *Usuarios → Descargar copia de seguridad* (al menos una vez por semana, guardarla fuera de Supabase).
* **Límites del plan gratis de Supabase** (sujetos a cambios): 500 MB de base y 1 GB de archivos. Para una constructora alcanza para años de movimientos; las fotos son lo que más ocupa.
* **Emails de Supabase** (confirmación y recuperación de contraseña): el servicio gratuito envía pocos por hora. Si hace falta más, se configura un SMTP propio en *Authentication → Emails*.
