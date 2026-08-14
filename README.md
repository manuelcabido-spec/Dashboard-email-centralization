# Herramientas de CSM

Este repositorio contiene dos herramientas independientes:

| | Qué es | Dónde vive |
|---|---|---|
| **🧭 [CSM Hub](dashboard/)** | Llamadas y conversaciones segmentadas (enablement, tickets, website, compliance), mensajes de Slack con revisión y el update diario del Summer Enablement Tracker. | Dashboard publicado en claude.ai, usa tus conectores de Notion y Slack |
| **📋 Dealer Document Tracker** | Recepción de documentación de más de 100 dealers: escanea Gmail, clasifica adjuntos, los guarda en Drive y hace seguimiento. | Google Apps Script + Google Sheet |

👉 **Para el día a día de llamadas y tickets: [`dashboard/README.md`](dashboard/README.md).**
El resto de este documento cubre el Document Tracker de Apps Script.

> ℹ️ El módulo CSM que hay dentro de `apps-script/` (interacciones, tickets, mensajes, Notion)
> quedó **obsoleto** al mover ese flujo al CSM Hub. Se conserva por historial, pero no hace
> falta usarlo: el escaneo de documentos de Apps Script funciona igual sin tocarlo.

---

# 📋 Dealer Document Tracker

Herramienta para centralizar el día a día de la documentación: la recepción de documentos de más
de 100 dealers (contratos de seguro, certificados, etc.).

Está organizada por **campañas**: cada casuística nueva (p. ej. *"Contratos de seguro - Jul 2026"*)
es una campaña que creas en 1 minuto desde el dashboard, eligiendo qué documento pides y a qué
dealers. La herramienta se adapta así a las peticiones que vayan surgiendo, sin tocar código.

**Qué hace automáticamente:**

- 🔍 **Escanea tu Gmail cada 10 minutos** y detecta los correos que vienen de tus dealers.
- 🏷️ **Clasifica el documento recibido** (contrato, certificado…) por el asunto, el nombre del adjunto y el cuerpo del correo, y lo asigna a la campaña activa que corresponde.
- 📁 **Guarda los adjuntos en Google Drive**, organizados en una carpeta por dealer y con la fecha en el nombre.
- 📊 **Actualiza el Google Sheet** con el estado de cada solicitud: *Pendiente → Solicitado → Recibido → Verificado / Incorrecto*.
- ⚠️ **Detecta a quién hay que hacer seguimiento** (dealers que llevan X días sin responder).
- ✉️ **Crea borradores de correo en Gmail** para: solicitudes iniciales masivas, seguimientos y peticiones de reenvío cuando el documento es incorrecto (tú solo revisas y pulsas enviar).
- 🖥️ **Dashboard web interactivo** con progreso por campaña, KPIs, filtros y acciones de un clic.

## 🌍 ¿Dónde vive el dashboard? (ni Vercel, ni local)

El dashboard se publica como **aplicación web de Google Apps Script**: al implementarlo obtienes
una **URL privada de Google, solo accesible con tu cuenta**, que funciona 24/7 desde cualquier
navegador u ordenador y también desde el móvil.

- **No necesitas Vercel** ni ningún hosting: Google lo sirve gratis.
- **No necesitas tenerlo "en local"**: una app local solo funcionaría con tu ordenador encendido
  y el servidor arrancado. La URL de Apps Script está siempre disponible.
- El escaneo de Gmail también corre en los servidores de Google (triggers), así que **todo sigue
  funcionando aunque tu ordenador esté apagado**.

Guarda la URL en marcadores (y en el móvil: *"Añadir a pantalla de inicio"*) y la tendrás siempre a mano.

---

## 🚀 Instalación (unos 10 minutos, solo una vez)

### 1. Crea el Google Sheet

