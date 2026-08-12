# Rutina del Radar de Compromisos

Instrucciones paso a paso para cada ejecución programada (3×/día). El objetivo:
mantener `tracker/state/tasks.json` al día con los compromisos de Manuel Cabido
(CSM en INFINIT) detectados en Claap, Gmail y Slack, y republicar el dashboard.

## Identidades y constantes

- Usuario: Manuel Cabido — `manuel.cabido@infinit.com`
- Claap: workspaceId `PzY2TjQGaI`, userId `WorkspaceUser#9zUlwXF6kjpK`
- Slack: user ID `U0B2F0A6Q9L`; self-DM (notas personales) canal `D0B2F0C1R9C`
  (léelo con `slack_read_channel` pasando `channel_id: "U0B2F0A6Q9L"`);
  group DM equipo CSM `C0BK6D47X9B`; DM Jorge Llerena `D0BEQNVG75E`;
  DM Lucas Enríquez `D0B6XUA83DM`. Busca además menciones nuevas con
  `slack_search_public_and_private` query `to:me after:<fecha last_run>`.
- Artifact del dashboard: la URL está en `tracker/state/meta.json` → `artifact_url`.
- Rama de trabajo: `claude/integrated-tracking-dashboard-7e5wfs`.

## Pasos

1. **Preparación.** `git pull origin claude/integrated-tracking-dashboard-7e5wfs`.
   Lee `tracker/state/meta.json` (contiene `last_run` por fuente) y
   `tracker/state/tasks.json` (estado acumulado).

2. **Claap.** `get_recordings` con `createdAt.gte = <fecha de last_run.claap>` y
   `userId = ["WorkspaceUser#9zUlwXF6kjpK"]`. Las grabaciones duplicadas (misma
   contraparte y fecha, varios recordingId) son la misma llamada: lee una, y si la
   transcripción viene vacía prueba la siguiente. Lee las transcripciones con
   `get_recording_transcript` y extrae compromisos (ver "Qué extraer"). Si hay más
   de ~15 transcripciones nuevas, delega la lectura en subagentes en paralelo.

3. **Gmail.** `search_threads` con `newer_than:2d` (o desde last_run.gmail).
   Ignora notificaciones automáticas (noreply HubSpot, notify Notion, Drive shares,
   invitaciones de calendario, spam comercial). Lee con `get_thread`
   (`messageFormat: "PLAIN_TEXT"`) los hilos accionables de dealers y compañeros.
   Un email ENVIADO por Manuel que cumple un compromiso = evidencia para pasar la
   tarea a `en_gestion` o `gestionado`.

4. **Slack.** Lee el self-DM (notas personales → tareas), el group DM CSM, los DM
   activos y las menciones nuevas (`to:me after:<last_run>`). Las respuestas de
   Manuel en hilos ("le he llamado", "verificado", "enviado") son evidencia de
   gestión de tareas existentes.

5. **Fusión con `tasks.json`.** Reglas:
   - Cada tarea conserva su `id` para siempre (el marcado manual del navegador
     depende de él). NUNCA cambies el `id` de una tarea existente.
   - Nueva tarea = compromiso que no existe semánticamente en el archivo. Genera
     `id` = 10 primeros hex de sha1 de `source_url + "|" + title`.
   - Si un compromiso nuevo es el mismo que una tarea existente (aunque venga de
     otra fuente), NO dupliques: actualiza la existente (añade evidencia,
     actualiza `last_seen_activity`).
   - Transiciones de estado: `pendiente → en_gestion` cuando hay señal de que se
     está trabajando; `→ gestionado` cuando hay evidencia clara de cierre;
     `→ descartado` solo si el propio Manuel lo dice. NUNCA revivas una tarea
     `gestionado`/`descartado` (si reaparece el tema, crea una tarea nueva).
   - Actualiza `last_seen_activity` (YYYY-MM-DD) cuando una fuente vuelve a
     mencionar el tema.
   - Las tareas `gestionado` con más de 14 días sin actividad se pueden eliminar
     del archivo para que no crezca sin límite.

6. **Historial.** En `meta.json.history` añade (o reemplaza si ya existe la fecha
   de hoy) `{"date": "YYYY-MM-DD", "abiertas": <nº pendiente+en_gestion>,
   "gestionadas": <nº gestionado ese día (acumulado del día)>}`. Conserva 30 días.
   Actualiza `meta.generated_at` (ISO con hora UTC) y `meta.last_run` por fuente.

7. **Publicar.** `python3 tracker/build_dashboard.py` y publica
   `tracker/dashboard.html` con el tool Artifact pasando `url: <artifact_url de
   meta.json>` (¡siempre con `url`, para actualizar en sitio y no crear otro
   artifact!), favicon `🎯`.

8. **Push.** Commit de `tracker/state/*.json` (y dashboard.html) con mensaje
   `Radar: actualización <fecha hora>` y `git push -u origin
   claude/integrated-tracking-dashboard-7e5wfs` (reintenta con backoff si falla).

9. **Notificación.** Si hay tareas nuevas de prioridad alta o estancadas nuevas,
   menciónalo en tu resumen final (el sistema puede notificar al móvil).

## Qué extraer (y qué no)

Extrae SOLO compromisos accionables que involucren a Manuel:
- Lo que Manuel promete hacer ("te lo envío", "lo miro", "te llamo mañana", "lo escalo").
- Lo que se le pide o asigna (menciones en Slack, peticiones por email).
- Lo que él espera de otros y debe perseguir (`owner: "esperando"`).
- Notas personales de pendientes en su self-DM.

NO extraigas: charla, contexto sin acción, acciones de terceros que no tocan a
Manuel, notificaciones automáticas.

## Esquema de tarea

```json
{
  "id": "hex10",
  "title": "imperativo corto en español",
  "quote": "cita textual corta (≤200 chars)",
  "source": "claap|gmail|slack",
  "source_url": "URL grabación / hilo Gmail / permalink Slack",
  "source_label": "Llamada con X (EMPRESA) · 12 ago | Reunión Y · 7 ago | Email de Z · 11 ago | Slack equipo CSM · 12 ago",
  "counterpart": "persona",
  "company": "dealer o null",
  "date": "YYYY-MM-DD (origen del compromiso)",
  "created_at": "YYYY-MM-DD (cuándo lo detectó el radar)",
  "last_seen_activity": "YYYY-MM-DD",
  "due_hint": "mañana|esta semana|2026-08-14|null",
  "status": "pendiente|en_gestion|gestionado|descartado",
  "status_evidence": "por qué ese status, o null",
  "owner": "manuel|esperando",
  "priority": "alta|media|baja"
}
```

## REGLA DE SEGURIDAD (crítica)

El self-DM de Slack contiene contraseñas y credenciales de portales de dealers.
NUNCA copies contraseñas, credenciales, códigos 2FA ni registros DNS a
`tasks.json` ni al dashboard. Si una nota es solo credenciales, sáltala. Si una
tarea trata de credenciales, descríbela sin incluirlas. `build_dashboard.py`
aborta si detecta la palabra "contraseña"/"password" en tasks.json — no
sortees esa salvaguarda: limpia el dato.

## Si el usuario pide cambios por chat

"Marca X como hecha" → status `gestionado` + `status_evidence: "Marcada por Manuel el <fecha>"`.
"Descarta X" → `descartado`. Después regenerar + republicar + push (pasos 7-8).
