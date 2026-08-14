/**
 * ============================================================
 *  DEALER DOCUMENT TRACKER
 *  Centraliza correos de dealers, clasifica documentos,
 *  guarda adjuntos en Drive y actualiza Google Sheets.
 *  Organizado por CAMPAÑAS: cada casuística (p. ej. "Contratos
 *  de seguro - Jul 2026") es una campaña con su documento, sus
 *  dealers y su progreso.
 *  Dashboard web incluido (ver Dashboard.html).
 * ============================================================
 *
 *  PRIMEROS PASOS (ver README.md del repositorio):
 *   1. Ejecuta setup() una vez y autoriza los permisos.
 *      (setup() es seguro de re-ejecutar: migra sin borrar datos)
 *   2. Ejecuta instalarTriggers() para la automatización.
 *   3. Implementar > Nueva implementación > Aplicación web
 *      para obtener la URL del dashboard.
 *   4. Crea tu primera campaña desde el dashboard (➕ Nueva campaña).
 */

// ------------------------------------------------------------
// CONFIGURACIÓN GENERAL
// ------------------------------------------------------------

// Debe coincidir con la constante VERSION de Dashboard.html: si el dashboard
// muestra el aviso de versión, falta publicar "Nueva versión" en Implementar.
var VERSION = 5;

var HOJAS = {
  DEALERS: 'Dealers',
  CAMPANAS: 'Campañas',
  SOLICITUDES: 'Solicitudes',
  CORREOS: 'Correos',
  CONFIG: 'Config',
  INTERACCIONES: 'Interacciones',
  TAREAS: 'Tareas',
  TICKETS: 'Tickets',
  MENSAJES: 'Mensajes'
};

var ESTADOS = {
  PENDIENTE: 'Pendiente',                 // aún no se ha pedido
  SOLICITADO: 'Solicitado',               // ya se envió la petición, esperando respuesta
  RECIBIDO: 'Recibido - Por revisar',     // llegó un documento, falta validarlo
  VERIFICADO: 'Verificado',               // documento correcto, cerrado
  INCORRECTO: 'Incorrecto - Reenviar'     // enviaron algo mal, hay que pedirlo de nuevo
};

var ESTADOS_CAMPANA = { ACTIVA: 'Activa', CERRADA: 'Cerrada' };
var SIN_CAMPANA = '(sin campaña)';

var ESTADOS_CORREO = {
  NUEVO: 'Nuevo',
  RESPONDER: 'Responder',
  GESTIONADO: 'Gestionado'
};

var ETIQUETA_PROCESADO = 'DealerTracker/Procesado';
var ETIQUETA_REVISAR = 'DealerTracker/Revisar';

// Columnas (1-indexadas) de la hoja Solicitudes
var COL_SOL = {
  ID: 1, DEALER: 2, DOCUMENTO: 3, CAMPANA: 4, ESTADO: 5, FECHA_SOLICITUD: 6,
  ULTIMO_CONTACTO: 7, FECHA_RECIBIDO: 8, ARCHIVO: 9,
  DIAS_SIN_RESPUESTA: 10, SEGUIMIENTO: 11, NOTAS: 12, LINK_CORREO: 13
};

// Columnas de la hoja Campañas
var COL_CAM = {
  ID: 1, NOMBRE: 2, DOCUMENTO: 3, FECHA: 4, ESTADO: 5, N_DEALERS: 6, NOTAS: 7
};

// Columnas de la hoja Correos
var COL_COR = {
  FECHA: 1, DEALER: 2, REMITENTE: 3, ASUNTO: 4, DOCUMENTO: 5,
  ADJUNTOS: 6, ESTADO: 7, LINK: 8, THREAD_ID: 9, MESSAGE_ID: 10
};

// ---- Módulo CSM: llamadas segmentadas, tickets y mensajes con revisión ----

var SEGMENTOS = {
  ENABLEMENT: 'Enablement',   // reuniones de activación de capabilities (tracker de Notion)
  TICKET: 'Ticket',           // soporte de producto (canal ES-TICKETS)
  WEBSITE: 'Website',         // cambios de web (chat dealer-website-creation)
  COMPLIANCE: 'Compliance',   // auditorías, línea bloqueada… (compliance-ops)
  OTRO: 'Otro'
};

var TIPOS_INTERACCION = ['Llamada', 'Reunión', 'WhatsApp', 'Email', 'Slack'];

// Features del Summer Enablement Tracker de Notion (multi-select "Feature")
var FEATURES_ENABLEMENT = ['Website', 'Multiposting', 'Voice AI', 'Whatsapp API', 'CRM',
                           'Accounting Integration', 'Invoicing', 'Background AI', 'Custom AI Agent', 'Custom Templates'];

var ESTADOS_TICKET = { ABIERTO: 'Abierto', EN_CURSO: 'En curso', ESPERANDO: 'Esperando dealer', RESUELTO: 'Resuelto' };
var ESTADOS_MENSAJE = { BORRADOR: 'Borrador', APROBADO: 'Aprobado', ENVIADO: 'Enviado' };
var ESTADO_NOTION = { PENDIENTE: 'Pendiente', SINCRONIZADO: 'Sincronizado', NA: 'N/A' };

// Destinos de mensaje → clave de Config con el ID del canal de Slack
var DESTINOS_SLACK = {
  'ES-TICKETS': 'SLACK_CANAL_TICKETS',
  'dealer-website-creation': 'SLACK_CANAL_WEBSITE',
  'compliance-ops': 'SLACK_CANAL_COMPLIANCE'
};
var DESTINO_GMAIL = 'Gmail (dealer)';

var COL_INT = { ID: 1, FECHA: 2, DEALER: 3, TIPO: 4, SEGMENTO: 5, FEATURES: 6,
                RESUMEN: 7, ACUERDOS: 8, ESTADO_NOTION: 9, NOTAS: 10 };
var COL_TAR = { ID: 1, INTERACCION: 2, DEALER: 3, QUIEN: 4, DESCRIPCION: 5,
                FECHA_LIMITE: 6, ESTADO: 7, SEGMENTO: 8 };
var COL_TIC = { ID: 1, FECHA: 2, DEALER: 3, ORIGEN: 4, TIPOLOGIA: 5, DESCRIPCION: 6,
                ESTADO: 7, CANAL: 8, TS: 9, ACTUALIZADO: 10, NOTAS: 11 };
var COL_MSG = { ID: 1, FECHA: 2, DESTINO: 3, RELACION: 4, TEXTO: 5, ESTADO: 6,
                CANAL_ID: 7, THREAD_TS: 8, ENVIADO: 9, RESPUESTAS: 10 };

// ------------------------------------------------------------
// SETUP INICIAL (re-ejecutable: no borra datos existentes)
// ------------------------------------------------------------

/** Crea/migra las hojas, formatos, etiquetas de Gmail y carpeta de Drive. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre el script desde Extensiones > Apps Script dentro de un Google Sheet.');

  crearHojaConfig_(ss);
  crearHojaDealers_(ss);
  crearHojaCampanas_(ss);
  crearHojaSolicitudes_(ss);
  crearHojaCorreos_(ss);
  crearHojaInteracciones_(ss);
  crearHojaTareas_(ss);
  crearHojaTickets_(ss);
  crearHojaMensajes_(ss);
  asegurarConfigCSM_(ss);
  migrarEsquema_(ss);

  // Etiquetas de Gmail
  obtenerOCrearEtiqueta_(ETIQUETA_PROCESADO);
  obtenerOCrearEtiqueta_(ETIQUETA_REVISAR);

  // Carpeta raíz en Drive para los documentos
  if (!getConfig_('CARPETA_DRIVE_ID')) {
    setConfig_('CARPETA_DRIVE_ID', obtenerOCrearCarpetaRaiz_().getId());
  }

  var hojaDefecto = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hojaDefecto && ss.getSheets().length > 9) ss.deleteSheet(hojaDefecto);

  try {
    SpreadsheetApp.getUi().alert(
      'Setup completado ✔\n\n' +
      '1) Rellena la hoja "Dealers" con tus dealers y sus emails.\n' +
      '2) Ejecuta instalarTriggers() para activar la automatización.\n' +
      '3) Publica la aplicación web y crea tu primera campaña desde el dashboard.'
    );
  } catch (e) { /* sin UI (ejecución desde trigger/editor sin sheet abierto) */ }
}

/** Inicializa una hoja solo si es nueva o está vacía. Devuelve {hoja, nueva}. */
function hojaInicializable_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (hoja && hoja.getLastRow() > 1) return { hoja: hoja, nueva: false }; // ya tiene datos: no tocar
  if (!hoja) hoja = ss.insertSheet(nombre);
  return { hoja: hoja, nueva: true };
}

function cabecera_(hoja, columnas) {
  hoja.getRange(1, 1, 1, columnas.length).setValues([columnas])
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.setFrozenRows(1);
}

