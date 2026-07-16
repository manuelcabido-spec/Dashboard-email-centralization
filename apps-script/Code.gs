/**
 * ============================================================
 *  DEALER DOCUMENT TRACKER
 *  Centraliza correos de dealers, clasifica documentos,
 *  guarda adjuntos en Drive y actualiza Google Sheets.
 *  Dashboard web incluido (ver Dashboard.html).
 * ============================================================
 *
 *  PRIMEROS PASOS (ver README.md del repositorio):
 *   1. Ejecuta setup() una vez y autoriza los permisos.
 *   2. Ejecuta instalarTriggers() para la automatización.
 *   3. Implementar > Nueva implementación > Aplicación web
 *      para obtener la URL del dashboard.
 */

// ------------------------------------------------------------
// CONFIGURACIÓN GENERAL
// ------------------------------------------------------------

var HOJAS = {
  DEALERS: 'Dealers',
  SOLICITUDES: 'Solicitudes',
  CORREOS: 'Correos',
  CONFIG: 'Config'
};

var ESTADOS = {
  PENDIENTE: 'Pendiente',                 // aún no se ha pedido
  SOLICITADO: 'Solicitado',               // ya se envió la petición, esperando respuesta
  RECIBIDO: 'Recibido - Por revisar',     // llegó un documento, falta validarlo
  VERIFICADO: 'Verificado',               // documento correcto, cerrado
  INCORRECTO: 'Incorrecto - Reenviar'     // enviaron algo mal, hay que pedirlo de nuevo
};

var ESTADOS_CORREO = {
  NUEVO: 'Nuevo',
  RESPONDER: 'Responder',
  GESTIONADO: 'Gestionado'
};

var ETIQUETA_PROCESADO = 'DealerTracker/Procesado';
var ETIQUETA_REVISAR = 'DealerTracker/Revisar';

// Columnas (1-indexadas) de la hoja Solicitudes
var COL_SOL = {
  ID: 1, DEALER: 2, DOCUMENTO: 3, ESTADO: 4, FECHA_SOLICITUD: 5,
  ULTIMO_CONTACTO: 6, FECHA_RECIBIDO: 7, ARCHIVO: 8,
  DIAS_SIN_RESPUESTA: 9, SEGUIMIENTO: 10, NOTAS: 11
};

// Columnas de la hoja Correos
var COL_COR = {
  FECHA: 1, DEALER: 2, REMITENTE: 3, ASUNTO: 4, DOCUMENTO: 5,
  ADJUNTOS: 6, ESTADO: 7, LINK: 8, THREAD_ID: 9, MESSAGE_ID: 10
};

// ------------------------------------------------------------
// SETUP INICIAL
// ------------------------------------------------------------

