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

var HOJAS = {
  DEALERS: 'Dealers',
  CAMPANAS: 'Campañas',
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
  DIAS_SIN_RESPUESTA: 10, SEGUIMIENTO: 11, NOTAS: 12
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
  migrarEsquema_(ss);

  // Etiquetas de Gmail
  obtenerOCrearEtiqueta_(ETIQUETA_PROCESADO);
  obtenerOCrearEtiqueta_(ETIQUETA_REVISAR);

  // Carpeta raíz en Drive para los documentos
  if (!getConfig_('CARPETA_DRIVE_ID')) {
    setConfig_('CARPETA_DRIVE_ID', obtenerOCrearCarpetaRaiz_().getId());
  }

  var hojaDefecto = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hojaDefecto && ss.getSheets().length > 5) ss.deleteSheet(hojaDefecto);

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
                   'Fecha recibido', 'Archivo (Drive)', 'Días sin respuesta', 'Seguimiento', 'Notas']);
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

/** Migración para hojas creadas con la versión anterior (sin campañas). */
function migrarEsquema_(ss) {
  var hoja = ss.getSheetByName(HOJAS.SOLICITUDES);
  if (!hoja || hoja.getLastColumn() < 1) return;
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  if (cab.indexOf('Campaña') !== -1) return; // ya migrado

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
            dealer, documento, nombre, ESTADOS.PENDIENTE, '', '', '', '', '', '', ''];
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

  return {
    solicitudes: solicitudes,
    correos: correos.slice(0, 200),
    campanas: campanas,
    tiposDocumento: leerTiposDocumento_().map(function (t) { return t.tipo; }),
    dealers: leerDealers_().map(function (d) { return d.nombre; }),
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