function crearHojaConfig_(ss) {
  var r = hojaInicializable_(ss, HOJAS.CONFIG);
  if (!r.nueva) return;
  var hoja = r.hoja;
  hoja.getRange('A1:B1').setValues([['Parámetro', 'Valor']]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.getRange('A2:B7').setValues([
    ['DIAS_PARA_SEGUIMIENTO', 5],
    ['DIAS_BUSQUEDA', 30],
    ['CARPETA_DRIVE_ID', ''],
    ['NOMBRE_CARPETA_DRIVE', 'Dealer Docs'],
    ['ASUNTO_SOLICITUD', 'Solicitud de documentación - {{DOCUMENTOS}}'],
    ['FIRMA', 'Un saludo,\nManuel']
  ]);

  hoja.getRange('D1:E1').setValues([['Tipo de documento', 'Palabras clave (separadas por coma)']])
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.getRange('D2:E3').setValues([
    ['Contrato de seguro', 'contrato, contract, poliza, póliza, policy, seguro, insurance'],
    ['Certificado de seguro', 'certificado, certificate, coi, insurance certificate, certificado de seguro']
  ]);
  hoja.setColumnWidths(1, 5, 220);
  hoja.getRange('E:E').setWrap(true);
}

function crearHojaDealers_(ss) {
  var r = hojaInicializable_(ss, HOJAS.DEALERS);
  if (!r.nueva) return;
  cabecera_(r.hoja, ['Dealer', 'Emails (separados por coma)', 'Contacto', 'Teléfono', 'Notas']);
  r.hoja.setColumnWidths(1, 5, 220);
  r.hoja.getRange('A2:E2').setValues([['Dealer Ejemplo S.L.', 'contacto@dealerejemplo.com', 'Juan Pérez', '+34 600 000 000', 'Fila de ejemplo: bórrala']]);
}

function crearHojaCampanas_(ss) {
  var r = hojaInicializable_(ss, HOJAS.CAMPANAS);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Nombre', 'Documento', 'Fecha creación', 'Estado', 'Nº dealers', 'Notas']);
  hoja.setColumnWidth(COL_CAM.NOMBRE, 260);
  hoja.setColumnWidth(COL_CAM.DOCUMENTO, 220);
  hoja.setColumnWidth(COL_CAM.NOTAS, 260);

  var regla = SpreadsheetApp.newDataValidation()
    .requireValueInList([ESTADOS_CAMPANA.ACTIVA, ESTADOS_CAMPANA.CERRADA], true).build();
  hoja.getRange(2, COL_CAM.ESTADO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
}

function crearHojaSolicitudes_(ss) {
  var r = hojaInicializable_(ss, HOJAS.SOLICITUDES);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Dealer', 'Documento', 'Campaña', 'Estado', 'Fecha solicitud', 'Último contacto',
                   'Fecha recibido', 'Archivo (Drive)', 'Días sin respuesta', 'Seguimiento', 'Notas', 'Link correo']);
  hoja.setColumnWidth(COL_SOL.DEALER, 200);
  hoja.setColumnWidth(COL_SOL.DOCUMENTO, 200);
  hoja.setColumnWidth(COL_SOL.CAMPANA, 220);
  hoja.setColumnWidth(COL_SOL.ARCHIVO, 260);
  hoja.setColumnWidth(COL_SOL.NOTAS, 260);
  aplicarFormatoSolicitudes_(hoja);
}

function aplicarFormatoSolicitudes_(hoja) {
  var estados = [ESTADOS.PENDIENTE, ESTADOS.SOLICITADO, ESTADOS.RECIBIDO, ESTADOS.VERIFICADO, ESTADOS.INCORRECTO];
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(estados, true).build();
  hoja.getRange(2, COL_SOL.ESTADO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);

  var rangoEstado = hoja.getRange(2, COL_SOL.ESTADO, hoja.getMaxRows() - 1, 1);
  var reglas = [
    [ESTADOS.VERIFICADO, '#d9ead3'],
    [ESTADOS.RECIBIDO, '#fff2cc'],
    [ESTADOS.INCORRECTO, '#f4cccc'],
    [ESTADOS.SOLICITADO, '#cfe2f3'],
    [ESTADOS.PENDIENTE, '#eeeeee']
  ].map(function (par) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(par[0]).setBackground(par[1]).setRanges([rangoEstado]).build();
  });
  hoja.setConditionalFormatRules(reglas);
}

function crearHojaCorreos_(ss) {
  var r = hojaInicializable_(ss, HOJAS.CORREOS);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['Fecha', 'Dealer', 'Remitente', 'Asunto', 'Documento detectado',
                   'Adjuntos', 'Estado', 'Link Gmail', 'ThreadId', 'MessageId']);
  hoja.setColumnWidth(COL_COR.ASUNTO, 300);
  hoja.setColumnWidth(COL_COR.ADJUNTOS, 260);
  hoja.setColumnWidth(COL_COR.LINK, 220);
}

/** Migración para hojas creadas con versiones anteriores. */
function migrarEsquema_(ss) {
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  if (!hoja || hoja.getLastColumn() < 1) return;
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];

  if (cab.indexOf('Campaña') === -1) {
    // La versión antigua tenía Documento en la col 3 y Estado en la 4:
    // insertamos "Campaña" entre ambas y marcamos las filas existentes.
    hoja.insertColumnAfter(3);
    hoja.getRange(1, COL_SOL.CAMPANA).setValue('Campaña')
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    hoja.setColumnWidth(COL_SOL.CAMPANA, 220);
    if (hoja.getLastRow() > 1) {
      var n = hoja.getLastRow() - 1;
      var valores = [];
      for (var i = 0; i < n; i++) valores.push([SIN_CAMPANA]);
      hoja.getRange(2, COL_SOL.CAMPANA, n, 1).setValues(valores);
    }
    hoja.setConditionalFormatRules([]); // las reglas antiguas apuntaban a la col 4
    aplicarFormatoSolicitudes_(hoja);
    cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  }

  if (cab.indexOf('Link correo') === -1) {
    hoja.getRange(1, COL_SOL.LINK_CORREO).setValue('Link correo')
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    hoja.setColumnWidth(COL_SOL.LINK_CORREO, 220);
  }
}

// ------------------------------------------------------------
// CAMPAÑAS: cada casuística nueva es una campaña
// ------------------------------------------------------------

/**
 * Crea una campaña y sus solicitudes. Llamada desde el dashboard.
 * datos = {
 *   nombre: 'Contratos de seguro - Jul 2026',
 *   documento: 'Contrato de seguro',        // existente en Config, o nuevo
 *   palabrasClave: 'contrato, poliza',      // solo si el documento es nuevo
 *   dealersModo: 'todos' | 'lista',
 *   dealersLista: 'Dealer A\nDealer B',     // solo si dealersModo === 'lista'
 *   notas: ''
 * }
 */
function crearCampana(datos) {
  if (!datos || !String(datos.nombre || '').trim()) throw new Error('La campaña necesita un nombre.');
  if (!String(datos.documento || '').trim()) throw new Error('Indica qué documento se solicita.');

  var nombre = String(datos.nombre).trim();
  var documento = String(datos.documento).trim();

  var yaExiste = leerCampanas_().some(function (c) { return c.nombre === nombre; });
  if (yaExiste) throw new Error('Ya existe una campaña llamada "' + nombre + '". Usa otro nombre.');

  // Si el tipo de documento es nuevo, lo damos de alta en Config con sus palabras clave
  var tipos = leerTiposDocumento_();
  var existeTipo = tipos.some(function (t) { return t.tipo.toLowerCase() === documento.toLowerCase(); });
  if (!existeTipo) {
    var palabras = String(datos.palabrasClave || documento).trim();
    var hojaConfig = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
    var filaLibre = 2;
    var col = hojaConfig.getRange('D2:D60').getValues();
    while (filaLibre - 2 < col.length && col[filaLibre - 2][0]) filaLibre++;
    hojaConfig.getRange(filaLibre, 4, 1, 2).setValues([[documento, palabras]]);
  }

  // Dealers de la campaña
  var todos = leerDealers_();
  var dealers;
  if (datos.dealersModo === 'lista') {
    var pedidos = String(datos.dealersLista || '').split(/[\n,;]+/)
      .map(function (s) { return s.trim(); }).filter(Boolean);
    if (!pedidos.length) throw new Error('La lista de dealers está vacía.');
    var porNombre = {};
    todos.forEach(function (d) { porNombre[d.nombre.toLowerCase()] = d.nombre; });
    var noEncontrados = [];
    dealers = pedidos.map(function (p) {
      var real = porNombre[p.toLowerCase()];
      if (!real) noEncontrados.push(p);
      return real;
    }).filter(Boolean);
    if (noEncontrados.length) {
      throw new Error('Estos dealers no están en la hoja Dealers: ' + noEncontrados.join(', '));
    }
  } else {
    dealers = todos.map(function (d) { return d.nombre; });
  }
  if (!dealers.length) throw new Error('No hay dealers. Rellena primero la hoja Dealers.');

  // Registrar la campaña
  var hojaCam = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CAMPANAS);
  var id = 'C-' + String(hojaCam.getLastRow()).padStart(3, '0');
  hojaCam.appendRow([id, nombre, documento, new Date(), ESTADOS_CAMPANA.ACTIVA, dealers.length, String(datos.notas || '')]);

  // Generar las solicitudes (evitando duplicados dentro de la misma campaña)
  var hojaSol = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.SOLICITUDES);
  var nuevas = dealers.map(function (dealer, i) {
    return ['S-' + String(hojaSol.getLastRow() + i).padStart(5, '0'),
            dealer, documento, nombre, ESTADOS.PENDIENTE, '', '', '', '', '', '', '', ''];
  });
  hojaSol.getRange(hojaSol.getLastRow() + 1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);

  return getDashboardData();
}