1. Ve a [sheets.new](https://sheets.new) y crea una hoja de cálculo nueva. Nómbrala, por ejemplo, **"Dealer Document Tracker"**.
2. En el menú: **Extensiones → Apps Script**. Se abrirá el editor de scripts.

### 2. Copia el código

1. En el editor, borra el contenido de `Código.gs` y pega el contenido completo de [`apps-script/Code.gs`](apps-script/Code.gs).
2. Crea el archivo HTML: **➕ → HTML**, nómbralo exactamente `Dashboard` y pega el contenido de [`apps-script/Dashboard.html`](apps-script/Dashboard.html).
3. (Opcional) En **⚙️ Configuración del proyecto**, activa *"Mostrar el archivo de manifiesto appsscript.json"* y pega [`apps-script/appsscript.json`](apps-script/appsscript.json) para fijar la zona horaria y los permisos.
4. Guarda (💾 o `Ctrl+S`).

### 3. Ejecuta el setup

1. En el desplegable de funciones del editor, selecciona **`setup`** y pulsa **▶ Ejecutar**.
2. Google te pedirá autorización (acceso a tu Gmail, Sheets y Drive): acepta. Si aparece *"Google no ha verificado esta aplicación"*, pulsa **Configuración avanzada → Ir a … (no seguro)** — es tu propio script, es seguro.
3. Al terminar se crean las hojas **Dealers, Campañas, Solicitudes, Correos y Config**, las etiquetas de Gmail `DealerTracker/…` y la carpeta **"Dealer Docs"** en tu Drive.

> `setup()` es seguro de re-ejecutar: no borra datos, solo crea lo que falte. Si vienes de una
> versión anterior sin campañas, añade la columna `Campaña` a tus solicitudes existentes.

### 4. Rellena tus dealers

**Hoja `Dealers`**: una fila por dealer con su nombre y sus emails (si un dealer escribe desde
varias direcciones, sepáralas por comas). *Esta es la pieza clave: el sistema identifica los
correos por el remitente.*

### 5. Activa la automatización

En el editor, ejecuta **`instalarTriggers`**. A partir de ahí:
- **`procesarCorreos`** se ejecuta cada 10 minutos.
- **`actualizarSeguimientos`** recalcula cada mañana a las 7:00 quién necesita seguimiento.
- **`refrescarRespuestasSlack`** lee cada 15 minutos las respuestas de los threads de Slack
  (no hace nada si no has configurado el token).
- **`prepararFinDeDia`** te deja a las 18:00 un borrador en Gmail con los updates de Notion
  pendientes del día.

### 6. Publica el dashboard

1. **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. *Ejecutar como:* **Tú**. *Quién tiene acceso:* **Solo yo**.
3. Pulsa **Implementar** y guarda la URL: ese es tu dashboard permanente.

---

## 🎯 Campañas: cómo añadir una casuística nueva

Cada vez que surja una petición nueva (otro documento, otra tanda de dealers):

1. En el dashboard, pulsa **➕ Nueva campaña**.
2. Ponle nombre (p. ej. *"Contratos de seguro - Jul 2026"*).
3. Elige el **documento**: uno existente o **➕ Documento nuevo…** indicando sus **palabras clave**
   (lo que suele aparecer en el asunto o en el nombre del adjunto: `contrato, poliza, policy…`).
4. Elige los **dealers**: todos, o pega la lista de los que aplican.
5. Pulsa **Crear campaña** → se generan las filas de seguimiento (una por dealer) en estado *Pendiente*.
6. Pulsa **✉️ Borradores de solicitud** → se crea un borrador de Gmail por dealer con la petición. Revisa y envía.

A partir de ahí todo es automático: cuando un dealer responde con el documento, su fila pasa a
*"Recibido - Por revisar"* dentro de la campaña correcta. Cuando termines una casuística,
**cierra la campaña** desde su tarjeta: queda como historial y deja de generar seguimientos.

## 🧭 Módulo CSM (v5): llamadas segmentadas, tickets, Slack y Notion

Además del tracker de documentos, el dashboard incluye 5 pestañas nuevas para el trabajo de CSM:

| Pestaña | Para qué sirve |
|---|---|
| **📅 Hoy** | Tu agenda del día (Google Calendar), las interacciones registradas hoy y las tareas pendientes (lo que te deben los dealers y lo que debes tú). |
| **🚀 Enablement** | Historial de reuniones/llamadas de enablement por dealer, con el estado del update de Notion. |
| **🎫 Tickets** | Tickets de soporte segmentados por tipología (bugs, compliance, line increases…), cada uno con su canal de Slack. |
| **✉️ Mensajes** | Bandeja de revisión: todos los mensajes generados (en inglés) esperan aquí tu OK antes de salir. |
| **🌙 Fin de día** | Compone el update diario del Summer Enablement Tracker de Notion (fecha + comentario por dealer) para sincronizarlo o copiarlo. |

### El flujo en 30 segundos

1. Terminas una llamada → **➕ Registrar interacción**: dealer, segmento, resumen y acuerdos
   ("el dealer me debe…", "yo debo…" — una cosa por línea).
2. Según el segmento, el sistema hace el resto:
   - **Enablement** → crea las tareas, deja el update de Notion pendiente para el fin de día y,
     si el dealer te debe algo, prepara un follow-up en inglés (borrador de Gmail).
   - **Ticket** → crea el ticket y prepara el mensaje para **ES-TICKETS** (o el canal de su tipología).
   - **Website** → crea el ticket y prepara el mensaje para **dealer-website-creation**
     etiquetando a la responsable de webs.
   - **Compliance** → crea el ticket y prepara el mensaje para **compliance-ops**.
3. Pasas por **✉️ Mensajes**, editas si hace falta y pulsas **Enviar** (o **Copiar** si aún no
   hay token de Slack). Las respuestas de los threads se trackean solas cada 15 min.
4. Al final del día abres **🌙 Fin de día**: el comentario por dealer ya está escrito; lo
   retocas y **Sincronizar con Notion** (o **Copiar todo**). A las 18:00 un trigger te deja
   además un borrador en Gmail con el resumen, por si no abres el dashboard.

> Nada se publica sin tu revisión: los mensajes de Slack y los updates de Notion siempre pasan
> por ti primero.

### Funciona desde el primer día sin tokens (modo copy-paste)

Sin configurar nada más, el dashboard genera todos los mensajes en inglés y tú los copias con
un clic. Para activar el envío y la sincronización automáticos:

**Slack** (pide a un admin si no puedes crear apps):
1. Crea una app en [api.slack.com/apps](https://api.slack.com/apps) → *From scratch* en el
   workspace de INFINIT.
2. En **OAuth & Permissions → Bot Token Scopes** añade: `chat:write`, `channels:history`,
   `groups:history`, `channels:read`, `groups:read`.
3. *Install to Workspace* y copia el **Bot User OAuth Token** (`xoxb-…`) en la hoja `Config` →
   `SLACK_BOT_TOKEN`.
4. Invita al bot a los tres canales (`/invite @tu-app` en ES-TICKETS, dealer-website-creation
   y compliance-ops) y pega el **ID de cada canal** (detalles del canal → ID, empieza por `C` o `G`)
   en `SLACK_CANAL_TICKETS`, `SLACK_CANAL_WEBSITE` y `SLACK_CANAL_COMPLIANCE`.
5. (Opcional) `SLACK_USER_WEBSITE_OWNER`: member ID de la responsable de webs (perfil → ⋯ →
   *Copy member ID*) para que el @mention funcione de verdad.

**Notion**:
1. Crea una integración interna en [notion.so/my-integrations](https://www.notion.so/my-integrations)
   (workspace de INFINIT, permisos de lectura y escritura de contenido).
2. Copia el token (`ntn_…`/`secret_…`) en `Config` → `NOTION_TOKEN`.
3. En la página del **Summer Enablement Tracker**, menú ⋯ → *Connections* → añade tu integración.
   `NOTION_DB_TRACKER` ya viene precargado con el ID de la base de datos del tracker.

Las **tipologías de ticket** y su canal por defecto se editan en la hoja `Config`
(columnas G/H), igual que los tipos de documento. La migración a Plaid y al Back Office de
INFINIT podrá enchufarse más adelante añadiendo su origen en los tickets.

## 📖 Tu flujo de trabajo diario

1. **Abre el dashboard.** Las tarjetas muestran el % de progreso de cada campaña; los KPIs, lo que requiere tu atención.
2. **Pestaña "Solicitudes"**: cuando llega un documento, su fila pasa sola a **"Recibido - Por revisar"** con el enlace al archivo en Drive. Ábrelo y:
   - Si es correcto → botón **✔ Correcto** (queda *Verificado*).
   - Si es incorrecto → botón **✖ Incorrecto**: indicas el motivo y se crea automáticamente un **borrador en Gmail** pidiendo el reenvío.
3. **Pestaña "🏢 Dealers"**: monitoreo por dealer. Cada dealer aparece con un estado derivado de sus documentos — *✖ Incorrecto - reenvío pedido*, *📥 Ha respondido - por revisar*, *⏳ Sin contestar*, *✔ Completado* o *Sin solicitar* — con contadores por categoría (clic para filtrar), su email, cuántos documentos tiene verificados y el enlace a su último correo.
4. **Pestaña "⚠ Seguimiento"**: dealers que llevan más de X días sin responder. El botón **✉️ Seguimiento** crea el borrador de recordatorio.
5. **Pestaña "Correos recibidos"**: bandeja de correos **pendientes de gestionar**, con enlace directo al hilo de Gmail. Al pulsar *"Marcar gestionado"* el correo desaparece de la lista (queda en el histórico, visible con la casilla *"Ver gestionados"*).
6. En las tablas de Solicitudes y Seguimiento, la columna **Correo (✉️ Abrir)** te lleva directamente al hilo de Gmail que trajo el documento.

> Los correos nunca se envían solos: el sistema siempre crea **borradores** para que tú los revises y envíes. Los encontrarás en la carpeta *Borradores* de Gmail.

## 🗂️ Estructura del Google Sheet

| Hoja | Contenido |
|---|---|
| **Dealers** | Tu lista de dealers y sus emails (la rellenas tú) |
| **Campañas** | Cada casuística: documento pedido, fecha, estado (Activa/Cerrada), nº de dealers |
| **Solicitudes** | Una fila por *dealer × campaña* con su estado, fechas, días sin respuesta y enlace al archivo (se actualiza sola) |
| **Correos** | Registro de cada correo recibido de un dealer: fecha, asunto, adjuntos, enlace a Gmail (se actualiza sola) |
| **Interacciones** | Cada llamada/reunión/mensaje con un dealer, con su segmento y acuerdos |
| **Tareas** | Compromisos derivados de cada interacción (del dealer y tuyos) |
| **Tickets** | Tickets de soporte con tipología, estado y canal de Slack |
| **Mensajes** | Bandeja de mensajes en inglés: borrador → aprobado → enviado (con thread de Slack) |
| **Config** | Días para seguimiento, tipos de documento, firma, tokens de Slack/Notion y tipologías de ticket |

## ✅ Prueba rápida tras instalar

1. Añade en `Dealers` una fila de prueba con **tu propio email personal** como si fuera un dealer.
2. Crea una campaña de prueba con ese "dealer" y un documento (p. ej. *Contrato de seguro*).
3. Envíate a tu Gmail un correo desde ese email con un PDF adjunto y la palabra "contrato" en el asunto.
4. En el dashboard pulsa **🔄 Escanear correos ahora**: la fila debe pasar a *"Recibido - Por revisar"*, con el archivo guardado en Drive. Bórralo todo después.

## ❓ Preguntas frecuentes

**Un correo no se ha asignado a ningún dealer.** El remitente no está en la hoja `Dealers`. Añade esa dirección al dealer (varias separadas por comas) y pulsa *"Escanear correos ahora"* en el dashboard.

**Ha clasificado mal el documento.** Ajusta las palabras clave en la hoja `Config` (columnas D-E). También puedes corregir el estado a mano en la hoja `Solicitudes`: el dashboard lo refleja.

**Dos campañas activas piden el mismo documento.** El correo entrante se asigna a la campaña **más reciente**. Si es posible, cierra la campaña vieja antes de abrir la nueva.

**¿Puedo editar el Sheet a mano?** Sí. El dashboard y el Sheet siempre están sincronizados porque el Sheet *es* la base de datos.

**¿Procesa correos antiguos?** Escanea los últimos 30 días (configurable con `DIAS_BUSQUEDA` en la hoja `Config`). Los hilos ya procesados quedan marcados con la etiqueta de Gmail `DealerTracker/Procesado` y no se repiten.

**Importante: el orden correcto es Dealers → Campaña → Escanear.** El escáner solo registra correos de remitentes que estén en la hoja `Dealers`, y solo actualiza estados si existe una campaña con ese documento. Si escaneas antes de crear la campaña, esos hilos quedan marcados como procesados y no se reasignarán después.

**He actualizado el código, ¿y ahora?** Pega el nuevo `Code.gs`/`Dashboard.html` en el editor, guarda, ejecuta `setup()` una vez (migra lo que haga falta) y en **Implementar → Administrar implementaciones** edita la implementación y selecciona *"Nueva versión"*.

> ⚠️ **El paso "Nueva versión" es obligatorio.** La URL `/exec` del dashboard sirve una versión *congelada* del código: si solo pegas y guardas, el dashboard seguirá mostrando la interfaz antigua (parecerá "fijado" o roto). Desde la v4, el propio dashboard te avisa con un banner rojo si detecta que está sirviendo una versión antigua.

**El dashboard se queda congelado o no reacciona a los botones.** Casi siempre es el punto anterior (falta publicar "Nueva versión"). Si aparece un banner rojo con un error, mándalo tal cual para diagnosticarlo.

## 📁 Archivos de este repositorio

```
apps-script/
├── Code.gs           # Lógica: campañas, escaneo de Gmail, clasificación, Sheets, Drive,
│                     # borradores + módulo CSM (interacciones, tickets, Slack, Notion, fin de día)
├── Dashboard.html    # Dashboard web interactivo (documentos + módulo CSM)
└── appsscript.json   # Manifiesto (zona horaria, permisos: Gmail, Sheets, Drive, Calendar, APIs externas)
```
