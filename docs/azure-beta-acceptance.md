# Aceptación manual de la beta de Azure

El CD comprueba HTTPS, readiness, shell React, worklet, fronteras 404 y el smoke
Postman (salud, CSRF y límites de autenticación). **No** prueba login real con
Google, IA, voz ni aislamiento entre personas. Este checklist cubre ese hueco y
lo ejecuta el propietario en
<https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io>.

Las pruebas automatizadas de la API ya cubren propiedad y aislamiento en CI
(`AssessmentApiTests`, `GraphApiTests`, `HistoryApiTests`, `EditorialApiTests`,
`VoiceApiTests`); aquí se confirma que la configuración real (cliente OAuth,
PostgreSQL, Vertex AI e identidades) las respeta.

## Reglas de evidencia

- Capturar: hora UTC, revisión activa, ruta/acción, código HTTP y `traceId` de
  los errores. Basta con una tabla y capturas de pantalla recortadas.
- **No capturar** correos, nombres, fotos de perfil, cookies, encabezados
  `Authorization`, tokens, ni el contenido de conversaciones personales. Tachar
  datos personales antes de compartir una captura. No grabar audio.
- Usar perfiles de navegador separados (o una ventana privada por cuenta).
- Si un paso falla, detenerse, anotar `traceId` y no repetir escrituras.

## 0. Preparación

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 0.1 | `az containerapp show -g rg-aiteacher-beta-8136 -n ca-aiteacher-beta-8136 --subscription 1350d930-7008-4b43-923d-6a7cd66701bc --query "{rev:properties.latestReadyRevisionName,image:properties.template.containers[0].image}"` | Revisión `cd-…` Healthy | Nombre de revisión y digest al inicio |
| 0.2 | Confirmar que no hay CD en curso: `gh run list --repo GDriem/AITeacher --workflow cd-beta.yml -L 3` | Ninguno `in_progress` | Salida |
| 0.3 | Cuenta **A**: Google del autor configurado (`Authentication__AuthorGoogleSubjects__0`). Cuenta **B**: otra cuenta Google sin rol de autor | — | Solo «A=autor, B=alumno» |

## 1. Login real con Google

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 1.1 | Sin sesión, abrir la URL | Pantalla de acceso; `GET /api/auth/status` con `authenticated:false` | Captura y código 200 |
| 1.2 | Iniciar sesión con Google como A | Vuelve a la app autenticado; `GET /api/auth/me` 200 | Captura con datos tachados |
| 1.3 | Recargar la página | La sesión persiste | — |
| 1.4 | Cerrar sesión | `GET /api/auth/status` vuelve a `authenticated:false`; rutas protegidas responden 401 | Códigos de estado |
| 1.5 | Volver a iniciar sesión como A | Correcto | — |

## 2. Tutor IA

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 2.1 | Autenticado, `GET /api/tutor/availability` (pestaña Network) | Disponible | Cuerpo sin datos personales |
| 2.2 | Elegir un tema y abrir una conversación nueva | Se crea la conversación | ID de conversación |
| 2.3 | Enviar 2–3 turnos con preguntas del tema | Respuestas coherentes, sin error, latencia razonable | Hora y duración aproximada |
| 2.4 | Abrir el historial | La conversación aparece en `/api/history/conversations` | Captura |

## 3. Evaluación

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 3.1 | Iniciar una evaluación de un tema | `POST /api/assessments/attempts` 201/200 | ID del intento |
| 3.2 | Responder y enviar | `submit` correcto; resultado visible | Puntuación (sin respuestas personales) |
| 3.3 | Abrir la revisión del intento | Retroalimentación sin exponer claves de otras preguntas | Captura |

## 4. Voz (Gemini Live)

Estado real al 22 de octubre de 2026: `AI__Voice__Enabled=false` en la app beta.

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 4.1 | Con voz deshabilitada, abrir el tutor | El control de voz no se ofrece o se explica como no disponible; el navegador **no** pide micrófono | Captura |
| 4.2 | Probar voz real | **Bloqueado**: requiere habilitar voz en Azure, un cambio de configuración con revisión nueva que necesita aprobación expresa | — |

Si se aprueba habilitarla: conceder micrófono, hablar 10–20 s, comprobar respuesta
de audio y transcripción, detener la sesión, abrir una segunda pestaña y confirmar
que solo se permite una sesión simultánea por alumno, y revocar el permiso del
micrófono al terminar. Evidencia: horas, estados y capturas; nunca el audio.

## 5. Aislamiento entre dos cuentas

Con A autenticada en un perfil y B en otro:

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 5.1 | B abre su historial | No ve la conversación de A | Captura |
| 5.2 | B abre en la barra de direcciones `/api/history/conversations/{ID de A}` | 404 (o 403), nunca el contenido | Código y `traceId` |
| 5.3 | B abre `/api/tutor/conversations/{ID de A}` | 404/403 | Código |
| 5.4 | B abre `/api/assessments/attempts/{ID de intento de A}` | 404/403 | Código |
| 5.5 | B abre `/api/units` | Solo unidades publicadas; sin controles de autoría en la UI | Captura |
| 5.6 | A cierra sesión y B recarga | B sigue con su propia identidad; no hay mezcla | — |

## 6. Flujo editorial (opcional, escribe en la beta)

Usar un nombre inequívoco, por ejemplo `PRUEBA ACEPTACIÓN AAAA-MM-DD`, y retirarla al final.

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 6.1 | A crea un borrador en un tema | `POST /api/units` correcto | `unitId` |
| 6.2 | B lista unidades | El borrador **no** aparece; `GET /api/units/{unitId}` 404 | Código |
| 6.3 | A publica la revisión | B ya la ve | Captura |
| 6.4 | A retira la publicación | B vuelve a recibir 404 | Código |

## 7. Cierre

- Cerrar sesión en ambas cuentas.
- Repetir 0.1: la revisión no debe haber cambiado durante la prueba; si cambió,
  anotar qué CD corrió.
- Registrar resultado global (aprobado / fallos con `traceId`) en la PR o issue
  de seguimiento, sin datos personales.

## Automatización posible sin credenciales reales

Propuesta, no implementada:

1. **Smoke de UI anónimo con Playwright contra la beta** (`BETA_URL`): página de
   acceso renderizada, botón de Google con el client ID público de
   `/api/auth/status`, `axe` sin violaciones, 401 en rutas protegidas y ausencia
   de solicitud de micrófono sin sesión. Reutiliza `frontend/e2e` y no requiere
   cuentas. Podría correr en el CD después del smoke Postman.
2. **Aislamiento** sin cuentas reales solo es posible con identidades simuladas:
   ya cubierto por las pruebas de API en CI. Automatizarlo contra la beta
   exigiría cuentas de prueba con secretos de Google en GitHub, contrario a la
   regla de no guardar credenciales estáticas; no se recomienda.
3. Login Google, IA real y voz quedan manuales.