/** Cierra una campaña: deja de contar para clasificación y seguimientos. */
function cerrarCampana(nombre) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CAMPANAS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_CAM.NOMBRE - 1] === nombre) {
      hoja.getRange(i + 1, COL_CAM.ESTADO).setValue(ESTADOS_CAMPANA.CERRADA);
      actualizarSeguimientos();
      return getDashboardData();
    }
  }
  throw new Error('Campaña no encontrada: ' + nombre);
}

/** Reabre una campaña cerrada. */
function reabrirCampana(nombre) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CAMPANAS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_CAM.NOMBRE - 1] === nombre) {
      hoja.getRange(i + 1, COL_CAM.ESTADO).setValue(ESTADOS_CAMPANA.ACTIVA);
      actualizarSeguimientos();
      return getDashboardData();
    }
  }
  throw new Error('Campaña no encontrada: ' + nombre);
}

function leerCampanas_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CAMPANAS);
  if (!hoja) return [];
  var datos = hoja.getDataRange().getValues();
  var res = [];
  for (var i = 1; i < datos.length; i++) {
    if (!datos[i][COL_CAM.NOMBRE - 1]) continue;
    res.push({
      id: datos[i][COL_CAM.ID - 1],
      nombre: datos[i][COL_CAM.NOMBRE - 1],
      documento: datos[i][COL_CAM.DOCUMENTO - 1],
      fecha: datos[i][COL_CAM.FECHA - 1],
      estado: datos[i][COL_CAM.ESTADO - 1] || ESTADOS_CAMPANA.ACTIVA
    });
  }
  return res;
}

// ------------------------------------------------------------
// MOTOR PRINCIPAL: PROCESAR CORREOS ENTRANTES
// ------------------------------------------------------------

/** Escanea Gmail, clasifica los correos de dealers y actualiza las hojas. Ejecutado por trigger. */
function procesarCorreos() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // evita ejecuciones simultáneas

  try {
    var dealers = leerDealers_();
    var mapaEmailDealer = {};
    dealers.forEach(function (d) {
      d.emails.forEach(function (e) { mapaEmailDealer[e.toLowerCase()] = d.nombre; });
    });

    var tiposDoc = leerTiposDocumento_();
    var etiquetaProcesado = obtenerOCrearEtiqueta_(ETIQUETA_PROCESADO);
    var etiquetaRevisar = obtenerOCrearEtiqueta_(ETIQUETA_REVISAR);

    var todosEmails = Object.keys(mapaEmailDealer);
    if (!todosEmails.length) {
      Logger.log('La hoja Dealers está vacía: no hay remitentes que buscar.');
      return;
    }

    // Buscamos directamente por remitente (en bloques, Gmail limita la longitud
    // de la consulta) dentro de la ventana configurada. Los hilos ya procesados
    // quedan excluidos por la etiqueta (anidada: se busca con guiones).
    var dias = Number(getConfig_('DIAS_BUSQUEDA')) || 30;
    var sinProcesar = '-label:' + ETIQUETA_PROCESADO.toLowerCase().replace(/\//g, '-');
    var idsRegistrados = mensajesYaRegistrados_();

    for (var i = 0; i < todosEmails.length; i += 15) {
      var bloque = todosEmails.slice(i, i + 15);
      var consulta = 'newer_than:' + dias + 'd ' + sinProcesar +
                     ' from:(' + bloque.join(' OR ') + ')';
      var hilos = GmailApp.search(consulta, 0, 100);

      hilos.forEach(function (hilo) {
        var esDeDealer = false;
        hilo.getMessages().forEach(function (msg) {
          var remitente = extraerEmail_(msg.getFrom());
          var dealer = mapaEmailDealer[remitente];
          if (!dealer) return;                       // no es un dealer conocido
          if (idsRegistrados[msg.getId()]) return;   // ya registrado
          idsRegistrados[msg.getId()] = true;
          esDeDealer = true;

          var docDetectado = clasificarDocumento_(msg, tiposDoc);
          var archivos = guardarAdjuntos_(msg, dealer);
          registrarCorreo_(msg, dealer, docDetectado, archivos);
          actualizarSolicitud_(dealer, docDetectado, msg, archivos);
        });
        if (esDeDealer) {
          hilo.addLabel(etiquetaProcesado);
          hilo.addLabel(etiquetaRevisar);
        }
      });
    }

    actualizarSeguimientos();
  } finally {
    lock.releaseLock();
  }
}

/** Recalcula "Días sin respuesta" y marca qué solicitudes necesitan seguimiento (solo campañas activas). */
function actualizarSeguimientos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return;

  var cerradas = {};
  leerCampanas_().forEach(function (c) {
    if (c.estado === ESTADOS_CAMPANA.CERRADA) cerradas[c.nombre] = true;
  });

  var diasLimite = Number(getConfig_('DIAS_PARA_SEGUIMIENTO')) || 5;
  var hoy = new Date();
  var salida = []; // [días, seguimiento] por fila, escrito en un solo lote

  for (var i = 1; i < datos.length; i++) {
    var estado = datos[i][COL_SOL.ESTADO - 1];
    var campana = datos[i][COL_SOL.CAMPANA - 1];
    var referencia = datos[i][COL_SOL.ULTIMO_CONTACTO - 1] || datos[i][COL_SOL.FECHA_SOLICITUD - 1];
    var dias = '';
    var seguimiento = '';

    var activa = !cerradas[campana];
    if (activa && (estado === ESTADOS.SOLICITADO || estado === ESTADOS.INCORRECTO) && referencia instanceof Date) {
      dias = Math.floor((hoy - referencia) / (1000 * 60 * 60 * 24));
      seguimiento = dias >= diasLimite ? 'SÍ' : '';
    }
    salida.push([dias, seguimiento]);
  }
  if (salida.length) {
    hoja.getRange(2, COL_SOL.DIAS_SIN_RESPUESTA, salida.length, 2).setValues(salida);
  }
}

// ------------------------------------------------------------
// CLASIFICACIÓN Y GUARDADO
// ------------------------------------------------------------

function clasificarDocumento_(msg, tiposDoc) {
  var texto = (msg.getSubject() + ' ' +
               msg.getAttachments().map(function (a) { return a.getName(); }).join(' ') + ' ' +
               msg.getPlainBody().slice(0, 1500)).toLowerCase();

  for (var i = 0; i < tiposDoc.length; i++) {
    var coincide = tiposDoc[i].palabras.some(function (p) { return p && texto.indexOf(p) !== -1; });
    if (coincide) return tiposDoc[i].tipo;
  }
  return msg.getAttachments().length ? 'Otros documentos' : '';
}

function guardarAdjuntos_(msg, dealer) {
  var adjuntos = msg.getAttachments({ includeInlineImages: false });
  if (!adjuntos.length) return [];

  var raiz = DriveApp.getFolderById(getConfig_('CARPETA_DRIVE_ID'));
  var carpetaDealer = obtenerOCrearSubcarpeta_(raiz, dealer);
  var fecha = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return adjuntos.map(function (adj) {
    var archivo = carpetaDealer.createFile(adj.copyBlob().setName(fecha + ' - ' + adj.getName()));
    return { nombre: adj.getName(), url: archivo.getUrl() };
  });
}

function registrarCorreo_(msg, dealer, docDetectado, archivos) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CORREOS);
  hoja.appendRow([
    msg.getDate(), dealer, msg.getFrom(), msg.getSubject(),
    docDetectado || '(sin clasificar)',
    archivos.map(function (a) { return a.nombre; }).join(', '),
    archivos.length ? ESTADOS_CORREO.NUEVO : ESTADOS_CORREO.RESPONDER,
    'https://mail.google.com/mail/u/0/#all/' + msg.getThread().getId(),
    msg.getThread().getId(), msg.getId()
  ]);
}