/** Crea todas las hojas, formatos, etiquetas de Gmail y carpeta de Drive. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre el script desde Extensiones > Apps Script dentro de un Google Sheet.');

  crearHojaConfig_(ss);
  crearHojaDealers_(ss);
  crearHojaSolicitudes_(ss);
  crearHojaCorreos_(ss);

  // Etiquetas de Gmail
  obtenerOCrearEtiqueta_(ETIQUETA_PROCESADO);
  obtenerOCrearEtiqueta_(ETIQUETA_REVISAR);

  // Carpeta raíz en Drive para los documentos
  var carpeta = obtenerOCrearCarpetaRaiz_();
  setConfig_('CARPETA_DRIVE_ID', carpeta.getId());

  var hojaDefecto = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hojaDefecto && ss.getSheets().length > 4) ss.deleteSheet(hojaDefecto);

  SpreadsheetApp.getUi().alert(
    'Setup completado ✔\n\n' +
    '1) Rellena la hoja "Dealers" con tus dealers y sus emails.\n' +
    '2) Revisa los tipos de documento en la hoja "Config".\n' +
    '3) Ejecuta generarSolicitudes() para crear la matriz dealer x documento.\n' +
    '4) Ejecuta instalarTriggers() para activar la automatización.'
  );
}

function crearHojaConfig_(ss) {
  var hoja = ss.getSheetByName(HOJAS.CONFIG) || ss.insertSheet(HOJAS.CONFIG);
  hoja.clear();
  hoja.getRange('A1:B1').setValues([['Parámetro', 'Valor']]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.getRange('A2:B6').setValues([
    ['DIAS_PARA_SEGUIMIENTO', 5],
    ['CARPETA_DRIVE_ID', ''],
    ['NOMBRE_CARPETA_DRIVE', 'Dealer Docs'],
    ['ASUNTO_SOLICITUD', 'Solicitud de documentación - {{DOCUMENTOS}}'],
    ['FIRMA', 'Un saludo,\nManuel']
  ]);

  hoja.getRange('D1:E1').setValues([['Tipo de documento', 'Palabras clave (separadas por coma)']])
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.getRange('D2:E5').setValues([
    ['Certificado de seguro', 'certificado, certificate, coi, insurance certificate, certificado de seguro'],
    ['Contrato de seguro', 'contrato, contract, poliza, póliza, policy'],
    ['W9 / Datos fiscales', 'w9, w-9, tax, fiscal'],
    ['Otros documentos', 'documento, document, adjunto']
  ]);
  hoja.setColumnWidths(1, 5, 220);
  hoja.getRange('E:E').setWrap(true);
}

function crearHojaDealers_(ss) {
  var hoja = ss.getSheetByName(HOJAS.DEALERS) || ss.insertSheet(HOJAS.DEALERS);
  hoja.clear();
  var cab = ['Dealer', 'Emails (separados por coma)', 'Contacto', 'Teléfono', 'Notas'];
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.setFrozenRows(1);
  hoja.setColumnWidths(1, 5, 220);
  hoja.getRange('A2:E2').setValues([['Dealer Ejemplo S.L.', 'contacto@dealerejemplo.com', 'Juan Pérez', '+34 600 000 000', 'Fila de ejemplo: bórrala']]);
}

function crearHojaSolicitudes_(ss) {
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES) || ss.insertSheet(HOJAS.SOLICITUDES);
  hoja.clear();
  var cab = ['ID', 'Dealer', 'Documento', 'Estado', 'Fecha solicitud', 'Último contacto',
             'Fecha recibido', 'Archivo (Drive)', 'Días sin respuesta', 'Seguimiento', 'Notas'];
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.setFrozenRows(1);
  hoja.setColumnWidth(COL_SOL.DEALER, 200);
  hoja.setColumnWidth(COL_SOL.DOCUMENTO, 200);
  hoja.setColumnWidth(COL_SOL.ARCHIVO, 260);
  hoja.setColumnWidth(COL_SOL.NOTAS, 260);

  // Validación de estado + formato condicional por color
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
  var hoja = ss.getSheetByName(HOJAS.CORREOS) || ss.insertSheet(HOJAS.CORREOS);
  hoja.clear();
  var cab = ['Fecha', 'Dealer', 'Remitente', 'Asunto', 'Documento detectado',
             'Adjuntos', 'Estado', 'Link Gmail', 'ThreadId', 'MessageId'];
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
  hoja.setFrozenRows(1);
  hoja.setColumnWidth(COL_COR.ASUNTO, 300);
  hoja.setColumnWidth(COL_COR.ADJUNTOS, 260);
  hoja.setColumnWidth(COL_COR.LINK, 220);
}

/** Genera la matriz dealer x tipo de documento en "Solicitudes" (sin duplicar las que ya existen). */
function generarSolicitudes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dealers = leerDealers_();
  var tiposDoc = leerTiposDocumento_().map(function (t) { return t.tipo; })
    .filter(function (t) { return t !== 'Otros documentos'; });

  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  var existentes = {};
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    existentes[datos[i][COL_SOL.DEALER - 1] + '||' + datos[i][COL_SOL.DOCUMENTO - 1]] = true;
  }

  var nuevas = [];
  dealers.forEach(function (d) {
    tiposDoc.forEach(function (doc) {
      if (!existentes[d.nombre + '||' + doc]) {
        nuevas.push([siguienteId_(hoja, nuevas.length), d.nombre, doc, ESTADOS.PENDIENTE, '', '', '', '', '', '', '']);
      }
    });
  });
  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);
  }
  Logger.log('Solicitudes creadas: ' + nuevas.length);
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

    // Correos recibidos en los últimos 7 días que aún no hemos procesado
    // (las etiquetas anidadas se buscan con guiones: DealerTracker/Procesado -> dealertracker-procesado)
    var consulta = 'in:inbox newer_than:7d -label:' + ETIQUETA_PROCESADO.toLowerCase().replace(/\//g, '-');
    var hilos = GmailApp.search(consulta, 0, 50);

    var idsRegistrados = mensajesYaRegistrados_();

    hilos.forEach(function (hilo) {
      var esDeDealer = false;
      hilo.getMessages().forEach(function (msg) {
        var remitente = extraerEmail_(msg.getFrom());
        var dealer = mapaEmailDealer[remitente];
        if (!dealer) return;                       // no es un dealer conocido
        if (idsRegistrados[msg.getId()]) return;   // ya registrado
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

    actualizarSeguimientos();
  } finally {
    lock.releaseLock();
  }
}

/** Recalcula "Días sin respuesta" y marca qué solicitudes necesitan seguimiento. */
function actualizarSeguimientos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return;

  var diasLimite = Number(getConfig_('DIAS_PARA_SEGUIMIENTO')) || 5;
  var hoy = new Date();
  var salida = []; // [días, seguimiento] por fila, escrito en un solo lote

  for (var i = 1; i < datos.length; i++) {
    var estado = datos[i][COL_SOL.ESTADO - 1];
    var referencia = datos[i][COL_SOL.ULTIMO_CONTACTO - 1] || datos[i][COL_SOL.FECHA_SOLICITUD - 1];
    var dias = '';
    var seguimiento = '';

    if ((estado === ESTADOS.SOLICITADO || estado === ESTADOS.INCORRECTO) && referencia instanceof Date) {
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

function actualizarSolicitud_(dealer, docDetectado, msg, archivos) {
  if (!docDetectado || docDetectado === 'Otros documentos') return;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();

  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_SOL.DEALER - 1] === dealer && datos[i][COL_SOL.DOCUMENTO - 1] === docDetectado) {
      var estadoActual = datos[i][COL_SOL.ESTADO - 1];
      if (estadoActual === ESTADOS.VERIFICADO) return; // no reabrir lo ya cerrado
      hoja.getRange(i + 1, COL_SOL.ESTADO).setValue(ESTADOS.RECIBIDO);
      hoja.getRange(i + 1, COL_SOL.FECHA_RECIBIDO).setValue(msg.getDate());
      hoja.getRange(i + 1, COL_SOL.ULTIMO_CONTACTO).setValue(msg.getDate());
      if (archivos.length) {
        hoja.getRange(i + 1, COL_SOL.ARCHIVO).setValue(archivos.map(function (a) { return a.url; }).join('\n'));
      }
      return;
    }
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

  var kpis = { total: solicitudes.length, pendientes: 0, solicitadas: 0, recibidas: 0, verificadas: 0, incorrectas: 0, seguimientos: 0 };
  solicitudes.forEach(function (s) {
    if (s['Estado'] === ESTADOS.PENDIENTE) kpis.pendientes++;
    if (s['Estado'] === ESTADOS.SOLICITADO) kpis.solicitadas++;
    if (s['Estado'] === ESTADOS.RECIBIDO) kpis.recibidas++;
    if (s['Estado'] === ESTADOS.VERIFICADO) kpis.verificadas++;
    if (s['Estado'] === ESTADOS.INCORRECTO) kpis.incorrectas++;
    if (s['Seguimiento'] === 'SÍ') kpis.seguimientos++;
  });

  return {
    kpis: kpis,
    solicitudes: solicitudes,
    correos: correos.slice(0, 200),
    urlSheet: ss.getUrl(),
    estados: ESTADOS,
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

/** Crea borradores de solicitud inicial para todos los documentos en estado "Pendiente" (agrupados por dealer). */
function crearSolicitudesIniciales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  var datos = hoja.getDataRange().getValues();
  var porDealer = {};

  for (var i = 1; i < datos.length; i++) {
    if (datos[i][COL_SOL.ESTADO - 1] === ESTADOS.PENDIENTE) {
      var dealer = datos[i][COL_SOL.DEALER - 1];
      (porDealer[dealer] = porDealer[dealer] || []).push({ fila: i + 1, doc: datos[i][COL_SOL.DOCUMENTO - 1] });
    }
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

/** Instala la automatización: escaneo cada 10 minutos + recálculo de seguimientos cada mañana. */
function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['procesarCorreos', 'actualizarSeguimientos'].indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('actualizarSeguimientos').timeBased().atHour(7).everyDays(1).create();
  Logger.log('Triggers instalados: escaneo cada 10 min y seguimientos diarios a las 7:00.');
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
  var datos = hoja.getRange('D2:E30').getValues();
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

function siguienteId_(hoja, offset) {
  return 'S-' + String(hoja.getLastRow() + offset).padStart(5, '0');
}

function hojaAObjetos_(hoja) {
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
  var datos = hoja.getRange('A2:B30').getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === clave) return datos[i][1];
  }
  return '';
}

function setConfig_(clave, valor) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.CONFIG);
  var datos = hoja.getRange('A2:B30').getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === clave) {
      hoja.getRange(i + 2, 2).setValue(valor);
      return;
    }
  }
  hoja.appendRow([clave, valor]);
}
