# 🧭 CSM Hub — dashboard de llamadas, tickets y enablement

Dashboard privado publicado en claude.ai. Lee y escribe con **tus propios conectores** de Notion
y Slack: no hay tokens, ni servidores, ni Apps Script. Todo lo que sale hacia fuera (mensajes de
Slack, updates del tracker) pasa antes por tu revisión.

**URL:** https://claude.ai/code/artifact/8bd338f4-3550-474b-affe-b1f591a76471

## Qué hace

| Pestaña | Para qué |
|---|---|
| **Hoy** | Interacciones registradas hoy y todas las tareas abiertas (lo que te deben los dealers y lo que debes tú). |
| **Grabaciones** | Tus reuniones y llamadas de Claap de los últimos 14 días: abre el resumen de IA, marca los compromisos que siguen abiertos y los pasa al registro ya rellenados. |
| **Enablement** | Historial de llamadas de enablement y sus pendientes, con el estado del volcado a Notion. |
| **Tickets** | Product support por tipología y estado, cada uno con su canal de Slack. |
| **Mensajes** | Bandeja de revisión: los mensajes se redactan solos en inglés y esperan tu OK. |
| **Fin de día** | Compone el update del Summer Enablement Tracker y lo escribe en Notion. |

### Claap

La pestaña **Grabaciones** lista tus grabaciones (reuniones y llamadas de teléfono) filtradas por
tu email. Al pulsar **Ver resumen** trae el resumen de IA de Claap y extrae los *action items*
como una lista de casillas: desmarcas los que ya estén cerrados y **Registrar interacción** abre
el formulario con el dealer, el enlace a la grabación y los pendientes repartidos entre «el
dealer me tiene que pasar» y «yo tengo que».

El workspace y tu email de Claap se cambian en **Ajustes**.

### El flujo

1. Terminas una llamada → **Registrar interacción**: dealer, segmento, resumen y acuerdos
   (una cosa por línea en «el dealer me tiene que pasar» / «yo tengo que»).
2. Según el segmento se prepara solo lo que toca:
   - **Enablement** → tareas + follow-up en inglés al dealer, y queda pendiente para el fin de día.
   - **Ticket** → ticket + mensaje para ES-TICKETS (o el canal de su tipología).
   - **Website** → ticket + mensaje para dealer-website-creation etiquetando a Charushila.
   - **Compliance** → ticket + mensaje para compliance-ops.
3. Pasas por **Mensajes**, editas y envías. El `ts` del hilo se guarda para que las respuestas
   siguientes del ticket vayan dentro del mismo thread.
4. Al final del día, **Fin de día**: revisas el comentario por dealer y lo escribes en Notion.

### Cómo escribe en el tracker

El Summer Enablement Tracker tiene **una fila por dealer × capability**. Al sincronizar, para
cada dealer el dashboard busca **todas** sus filas y en cada una antepone el comentario:

```
14/08: comentario de hoy

13/08: comentario anterior
06/08: comentario más antiguo
...
```

El histórico nunca se toca — solo se añade encima, que es como está escrito el tracker hoy.

## Datos

Las cuatro bases viven en la página **🧭 CSM Hub — Manuel** de Notion y puedes editarlas a mano:

| Base | Contenido |
|---|---|
| 🗣 Interacciones | Cada llamada/reunión/mensaje con su segmento y acuerdos |
| 📌 Tareas | Compromisos derivados, de ellos y tuyos |
| 🎫 Tickets | Soporte por tipología, estado y canal |
| ✉️ Mensajes | Bandeja de mensajes en inglés: borrador → enviado |

## Ajustes

Botón **Ajustes** (se guarda en tu navegador):

- **ES-TICKETS**: hay que pegar su ID porque es un grupo privado y no aparece en la búsqueda de
  canales. En Slack: abre el grupo → clic en el nombre → el ID está abajo del todo.
- **dealer-website-creation** (`C0A7HDHAA9L`) y **compliance-ops** (`C06TEST9SFM`) ya vienen puestos.
- **Usuario a etiquetar para webs**: Charushila (`U0ACB8YKPNV`).
- **Firma** de los follow-ups por email.

Sin el ID de un canal el dashboard sigue funcionando: te deja copiar el mensaje para pegarlo tú.

## Iterar

El fuente es este `csm-hub.html`. Para cambiarlo: edítalo y pide a Claude que lo republique con
la misma URL. Cualquier cambio de estructura (nuevas pestañas, campos o automatismos) es una
edición de este único archivo.

## Histórico importado (3–17 de agosto de 2026)

Al montar el hub se cargaron desde Claap las **57 grabaciones** de las dos semanas anteriores
como interacciones (con su fecha, dealer y enlace a Claap), marcadas como *Sincronizado* para
que no vuelvan a volcarse al tracker.

De los resúmenes de las reuniones con dealer identificado salieron **17 tareas abiertas** y
**2 tickets**. Lo que estaba vivo a 17/08:

| Dealer | Pendiente | Quién |
|---|---|---|
| PRODIGIOUS CARS | Renovación vence el **20/08** con el precio sin cerrar (13.700 vs 13.200; el año pasado ~10-11k). Hablar con Jorge y que llame al cliente | Yo |
| AUTOMAN GARAGE | 5 documentos para activar la línea (suministro, póliza corregida, certificado, domicilio de administradores, email a Coches.net) | Dealer |
| CARPENTUM (Renting Credit) | Follow-up del 19/08 e integración con Carve + campos obligatorios del contrato | Yo |
| AUTOMOCION BARBANZA | Error de documentación X6 / Macan GTS que bloquea un pago de Openline | Yo (ticket) |
| AUTOMOVILES QUINTANA | Intereses no domiciliados este mes | Yo (ticket) |
| TU COCHE IDEAL | Comisión financiera como ingreso (Product) + demo del 01/09 | Yo |
| EDITION CARS | Email con la info de la web y reagendar la reunión | Yo |
| AUTOVETTURA 2012 | Enviar por email los cambios de la web | Dealer |
| ROMAN CABANILLAS | Modelo 100 cuando responda su gestor | Dealer |

## Pendiente / siguiente iteración

- Recordatorio programado a las 18:00 que prepare el fin de día.
- Volcar transcripciones de Claap para pre-rellenar las interacciones.
- Migración de tickets a Plaid (el campo *Origen* ya contempla `Plaid`) y conexión con el BO de
  INFINIT cuando haya API key.