/**
 * Actualiza la fila de Solicitudes que corresponde al documento recibido.
 * Busca dealer + documento entre las campañas ACTIVAS (la más reciente primero);
 * si no hay ninguna, acepta filas sin campaña (datos migrados).
 */
function actualizarSolicitud_(dealer, docDetectado, msg, archivos) {
  if (!docDetectado || docDetectado === 'Otros documentos') return;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();

  var campanas = {};
  leerCampanas_().forEach(function (c) { campanas[c.nombre] = c; });

  var mejor = null; // {fila, fecha}
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_SOL.DEALER - 1] !== dealer) continue;
    if (datos[i][COL_SOL.DOCUMENTO - 1] !== docDetectado) continue;
    if (datos[i][COL_SOL.ESTADO - 1] === ESTADOS.VERIFICADO) continue; // no reabrir lo cerrado

    var nombreCam = datos[i][COL_SOL.CAMPANA - 1];
    var cam = campanas[nombreCam];
    if (cam && cam.estado === ESTADOS_CAMPANA.CERRADA) continue;

    var fecha = cam && cam.fecha instanceof Date ? cam.fecha.getTime() : 0;
    if (!mejor || fecha > mejor.fecha) mejor = { fila: i + 1, fecha: fecha };
  }
  if (!mejor) return;

  hoja.getRange(mejor.fila, COL_SOL.ESTADO).setValue(ESTADOS.RECIBIDO);
  hoja.getRange(mejor.fila, COL_SOL.FECHA_RECIBIDO).setValue(msg.getDate());
  hoja.getRange(mejor.fila, COL_SOL.ULTIMO_CONTACTO).setValue(msg.getDate());
  hoja.getRange(mejor.fila, COL_SOL.LINK_CORREO)
      .setValue('https://mail.google.com/mail/u/0/#all/' + msg.getThread().getId());
  if (archivos.length) {
    hoja.getRange(mejor.fila, COL_SOL.ARCHIVO).setValue(archivos.map(function (a) { return a.url; }).join('\n'));
  }
}

// ------------------------------------------------------------
// ACCIONES DESDE EL DASHBOARD (google.script.run)
// ------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Dealer Document Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Devuelve todos los datos que necesita el dashboard en una sola llamada. */
function getDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var solicitudes = hojaAObjetos_(ss.getSheetByName(HOJAS.SOLICITUDES));
  var correos = hojaAObjetos_(ss.getSheetByName(HOJAS.CORREOS));
  correos.reverse(); // más recientes primero
  var campanas = hojaAObjetos_(ss.getSheetByName(HOJAS.CAMPANAS));

  var interacciones = hojaAObjetos_(ss.getSheetByName(HOJAS.INTERACCIONES));
  interacciones.reverse(); // más recientes primero
  var tickets = hojaAObjetos_(ss.getSheetByName(HOJAS.TICKETS));
  tickets.reverse();
  var mensajes = hojaAObjetos_(ss.getSheetByName(HOJAS.MENSAJES));
  mensajes.reverse();

  return {
    version: VERSION,
    solicitudes: solicitudes,
    correos: correos.slice(0, 200),
    campanas: campanas,
    tiposDocumento: leerTiposDocumento_().map(function (t) { return t.tipo; }),
    dealers: leerDealers_().map(function (d) { return { nombre: d.nombre, emails: d.emails.join(', ') }; }),
    interacciones: interacciones.slice(0, 300),
    tareas: hojaAObjetos_(ss.getSheetByName(HOJAS.TAREAS)),
    tickets: tickets.slice(0, 300),
    mensajes: mensajes.slice(0, 200),
    agendaHoy: getAgendaHoy_(),
    finDeDia: componerFinDeDia_(),
    tipologias: leerTipologias_(),
    segmentos: [SEGMENTOS.ENABLEMENT, SEGMENTOS.TICKET, SEGMENTOS.WEBSITE, SEGMENTOS.COMPLIANCE, SEGMENTOS.OTRO],
    tiposInteraccion: TIPOS_INTERACCION,
    features: FEATURES_ENABLEMENT,
    destinosSlack: Object.keys(DESTINOS_SLACK),
    slackOk: !!slackToken_(),
    notionOk: !!notionToken_() && !!String(getConfig_('NOTION_DB_TRACKER') || '').trim(),
    hoy: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    urlSheet: ss.getUrl(),
    actualizado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
  };
}

/** Marca una solicitud como verificada (documento correcto). */
function marcarVerificado(id) {
  var fila = buscarFilaSolicitud_(id);
  if (!fila) throw new Error('Solicitud no encontrada: ' + id);
  fila.hoja.getRange(fila.n, COL_SOL.ESTADO).setValue(ESTADOS.VERIFICADO);
  return getDashboardData();
}

/** Marca como incorrecta y crea un borrador en Gmail pidiendo el documento de nuevo. */
function marcarIncorrecto(id, motivo) {
  var fila = buscarFilaSolicitud_(id);
  if (!fila) throw new Error('Solicitud no encontrada: ' + id);
  var dealer = fila.valores[COL_SOL.DEALER - 1];
  var doc = fila.valores[COL_SOL.DOCUMENTO - 1];

  fila.hoja.getRange(fila.n, COL_SOL.ESTADO).setValue(ESTADOS.INCORRECTO);
  fila.hoja.getRange(fila.n, COL_SOL.ULTIMO_CONTACTO).setValue(new Date());
  if (motivo) fila.hoja.getRange(fila.n, COL_SOL.NOTAS).setValue(motivo);

  var emails = emailsDeDealer_(dealer);
  if (emails) {
    var cuerpo = 'Hola,\n\n' +
      'Gracias por el envío. Sin embargo, el documento recibido ("' + doc + '") no es el que necesitamos' +
      (motivo ? ' por el siguiente motivo: ' + motivo : '') + '.\n\n' +
      'Por favor, ¿podríais reenviarnos el documento correcto?\n\n' +
      (getConfig_('FIRMA') || '');
    GmailApp.createDraft(emails, 'Documento incorrecto - ' + doc, cuerpo);
  }
  return getDashboardData();
}

/** Crea un borrador de seguimiento para una solicitud concreta. */
function crearBorradorSeguimiento(id) {
  var fila = buscarFilaSolicitud_(id);
  if (!fila) throw new Error('Solicitud no encontrada: ' + id);
  var dealer = fila.valores[COL_SOL.DEALER - 1];
  var doc = fila.valores[COL_SOL.DOCUMENTO - 1];
  var emails = emailsDeDealer_(dealer);
  if (!emails) throw new Error('El dealer "' + dealer + '" no tiene email en la hoja Dealers.');

  var cuerpo = 'Hola,\n\n' +
    'Te escribo para hacer seguimiento de nuestra solicitud del documento: ' + doc + '.\n' +
    'Todavía no lo hemos recibido y lo necesitamos para continuar con el proceso.\n\n' +
    '¿Podrías enviárnoslo cuando te sea posible?\n\n' +
    (getConfig_('FIRMA') || '');
  GmailApp.createDraft(emails, 'Seguimiento: ' + doc, cuerpo);

  fila.hoja.getRange(fila.n, COL_SOL.ULTIMO_CONTACTO).setValue(new Date());
  return getDashboardData();
}

/**
 * Crea borradores de solicitud para los documentos en estado "Pendiente",
 * agrupados por dealer. Si se indica una campaña, solo los de esa campaña.
 */
function crearSolicitudesIniciales(campana) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();
  var porDealer = {};

  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_SOL.ESTADO - 1] !== ESTADOS.PENDIENTE) continue;
    if (campana && datos[i][COL_SOL.CAMPANA - 1] !== campana) continue;
    var dealer = datos[i][COL_SOL.DEALER - 1];
    (porDealer[dealer] = porDealer[dealer] || []).push({ fila: i + 1, doc: datos[i][COL_SOL.DOCUMENTO - 1] });
  }

  var creados = 0;
  Object.keys(porDealer).forEach(function (dealer) {
    var emails = emailsDeDealer_(dealer);
    if (!emails) return;
    var docs = porDealer[dealer].map(function (x) { return x.doc; });
    var asunto = (getConfig_('ASUNTO_SOLICITUD') || 'Solicitud de documentación - {{DOCUMENTOS}}')
      .replace('{{DOCUMENTOS}}', docs.join(', '));
    var cuerpo = 'Hola,\n\n' +
      'Necesitamos que nos hagáis llegar la siguiente documentación:\n\n' +
      docs.map(function (d) { return ' - ' + d; }).join('\n') + '\n\n' +
      'Podéis responder a este mismo correo adjuntando los documentos.\n\n' +
      (getConfig_('FIRMA') || '');
    GmailApp.createDraft(emails, asunto, cuerpo);
    creados++;

    porDealer[dealer].forEach(function (x) {
      hoja.getRange(x.fila, COL_SOL.ESTADO).setValue(ESTADOS.SOLICITADO);
      hoja.getRange(x.fila, COL_SOL.FECHA_SOLICITUD).setValue(new Date());
      hoja.getRange(x.fila, COL_SOL.ULTIMO_CONTACTO).setValue(new Date());
    });
  });

  return { borradores: creados, data: getDashboardData() };
}

