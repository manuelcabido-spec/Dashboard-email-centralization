# 📋 Dealer Document Tracker

Herramienta para centralizar y ordenar la recepción de documentación de más de 100 dealers
(certificados de seguro, contratos, etc.) sin perderse entre decenas de correos diarios.

**Qué hace automáticamente:**

- 🔍 **Escanea tu Gmail cada 10 minutos** y detecta los correos que vienen de tus dealers.
- 🏷️ **Clasifica el documento recibido** (certificado, contrato…) por el asunto, el nombre del adjunto y el cuerpo del correo.
- 📁 **Guarda los adjuntos en Google Drive**, organizados en una carpeta por dealer y con la fecha en el nombre.
- 📊 **Actualiza el Google Sheet** con el estado de cada solicitud: *Pendiente → Solicitado → Recibido → Verificado / Incorrecto*.
- ⚠️ **Detecta a quién hay que hacer seguimiento** (dealers que llevan X días sin responder).
- ✉️ **Crea borradores de correo en Gmail** para: solicitudes iniciales masivas, seguimientos y peticiones de reenvío cuando el documento es incorrecto (tú solo revisas y pulsas enviar).
- 🖥️ **Dashboard web interactivo** con KPIs, filtros y acciones de un clic.

Todo funciona con **Google Apps Script**: no necesita servidores, es gratuito y vive dentro de tu cuenta de Google.

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
3. Al terminar se crean las hojas **Dealers, Solicitudes, Correos y Config**, las etiquetas de Gmail `DealerTracker/…` y la carpeta **"Dealer Docs"** en tu Drive.

### 4. Rellena tus datos

1. **Hoja `Dealers`**: una fila por dealer con su nombre y sus emails (si un dealer escribe desde varias direcciones, sepáralas por comas). *Esta es la pieza clave: el sistema identifica los correos por el remitente.*
2. **Hoja `Config`**: revisa los **tipos de documento** (columnas D-E) y sus palabras clave. Añade o cambia lo que necesites. Ajusta también `DIAS_PARA_SEGUIMIENTO` (por defecto 5) y tu `FIRMA`.
3. En el editor, ejecuta **`generarSolicitudes`**: crea la matriz *dealer × documento* en la hoja `Solicitudes` (p. ej., 100 dealers × 2 documentos = 200 filas de seguimiento).

### 5. Activa la automatización

En el editor, ejecuta **`instalarTriggers`**. A partir de ahí:
- **`procesarCorreos`** se ejecuta cada 10 minutos.
- **`actualizarSeguimientos`** recalcula cada mañana a las 7:00 quién necesita seguimiento.

### 6. Publica el dashboard

1. **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. *Ejecutar como:* **Tú**. *Quién tiene acceso:* **Solo yo**.
3. Pulsa **Implementar** y guarda la URL: ese es tu dashboard. Añádelo a marcadores.

---

## 📖 Tu flujo de trabajo diario

1. **Abre el dashboard.** Los KPIs te dicen de un vistazo: cuántos documentos faltan, cuántos han llegado y están *por revisar*, cuántos son incorrectos y a cuántos dealers hay que perseguir.
2. **Pestaña "Solicitudes"**: cuando llega un documento, su fila pasa sola a **"Recibido - Por revisar"** con el enlace al archivo en Drive. Ábrelo y:
   - Si es correcto → botón **✔ Correcto** (queda *Verificado*).
   - Si es incorrecto → botón **✖ Incorrecto**: indicas el motivo y se crea automáticamente un **borrador en Gmail** pidiendo el reenvío.
3. **Pestaña "⚠ Seguimiento"**: dealers que llevan más de X días sin responder. El botón **✉️ Seguimiento** crea el borrador de recordatorio.
4. **Pestaña "Correos recibidos"**: registro de todo lo que ha entrado, con enlace directo al hilo de Gmail. Marca como *gestionado* lo que ya hayas resuelto.
5. **Botón "✉️ Borradores de solicitud"**: para el arranque (o nuevas campañas), crea un borrador por dealer con la lista de todos sus documentos pendientes.

> Los correos nunca se envían solos: el sistema siempre crea **borradores** para que tú los revises y envíes. Los encontrarás en la carpeta *Borradores* de Gmail.

## 🗂️ Estructura del Google Sheet

| Hoja | Contenido |
|---|---|
| **Dealers** | Tu lista de dealers y sus emails (la rellenas tú) |
| **Solicitudes** | Una fila por *dealer × documento* con su estado, fechas, días sin respuesta y enlace al archivo (se actualiza sola) |
| **Correos** | Registro de cada correo recibido de un dealer: fecha, asunto, adjuntos, enlace a Gmail (se actualiza sola) |
| **Config** | Días para seguimiento, tipos de documento y palabras clave, firma de tus correos |

## ❓ Preguntas frecuentes

**Un correo no se ha asignado a ningún dealer.** El remitente no está en la hoja `Dealers`. Añade esa dirección al dealer (varias separadas por comas) y pulsa *"Escanear correos ahora"* en el dashboard.

**Ha clasificado mal el documento.** Ajusta las palabras clave en la hoja `Config` (columnas D-E). También puedes corregir el estado a mano en la hoja `Solicitudes`: el dashboard lo refleja.

**¿Puedo editar el Sheet a mano?** Sí. El dashboard y el Sheet siempre están sincronizados porque el Sheet *es* la base de datos.

**¿Procesa correos antiguos?** Escanea los últimos 7 días. Los hilos ya procesados quedan marcados con la etiqueta de Gmail `DealerTracker/Procesado` y no se repiten.

**Quiero añadir un tipo de documento nuevo.** Añádelo en `Config` (columnas D-E) con sus palabras clave y vuelve a ejecutar `generarSolicitudes` para crear las filas que falten.

## 📁 Archivos de este repositorio

```
apps-script/
├── Code.gs           # Lógica: escaneo de Gmail, clasificación, Sheets, Drive, borradores
├── Dashboard.html    # Dashboard web interactivo
└── appsscript.json   # Manifiesto (zona horaria, permisos)
```