/** Marca un correo del registro como gestionado. */
function marcarCorreoGestionado(messageId) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CORREOS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][COL_COR.MESSAGE_ID - 1]) === String(messageId)) {
      hoja.getRange(i + 1, COL_COR.ESTADO).setValue(ESTADOS_CORREO.GESTIONADO);
      break;
    }
  }
  return getDashboardData();
}

/** Fuerza un escaneo de Gmail desde el dashboard. */
function escanearAhora() {
  procesarCorreos();
  return getDashboardData();
}

// ------------------------------------------------------------
// TRIGGERS
// ------------------------------------------------------------

/**
 * Instala la automatización: escaneo cada 10 minutos, seguimientos cada mañana,
 * lectura de respuestas de Slack cada 15 min (no hace nada sin token) y
 * borrador de fin de día a las 18:00.
 */
function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['procesarCorreos', 'actualizarSeguimientos', 'refrescarRespuestasSlack', 'prepararFinDeDia']
        .indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('actualizarSeguimientos').timeBased().atHour(7).everyDays(1).create();
  ScriptApp.newTrigger('refrescarRespuestasSlack').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('prepararFinDeDia').timeBased().atHour(18).everyDays(1).create();
  Logger.log('Triggers instalados: escaneo cada 10 min, seguimientos a las 7:00, ' +
             'respuestas de Slack cada 15 min y borrador de fin de día a las 18:00.');
}

// ------------------------------------------------------------
// UTILIDADES INTERNAS
// ------------------------------------------------------------

function leerDealers_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.DEALERS);
  var datos = hoja.getDataRange().getValues();
  var dealers = [];
  for (var i = 1; i < datos.length; i++) {
    if (!datos[i][0]) continue;
    dealers.push({
      nombre: String(datos[i][0]).trim(),
      emails: String(datos[i][1] || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean)
    });
  }
  return dealers;
}

function leerTiposDocumento_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
  var datos = hoja.getRange('D2:E60').getValues();
  return datos.filter(function (f) { return f[0]; }).map(function (f) {
    return {
      tipo: String(f[0]).trim(),
      palabras: String(f[1] || '').toLowerCase().split(',').map(function (p) { return p.trim(); }).filter(Boolean)
    };
  });
}

function emailsDeDealer_(nombre) {
  var d = leerDealers_().filter(function (x) { return x.nombre === nombre; })[0];
  return d && d.emails.length ? d.emails.join(',') : '';
}

function mensajesYaRegistrados_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CORREOS);
  var ids = {};
  if (hoja.getLastRow() < 2) return ids;
  hoja.getRange(2, COL_COR.MESSAGE_ID, hoja.getLastRow() - 1, 1).getValues()
    .forEach(function (f) { if (f[0]) ids[String(f[0])] = true; });
  return ids;
}

function buscarFilaSolicitud_(id) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][COL_SOL.ID - 1]) === String(id)) {
      return { hoja: hoja, n: i + 1, valores: datos[i] };
    }
  }
  return null;
}

function hojaAObjetos_(hoja) {
  if (!hoja) return [];
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];
  var cab = datos[0];
  return datos.slice(1).filter(function (f) { return f[0] !== ''; }).map(function (f) {
    var obj = {};
    cab.forEach(function (c, j) {
      obj[c] = f[j] instanceof Date
        ? Utilities.formatDate(f[j], Session.getScriptTimeZone(), 'dd/MM/yyyy')
        : f[j];
    });
    return obj;
  });
}

function extraerEmail_(from) {
  var m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

function obtenerOCrearEtiqueta_(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

function obtenerOCrearCarpetaRaiz_() {
  var nombre = getConfig_('NOMBRE_CARPETA_DRIVE') || 'Dealer Docs';
  var it = DriveApp.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
}

function obtenerOCrearSubcarpeta_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function getConfig_(clave) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
  var datos = hoja.getRange('A2:B60').getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === clave) return datos[i][1];
  }
  return '';
}

function setConfig_(clave, valor) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
  var datos = hoja.getRange('A2:B60').getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === clave) {
      hoja.getRange(i + 2, 2).setValue(valor);
      return;
    }
  }
  // appendRow saltaría a la fila siguiente a las columnas D/E (tipos de documento):
  // escribimos en la primera fila libre de la columna A.
  for (var j = 0; j < datos.length; j++) {
    if (!datos[j][0]) {
      hoja.getRange(j + 2, 1, 1, 2).setValues([[clave, valor]]);
      return;
    }
  }
  hoja.appendRow([clave, valor]);
}

// ============================================================
//  MÓDULO CSM: LLAMADAS SEGMENTADAS, TICKETS, MENSAJES (Slack)
//  Y FIN DE DÍA (tracker de enablement en Notion)
// ============================================================
//
//  Funciona en modo dual:
//   - Sin tokens: genera los mensajes en inglés para copiar/pegar.
//   - Con SLACK_BOT_TOKEN / NOTION_TOKEN en Config: envío directo
//     a Slack y escritura en Notion, siempre tras tu revisión.

// ------------------------------------------------------------
// CSM · Hojas y configuración
// ------------------------------------------------------------

function crearHojaInteracciones_(ss) {
  var r = hojaInicializable_(ss, HOJAS.INTERACCIONES);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Fecha', 'Dealer', 'Tipo', 'Segmento', 'Features',
                   'Resumen', 'Acuerdos', 'Estado Notion', 'Notas']);
  hoja.setColumnWidth(COL_INT.DEALER, 200);
  hoja.setColumnWidth(COL_INT.RESUMEN, 320);
  hoja.setColumnWidth(COL_INT.ACUERDOS, 320);
  var regla = SpreadsheetApp.newDataValidation()
    .requireValueInList([SEGMENTOS.ENABLEMENT, SEGMENTOS.TICKET, SEGMENTOS.WEBSITE, SEGMENTOS.COMPLIANCE, SEGMENTOS.OTRO], true).build();
  hoja.getRange(2, COL_INT.SEGMENTO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
}

function crearHojaTareas_(ss) {
  var r = hojaInicializable_(ss, HOJAS.TAREAS);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Interacción', 'Dealer', 'Quién', 'Descripción',
                   'Fecha límite', 'Estado', 'Segmento']);
  hoja.setColumnWidth(COL_TAR.DESCRIPCION, 360);
  hoja.setColumnWidth(COL_TAR.DEALER, 200);
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(['Pendiente', 'Hecho'], true).build();
  hoja.getRange(2, COL_TAR.ESTADO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
}

function crearHojaTickets_(ss) {
  var r = hojaInicializable_(ss, HOJAS.TICKETS);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Fecha', 'Dealer', 'Origen', 'Tipología', 'Descripción',
                   'Estado', 'Canal Slack', 'Slack ts', 'Última actualización', 'Notas']);
  hoja.setColumnWidth(COL_TIC.DEALER, 200);
  hoja.setColumnWidth(COL_TIC.DESCRIPCION, 360);
  hoja.setColumnWidth(COL_TIC.NOTAS, 260);
  var estados = [ESTADOS_TICKET.ABIERTO, ESTADOS_TICKET.EN_CURSO, ESTADOS_TICKET.ESPERANDO, ESTADOS_TICKET.RESUELTO];
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(estados, true).build();
  hoja.getRange(2, COL_TIC.ESTADO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
}

function crearHojaMensajes_(ss) {
  var r = hojaInicializable_(ss, HOJAS.MENSAJES);
  if (!r.nueva) return;
  var hoja = r.hoja;
  cabecera_(hoja, ['ID', 'Fecha', 'Destino', 'Relacionado', 'Texto (EN)', 'Estado',
                   'Canal ID', 'Thread ts', 'Enviado', 'Respuestas']);
  hoja.setColumnWidth(COL_MSG.TEXTO, 420);
  hoja.setColumnWidth(COL_MSG.RELACION, 200);
  var estados = [ESTADOS_MENSAJE.BORRADOR, ESTADOS_MENSAJE.APROBADO, ESTADOS_MENSAJE.ENVIADO];
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(estados, true).build();
  hoja.getRange(2, COL_MSG.ESTADO, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
}

/**
 * Añade a Config las claves del módulo CSM (si faltan) y la tabla de
 * tipologías de ticket (columnas G/H). Idempotente.
 */
function asegurarConfigCSM_(ss) {
  var hoja = ss.getSheetByName(HOJAS.CONFIG);
  var claves = hoja.getRange('A2:A60').getValues().map(function (f) { return f[0]; });
  [
    ['SLACK_BOT_TOKEN', ''],
    ['SLACK_CANAL_TICKETS', ''],
    ['SLACK_CANAL_WEBSITE', ''],
    ['SLACK_CANAL_COMPLIANCE', ''],
    ['SLACK_USER_WEBSITE_OWNER', ''],
    ['NOTION_TOKEN', ''],
    ['NOTION_DB_TRACKER', '39d7a68b263046569429b2916e8ee036'],
    ['CALENDARIO_ID', '']
  ].forEach(function (par) {
    if (claves.indexOf(par[0]) === -1) setConfig_(par[0], par[1]);
  });

  // Tipologías de ticket ↔ canal de Slack por defecto (editable sin tocar código)
  if (!hoja.getRange('G1').getValue()) {
    hoja.getRange('G1:H1').setValues([['Tipología de ticket', 'Canal Slack por defecto']])
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    hoja.getRange('G2:H12').setValues([
      ['Bugs & App questions (DMS)', 'ES-TICKETS'],
      ['Bugs & App questions (Non-DMS)', 'ES-TICKETS'],
      ['Payments', 'ES-TICKETS'],
      ['Billing', 'ES-TICKETS'],
      ['Manual alterations & Backoffice', 'ES-TICKETS'],
      ['Compliance', 'compliance-ops'],
      ['Line Increases', 'compliance-ops'],
      ['KYS', 'compliance-ops'],
      ['Exceptions & Concessions', 'compliance-ops'],
      ['Website', 'dealer-website-creation'],
      ['Otro', 'ES-TICKETS']
    ]);
    hoja.setColumnWidth(7, 260);
    hoja.setColumnWidth(8, 220);
  }
}

function leerTipologias_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
  if (!hoja || !hoja.getRange('G1').getValue()) return [];
  return hoja.getRange('G2:H40').getValues()
    .filter(function (f) { return f[0]; })
    .map(function (f) { return { tipologia: String(f[0]).trim(), canal: String(f[1] || 'ES-TICKETS').trim() }; });
}

function canalDeTipologia_(tipologia) {
  var t = leerTipologias_().filter(function (x) { return x.tipologia === tipologia; })[0];
  return t ? t.canal : 'ES-TICKETS';
}

// ------------------------------------------------------------
// CSM · Registro de interacciones (llamadas, reuniones, mensajes)
// ------------------------------------------------------------

/**
 * Registra una interacción con un dealer y dispara lo que corresponda al segmento:
 *  - Enablement → queda pendiente del update de fin de día en Notion y, si el dealer
 *    debe algo, borrador de follow-up en inglés (Gmail).
 *  - Ticket / Website / Compliance → crea el ticket y el borrador del mensaje de
 *    Slack en inglés para el canal correspondiente (bandeja Mensajes).
 *
 * datos = { dealer, tipo, segmento, features: [], resumen,
 *           pendientesDealer: 'una por línea', pendientesMios: 'una por línea',
 *           tipologia: '', fechaLimite: 'yyyy-mm-dd', notas: '' }
 */
function registrarInteraccion(datos) {
  if (!datos || !String(datos.dealer || '').trim()) throw new Error('Indica el dealer.');
  if (!String(datos.resumen || '').trim()) throw new Error('Escribe un resumen de la interacción.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dealer = String(datos.dealer).trim();
  var segmento = datos.segmento || SEGMENTOS.OTRO;
  var resumen = String(datos.resumen).trim();
  var features = (datos.features || []).join(', ');
  var pendDealer = lineas_(datos.pendientesDealer);
  var pendMios = lineas_(datos.pendientesMios);

  var acuerdos = [];
  if (pendDealer.length) acuerdos.push('Dealer debe: ' + pendDealer.join(' | '));
  if (pendMios.length) acuerdos.push('Yo debo: ' + pendMios.join(' | '));

  var hojaInt = ss.getSheetByName(HOJAS.INTERACCIONES);
  var id = 'I-' + String(hojaInt.getLastRow()).padStart(5, '0');
  var estadoNotion = segmento === SEGMENTOS.ENABLEMENT ? ESTADO_NOTION.PENDIENTE : ESTADO_NOTION.NA;
  hojaInt.appendRow([id, new Date(), dealer, datos.tipo || 'Llamada', segmento, features,
                     resumen, acuerdos.join('\n'), estadoNotion, String(datos.notas || '')]);

  // Tareas derivadas de los acuerdos
  var hojaTar = ss.getSheetByName(HOJAS.TAREAS);
  var fechaLimite = String(datos.fechaLimite || '');
  var nuevasTareas = pendDealer.map(function (d) { return ['Dealer', d]; })
    .concat(pendMios.map(function (d) { return ['Yo', d]; }));
  var baseTar = hojaTar.getLastRow();
  nuevasTareas.forEach(function (t, i) {
    hojaTar.appendRow(['T-' + String(baseTar + i).padStart(5, '0'),
                       id, dealer, t[0], t[1], fechaLimite, 'Pendiente', segmento]);
  });

  // Acciones por segmento
  if (segmento === SEGMENTOS.ENABLEMENT && pendDealer.length) {
    crearMensaje_(DESTINO_GMAIL, dealer, plantillaFollowUpEnablement_(dealer, pendDealer), '', '');
  }
  if (segmento === SEGMENTOS.TICKET) {
    var tipologia = datos.tipologia || 'Otro';
    var idTicket = crearTicket_(dealer, datos.tipo || 'Llamada', tipologia, resumen);
    crearMensaje_(canalDeTipologia_(tipologia), idTicket, plantillaTicket_(dealer, tipologia, resumen, datos.tipo), '', '');
  }
  if (segmento === SEGMENTOS.WEBSITE) {
    var idT = crearTicket_(dealer, datos.tipo || 'Llamada', 'Website', resumen);
    crearMensaje_('dealer-website-creation', idT, plantillaWebsite_(dealer, pendDealer.length ? pendDealer : [resumen]), '', '');
  }
  if (segmento === SEGMENTOS.COMPLIANCE) {
    var idC = crearTicket_(dealer, datos.tipo || 'Llamada', 'Compliance', resumen);
    crearMensaje_('compliance-ops', idC, plantillaCompliance_(dealer, resumen), '', '');
  }

  return getDashboardData();
}

/** Marca una tarea como hecha o pendiente. */
function marcarTarea(id, hecho) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.TAREAS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][COL_TAR.ID - 1]) === String(id)) {
      hoja.getRange(i + 1, COL_TAR.ESTADO).setValue(hecho ? 'Hecho' : 'Pendiente');
      return getDashboardData();
    }
  }
  throw new Error('Tarea no encontrada: ' + id);
}

function lineas_(texto) {
  return String(texto || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

// ------------------------------------------------------------
// CSM · Tickets
// ------------------------------------------------------------

function crearTicket_(dealer, origen, tipologia, descripcion) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.TICKETS);
  var id = 'TK-' + String(hoja.getLastRow()).padStart(4, '0');
  hoja.appendRow([id, new Date(), dealer, origen, tipologia, descripcion,
                  ESTADOS_TICKET.ABIERTO, canalDeTipologia_(tipologia), '', new Date(), '']);
  return id;
}

/** Alta manual de un ticket desde el dashboard (entrada por HubSpot/WhatsApp, etc.). */
function crearTicket(datos) {
  if (!datos || !String(datos.dealer || '').trim()) throw new Error('Indica el dealer.');
  if (!String(datos.descripcion || '').trim()) throw new Error('Describe el problema.');
  var tipologia = datos.tipologia || 'Otro';
  var id = crearTicket_(String(datos.dealer).trim(), datos.origen || 'HubSpot-WhatsApp', tipologia,
                        String(datos.descripcion).trim());
  if (datos.publicar) {
    crearMensaje_(canalDeTipologia_(tipologia), id,
                  plantillaTicket_(String(datos.dealer).trim(), tipologia, String(datos.descripcion).trim(), datos.origen), '', '');
  }
  return getDashboardData();
}

function actualizarTicket(id, estado, notas) {
  var fila = buscarFilaPorId_(HOJAS.TICKETS, COL_TIC.ID, id);
  if (!fila) throw new Error('Ticket no encontrado: ' + id);
  if (estado) fila.hoja.getRange(fila.n, COL_TIC.ESTADO).setValue(estado);
  if (notas !== undefined && notas !== null && notas !== '') fila.hoja.getRange(fila.n, COL_TIC.NOTAS).setValue(notas);
  fila.hoja.getRange(fila.n, COL_TIC.ACTUALIZADO).setValue(new Date());
  return getDashboardData();
}

/**
 * Redacta una respuesta a un ticket: crea el borrador en la bandeja Mensajes
 * apuntando al canal del ticket (y a su thread si el mensaje original salió
 * del dashboard). Se envía después desde la pestaña Mensajes.
 */
function responderTicket(id, texto) {
  var fila = buscarFilaPorId_(HOJAS.TICKETS, COL_TIC.ID, id);
  if (!fila) throw new Error('Ticket no encontrado: ' + id);
  if (!String(texto || '').trim()) throw new Error('Escribe la respuesta.');
  var canal = fila.valores[COL_TIC.CANAL - 1] || 'ES-TICKETS';
  var ts = String(fila.valores[COL_TIC.TS - 1] || '');
  crearMensaje_(canal, id, String(texto).trim(), '', ts);
  fila.hoja.getRange(fila.n, COL_TIC.ESTADO).setValue(ESTADOS_TICKET.EN_CURSO);
  fila.hoja.getRange(fila.n, COL_TIC.ACTUALIZADO).setValue(new Date());
  return getDashboardData();
}

// ------------------------------------------------------------
// CSM · Bandeja de mensajes (borrador → revisión → envío)
// ------------------------------------------------------------

function crearMensaje_(destino, relacion, texto, canalId, threadTs) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.MENSAJES);
  var id = 'M-' + String(hoja.getLastRow()).padStart(5, '0');
  hoja.appendRow([id, new Date(), destino, relacion, texto,
                  ESTADOS_MENSAJE.BORRADOR, canalId || '', threadTs || '', '', '']);
  return id;
}

/**
 * Aprueba y envía un mensaje (con el texto editado en el dashboard):
 *  - Destino Gmail → crea un borrador en Gmail al dealer (tú lo envías).
 *  - Destino Slack + token → chat.postMessage (al thread si lo hay).
 *  - Destino Slack sin token → lo deja Aprobado para copiar/pegar.
 */
function aprobarYEnviarMensaje(id, texto) {
  var fila = buscarFilaPorId_(HOJAS.MENSAJES, COL_MSG.ID, id);
  if (!fila) throw new Error('Mensaje no encontrado: ' + id);
  var destino = fila.valores[COL_MSG.DESTINO - 1];
  var textoFinal = String(texto || fila.valores[COL_MSG.TEXTO - 1] || '').trim();
  if (!textoFinal) throw new Error('El mensaje está vacío.');
  fila.hoja.getRange(fila.n, COL_MSG.TEXTO).setValue(textoFinal);

  if (destino === DESTINO_GMAIL) {
    var dealer = fila.valores[COL_MSG.RELACION - 1];
    var emails = emailsDeDealer_(dealer);
    if (!emails) throw new Error('El dealer "' + dealer + '" no tiene email en la hoja Dealers. Añádelo o copia el texto.');
    GmailApp.createDraft(emails, 'Follow-up: pending items – ' + dealer, textoFinal);
    marcarMensajeEnviado_(fila, 'Borrador Gmail');
    return { enviado: true, via: 'gmail', data: getDashboardData() };
  }

  var claveCanal = DESTINOS_SLACK[destino];
  if (!claveCanal) throw new Error('Destino desconocido: ' + destino);

  if (!slackToken_()) {
    fila.hoja.getRange(fila.n, COL_MSG.ESTADO).setValue(ESTADOS_MENSAJE.APROBADO);
    return { enviado: false, via: 'copiar', texto: textoFinal, data: getDashboardData() };
  }

  var canalId = String(fila.valores[COL_MSG.CANAL_ID - 1] || getConfig_(claveCanal) || '').trim();
  if (!canalId) {
    throw new Error('Falta el ID del canal "' + destino + '" en Config (' + claveCanal + '). ' +
                    'Cópialo desde Slack: detalles del canal → ID.');
  }
  var threadTs = String(fila.valores[COL_MSG.THREAD_TS - 1] || '').trim();
  var respuesta = slackPost_('chat.postMessage', {
    channel: canalId,
    text: textoFinal,
    thread_ts: threadTs || undefined
  });

  fila.hoja.getRange(fila.n, COL_MSG.CANAL_ID).setValue(canalId);
  fila.hoja.getRange(fila.n, COL_MSG.THREAD_TS).setValue(threadTs || respuesta.ts);
  marcarMensajeEnviado_(fila, 'Slack');

  // Si el mensaje abre un ticket, guardamos su ts para responder en el mismo thread
  var relacion = String(fila.valores[COL_MSG.RELACION - 1] || '');
  if (relacion.indexOf('TK-') === 0 && !threadTs) {
    var ticket = buscarFilaPorId_(HOJAS.TICKETS, COL_TIC.ID, relacion);
    if (ticket && !ticket.valores[COL_TIC.TS - 1]) {
      ticket.hoja.getRange(ticket.n, COL_TIC.TS).setValue(respuesta.ts);
    }
  }
  return { enviado: true, via: 'slack', data: getDashboardData() };
}

/** Marca un mensaje como enviado a mano (flujo copiar/pegar). */
function marcarMensajeEnviado(id) {
  var fila = buscarFilaPorId_(HOJAS.MENSAJES, COL_MSG.ID, id);
  if (!fila) throw new Error('Mensaje no encontrado: ' + id);
  marcarMensajeEnviado_(fila, 'Manual');
  return getDashboardData();
}

function marcarMensajeEnviado_(fila, via) {
  fila.hoja.getRange(fila.n, COL_MSG.ESTADO).setValue(ESTADOS_MENSAJE.ENVIADO);
  fila.hoja.getRange(fila.n, COL_MSG.ENVIADO)
      .setValue(via + ' · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm'));
}

/** Lee las respuestas de los threads de Slack enviados desde aquí. Trigger cada 15 min. */
function refrescarRespuestasSlack() {
  if (!slackToken_()) return;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.MENSAJES);
  if (!hoja || hoja.getLastRow() < 2) return;
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_MSG.ESTADO - 1] !== ESTADOS_MENSAJE.ENVIADO) continue;
    var canal = String(datos[i][COL_MSG.CANAL_ID - 1] || '');
    var ts = String(datos[i][COL_MSG.THREAD_TS - 1] || '');
    if (!canal || !ts) continue;
    try {
      var r = slackGet_('conversations.replies', { channel: canal, ts: ts, limit: 50 });
      var n = (r.messages || []).length - 1;
      if (n > 0) {
        var ultimo = r.messages[r.messages.length - 1];
        var fecha = Utilities.formatDate(new Date(Number(ultimo.ts) * 1000), Session.getScriptTimeZone(), 'dd/MM HH:mm');
        hoja.getRange(i + 1, COL_MSG.RESPUESTAS).setValue(n + ' respuesta' + (n === 1 ? '' : 's') + ' · última ' + fecha);
      }
    } catch (e) {
      Logger.log('Slack replies (' + canal + '/' + ts + '): ' + e.message);
    }
  }
}

// ------------------------------------------------------------
// CSM · Plantillas de mensajes (en inglés, editables antes de enviar)
// ------------------------------------------------------------

function plantillaFollowUpEnablement_(dealer, pendientes) {
  return 'Hi team,\n\n' +
    'Thanks a lot for the call today! As agreed, could you please send us the following ' +
    'so we can keep moving forward with the setup:\n\n' +
    pendientes.map(function (p) { return ' - ' + p; }).join('\n') + '\n\n' +
    'As soon as we receive it we will continue on our side. Thank you!\n\n' +
    (getConfig_('FIRMA') || 'Best,\nManuel');
}

function plantillaWebsite_(dealer, cambios) {
  var owner = String(getConfig_('SLACK_USER_WEBSITE_OWNER') || '').trim();
  var mencion = owner ? '<@' + owner + '> ' : '@charushila.jagdale.ex ';
  return mencion + '— the dealer *' + dealer + '* requested the following changes to their website:\n\n' +
    cambios.map(function (c) { return ' • ' + c; }).join('\n') + '\n\n' +
    'Could you apply them when possible? Let me know if anything is unclear. Thank you!';
}

function plantillaCompliance_(dealer, descripcion) {
  return 'Hi team! Request regarding *' + dealer + '*:\n\n' + descripcion + '\n\n' +
    'Could you please have a look and confirm next steps? Thanks a lot!';
}

function plantillaTicket_(dealer, tipologia, descripcion, origen) {
  return '*Ticket – ' + dealer + '* (' + tipologia + (origen ? ' · via ' + origen : '') + ')\n\n' +
    descripcion + '\n\n' +
    'I will follow up with the dealer — any input from your side is welcome.';
}

// ------------------------------------------------------------
// CSM · Slack API (UrlFetchApp)
// ------------------------------------------------------------

function slackToken_() {
  return String(getConfig_('SLACK_BOT_TOKEN') || '').trim();
}

function slackPost_(metodo, payload) {
  var limpio = {};
  Object.keys(payload).forEach(function (k) { if (payload[k] !== undefined) limpio[k] = payload[k]; });
  var r = UrlFetchApp.fetch('https://slack.com/api/' + metodo, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + slackToken_() },
    payload: JSON.stringify(limpio),
    muteHttpExceptions: true
  });
  var json = JSON.parse(r.getContentText());
  if (!json.ok) throw new Error('Slack (' + metodo + '): ' + json.error);
  return json;
}

function slackGet_(metodo, params) {
  var query = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var r = UrlFetchApp.fetch('https://slack.com/api/' + metodo + '?' + query, {
    headers: { Authorization: 'Bearer ' + slackToken_() },
    muteHttpExceptions: true
  });
  var json = JSON.parse(r.getContentText());
  if (!json.ok) throw new Error('Slack (' + metodo + '): ' + json.error);
  return json;
}

// ------------------------------------------------------------
// CSM · Notion API (Summer Enablement Tracker)
// ------------------------------------------------------------

function notionToken_() {
  return String(getConfig_('NOTION_TOKEN') || '').trim();
}

function notionFetch_(ruta, metodo, payload) {
  var opciones = {
    method: metodo,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + notionToken_(),
      'Notion-Version': '2022-06-28'
    },
    muteHttpExceptions: true
  };
  if (payload) opciones.payload = JSON.stringify(payload);
  var r = UrlFetchApp.fetch('https://api.notion.com/v1/' + ruta, opciones);
  var json = JSON.parse(r.getContentText());
  if (r.getResponseCode() >= 300) {
    throw new Error('Notion (' + ruta + '): ' + (json.message || r.getResponseCode()));
  }
  return json;
}

/** Busca la página del dealer en el tracker por su título. */
function buscarPaginaDealerNotion_(dealer) {
  var db = String(getConfig_('NOTION_DB_TRACKER') || '').trim();
  if (!db) throw new Error('Falta NOTION_DB_TRACKER en Config.');
  var filtros = ['equals', 'contains'];
  for (var i = 0; i < filtros.length; i++) {
    var cuerpo = { page_size: 3, filter: { property: 'Dealer', title: {} } };
    cuerpo.filter.title[filtros[i]] = dealer;
    var r = notionFetch_('databases/' + db + '/query', 'post', cuerpo);
    if (r.results && r.results.length) {
      var pagina = r.results[0];
      var prop = pagina.properties && pagina.properties['Latest Update'];
      var actual = prop && prop.rich_text
        ? prop.rich_text.map(function (t) { return t.plain_text; }).join('')
        : '';
      return { id: pagina.id, latestUpdate: actual };
    }
  }
  return null;
}

/** Antepone "[dd/MM] comentario" al Latest Update del dealer en el tracker. */
function actualizarNotionDealer_(dealer, comentario) {
  var pagina = buscarPaginaDealerNotion_(dealer);
  if (!pagina) throw new Error('No encuentro a "' + dealer + '" en el tracker de Notion (columna Dealer).');
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM');
  var nuevo = '[' + fecha + '] ' + comentario;
  if (pagina.latestUpdate) nuevo += '\n' + pagina.latestUpdate;
  if (nuevo.length > 1900) nuevo = nuevo.slice(0, 1900) + '…';
  notionFetch_('pages/' + pagina.id, 'patch', {
    properties: { 'Latest Update': { rich_text: [{ text: { content: nuevo } }] } }
  });
}

// ------------------------------------------------------------
// CSM · Fin de día (update del tracker de Notion)
// ------------------------------------------------------------

/**
 * Agrupa las interacciones de HOY pendientes de Notion por dealer y compone
 * el comentario en inglés para el campo "Latest Update" del tracker.
 */
function componerFinDeDia_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.INTERACCIONES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var datos = hoja.getDataRange().getValues();
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var porDealer = {};

  for (var i = 1; i < datos.length; i++) {
    var fecha = datos[i][COL_INT.FECHA - 1];
    if (!(fecha instanceof Date)) continue;
    if (Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd') !== hoy) continue;
    if (datos[i][COL_INT.ESTADO_NOTION - 1] !== ESTADO_NOTION.PENDIENTE) continue;

    var dealer = datos[i][COL_INT.DEALER - 1];
    var g = porDealer[dealer] = porDealer[dealer] || { partes: [], ids: [] };
    g.ids.push(datos[i][COL_INT.ID - 1]);

    var trozo = datos[i][COL_INT.TIPO - 1] + ': ' + datos[i][COL_INT.RESUMEN - 1];
    var acuerdos = String(datos[i][COL_INT.ACUERDOS - 1] || '');
    if (acuerdos) {
      trozo += '. ' + acuerdos
        .replace(/Dealer debe:/g, 'Waiting on dealer:')
        .replace(/Yo debo:/g, 'Next on our side:')
        .replace(/\n/g, ' ');
    }
    g.partes.push(trozo);
  }

  return Object.keys(porDealer).sort().map(function (dealer) {
    return { dealer: dealer, comentario: porDealer[dealer].partes.join(' — '), ids: porDealer[dealer].ids };
  });
}

/**
 * Escribe los updates de fin de día en Notion (requiere NOTION_TOKEN) y marca
 * las interacciones como sincronizadas.
 * updates = [{ dealer, comentario, ids: [] }]
 */
function sincronizarFinDeDia(updates) {
  if (!notionToken_()) throw new Error('Falta NOTION_TOKEN en Config. Usa "Copiar todo" y pégalo en Notion.');
  var errores = [];
  (updates || []).forEach(function (u) {
    try {
      actualizarNotionDealer_(u.dealer, u.comentario);
      marcarInteraccionesSincronizadas_(u.ids);
    } catch (e) {
      errores.push(u.dealer + ': ' + e.message);
    }
  });
  return { errores: errores, data: getDashboardData() };
}

/** Marca las interacciones como sincronizadas sin escribir en Notion (flujo copiar/pegar). */
function marcarFinDeDiaSincronizado(ids) {
  marcarInteraccionesSincronizadas_(ids || []);
  return getDashboardData();
}

function marcarInteraccionesSincronizadas_(ids) {
  if (!ids || !ids.length) return;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.INTERACCIONES);
  var datos = hoja.getDataRange().getValues();
  var buscados = {};
  ids.forEach(function (id) { buscados[String(id)] = true; });
  for (var i = 1; i < datos.length; i++) {
    if (buscados[String(datos[i][COL_INT.ID - 1])]) {
      hoja.getRange(i + 1, COL_INT.ESTADO_NOTION).setValue(ESTADO_NOTION.SINCRONIZADO);
    }
  }
}

/**
 * Trigger diario (18:00): si hay updates pendientes, deja un borrador en Gmail
 * dirigido a ti con el texto compuesto, por si no abres el dashboard.
 */
function prepararFinDeDia() {
  var updates = componerFinDeDia_();
  if (!updates.length) return;
  var cuerpo = updates.map(function (u) {
    return u.dealer + '\n' + u.comentario;
  }).join('\n\n---\n\n');
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM');
  GmailApp.createDraft(Session.getActiveUser().getEmail(),
    'Notion end-of-day update – ' + fecha + ' (' + updates.length + ' dealers)',
    'Pending "Latest Update" entries for the Summer Enablement Tracker:\n\n' + cuerpo +
    '\n\nOpen the dashboard (🌙 Fin de día) to sync or copy them.');
}

// ------------------------------------------------------------
// CSM · Agenda del día (Google Calendar)
// ------------------------------------------------------------

/** Eventos de hoy con el dealer detectado por los emails de los invitados. */
function getAgendaHoy_() {
  try {
    var idCal = String(getConfig_('CALENDARIO_ID') || '').trim();
    var cal = idCal ? CalendarApp.getCalendarById(idCal) : CalendarApp.getDefaultCalendar();
    if (!cal) return [];
    var eventos = cal.getEventsForDay(new Date());

    var mapaEmailDealer = {};
    leerDealers_().forEach(function (d) {
      d.emails.forEach(function (e) { mapaEmailDealer[e] = d.nombre; });
    });

    return eventos.map(function (ev) {
      var invitados = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); });
      var dealer = '';
      invitados.forEach(function (e) { if (!dealer && mapaEmailDealer[e]) dealer = mapaEmailDealer[e]; });
      return {
        hora: ev.isAllDayEvent() ? 'Todo el día'
              : Utilities.formatDate(ev.getStartTime(), Session.getScriptTimeZone(), 'HH:mm'),
        titulo: ev.getTitle(),
        dealer: dealer,
        invitados: invitados.join(', ')
      };
    });
  } catch (e) {
    Logger.log('Agenda: ' + e.message);
    return [];
  }
}

// ------------------------------------------------------------
// CSM · Utilidades
// ------------------------------------------------------------

function buscarFilaPorId_(nombreHoja, colId, id) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) return null;
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][colId - 1]) === String(id)) {
      return { hoja: hoja, n: i + 1, valores: datos[i] };
    }
  }
  return null;
}
