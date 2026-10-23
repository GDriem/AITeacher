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
| 1.2 | Pulsar «Continuar con Google» e iniciar sesión como A | Vuelve a la app autenticado; `GET /api/auth/me` 200 | Captura con datos tachados |
| 1.3 | Recargar la página | La sesión persiste | — |
| 1.4 | Pulsar «Cerrar sesión» en la cabecera | `GET /api/auth/status` vuelve a `authenticated:false`; rutas protegidas responden 401 | Códigos de estado |
| 1.5 | Volver a iniciar sesión como A | Correcto | — |

## 2. Tutor IA

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 2.1 | Autenticado, `GET /api/tutor/availability` (pestaña Network) | Disponible | Cuerpo sin datos personales |
| 2.2 | Inicio → «Explorar el catálogo» (o Catálogo en la navegación) → tema → unidad → «Preguntar al tutor…» → «Nueva conversación» | Se crea la conversación | ID de conversación |
| 2.3 | Enviar 2–3 turnos con preguntas del tema | Respuestas coherentes, sin error, latencia razonable | Hora y duración aproximada |
| 2.4 | Navegación → Historial → «Conversaciones del tutor» → «Abrir conversación del tutor» | Se abre la conversación actual (`/api/tutor/conversations`); las importadas se consultan por separado en «Conversaciones importadas» (`/api/history/conversations`) | Captura |

## 3. Evaluación

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 3.1 | Catálogo → tema → una **unidad con práctica y evaluación** → pestaña «Evaluar» → «Iniciar …» (no elegir un material marcado «Lectura»); si no hay evaluaciones publicadas, A prepara una con la receta de abajo | `POST /api/assessments/attempts` 201/200 | ID del intento |
| 3.2 | Responder cada pregunta, usar «Siguiente» y pulsar «Entregar respuestas» → «Sí, entregar» | `submit` correcto; resultado visible | Puntuación (sin respuestas personales) |
| 3.3 | Navegación → Historial → «Tus evaluaciones» → «Consultar evaluación» | Retroalimentación sin exponer claves de otras preguntas | Captura |

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
| 5.1 | B abre Historial y revisa «Conversaciones del tutor», «Tus evaluaciones» y «Conversaciones importadas» | No ve la conversación de A | Captura |
| 5.2 | B abre en la barra de direcciones `/api/history/conversations/{ID de A}` | 404 (o 403), nunca el contenido | Código y `traceId` |
| 5.3 | B abre `/api/tutor/conversations/{ID de A}` | 404/403 | Código |
| 5.4 | B abre `/api/assessments/attempts/{ID de intento de A}` | 404/403 | Código |
| 5.5 | B abre Catálogo, entra en un tema y comprueba también `/api/units` | Solo unidades publicadas; sin controles de autoría en la UI | Captura |
| 5.6 | A cierra sesión y B recarga | B sigue con su propia identidad; no hay mezcla | — |

## 6. Flujo editorial (opcional, escribe en la beta)

Usar un nombre inequívoco, por ejemplo `PRUEBA ACEPTACIÓN AAAA-MM-DD`, y retirarla al final.

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| 6.1 | A abre Autoría → Unidades → «Crear unidad», elige «Tema de la nueva unidad», completa el material según la receta de abajo y pulsa «Guardar borrador» | `POST /api/units` correcto | `unitId` |
| 6.2 | B lista unidades | El borrador **no** aparece; `GET /api/units/{unitId}` 404 | Código |
| 6.3 | A pulsa «Publicar esta revisión»; B recarga el Catálogo y abre su tema | B ya la ve | Captura |
| 6.4 | A pulsa «Retirar publicación» → «Confirmar retiro»; B recarga la unidad | B vuelve a recibir 404 | Código |

Para que 6.1 se pueda ejecutar sin conocer el editor, usar esta receta mínima:

1. Elegir un tema disponible y mantener «Unidad con objetivos, práctica y
   evaluación» como tipo. Escribir el título `PRUEBA ACEPTACIÓN AAAA-MM-DD`.
2. «Añadir concepto»: nombre `Comparación`. «Añadir objetivo»: descripción
   `Explicar una comparación` y marcar el concepto `Comparación`.
3. «Añadir lectura»: título, texto y fuente sintéticos; marcar el objetivo
   `Explicar una comparación` en «Objetivos cubiertos» de la lectura.
4. «Añadir ejercicio»: consigna sintética y marcar el mismo objetivo.
5. «Añadir evaluación editorial»: consigna, criterios privados sintéticos y
   marcar el mismo objetivo. No añadir prerrequisitos. «Guardar borrador».
6. Tras comprobar 6.2, «Publicar esta revisión». El catálogo de B debe mostrar
   la unidad dentro del tema elegido, después de recargar.

Para probar la sección 3 cuando el tema solo tiene lecturas, después de 6.3 y
antes de retirar la publicación, A crea una evaluación entregable en esa unidad:

1. En Autoría → Unidades, abrir la unidad de prueba publicada. En el banco de
   preguntas escribir un enunciado sintético, marcar el objetivo evaluado,
   completar las dos opciones y marcar «Respuesta correcta» en una de ellas.
   «Guardar pregunta».
2. En la definición, escribir «Título de evaluación», marcar la pregunta y
   «Publicar evaluación». Los valores predeterminados sirven para esta prueba.
3. B abre la unidad en Catálogo → tema → unidad → Evaluar e inicia la evaluación.
   Si elige preguntas abiertas con rúbrica, A debe ir a Autoría → «Corregir
   entregas», «Consultar entrega», puntuar todos los criterios y «Confirmar
   corrección final» antes de que B pueda ver la nota. La política «never»
   confirma la entrega sin mostrar nota ni aciertos.
4. Al terminar evaluación y aislamiento, completar 6.4 para retirar el material.

## Revisión de ejecutabilidad de la fase 2 (PR 6)

Las secciones 1, 2, 3, 5 y 6 tienen rutas y nombres de controles para ejecutarse
sin instrucciones adicionales. Se corrigió 2.4: el historial importado no es el
historial del tutor actual. La sección 3 requiere una evaluación publicada;
las lecturas migradas no incluyen evaluaciones. La receta anterior permite a A
preparar el material sin depender de datos previos.

La automatización local usa .NET y PostgreSQL con Google e IA simulados. Verifica
el recorrido con dos alumnos, aislamiento, recarga, Atrás, teclado y axe en los
cuatro tamaños. **No sustituye la ejecución del propietario en Azure**: quedan
sin nueva evidencia real 1.3–1.5, 2.2/2.4, la sección 3, las rutas individuales
5.2–5.6 y la sección 6. El ensayo del 22 de octubre conserva el alcance indicado
más abajo. Esta revisión no habilita voz ni modifica Azure.

## 7. Cierre

- Cerrar sesión en ambas cuentas.
- Repetir 0.1: la revisión no debe haber cambiado durante la prueba; si cambió,
  anotar qué CD corrió.
- Registrar resultado global (aprobado / fallos con `traceId`) en la PR o issue
  de seguimiento, sin datos personales.

## Resultado: ensayo de dos cuentas del 22 de octubre de 2026

Ejecutado por el propietario a partir de las 04:51 UTC sobre la
revisión `ca-aiteacher-beta-8136--cd-39721819854-1` (imagen `sha256:ba304834…`).
La revisión no cambió durante la prueba y no corría ningún CD. Dos cuentas Google
distintas: A, autor, y B, alumno. No se registran correos ni contenido.

| # | Resultado | Evidencia |
|---|---|---|
| 0.1–0.2 | Revisión Healthy con 100 % del tráfico; sin CD en curso | Salida de `az` y `gh` |
| 1.1 | Sin sesión, `authenticated:false` y 401 en `/api/auth/me`, `/api/history/conversations`, `/api/units` y `/api/tutor/availability` | Códigos HTTP |
| 1.2 | Login con Google real en ambas cuentas; `GET /api/auth/me` 200 | `studentId` distintos con prefijo `google-` |
| 0.3 | El `sub` configurado como autor se resuelve: A `canAuthor:true` y B `canAuthor:false` | Respuestas de `/api/auth/me` |
| 2.3 | Dos turnos del tutor contra Vertex `gemini-3.5-flash-lite`, 200 en 2,4 s y 1,1 s | Logs de consola, 04:52:27 y 04:53:07 |
| 5.x | B solicitó un recurso de conversación de A: **404** sin contenido | `traceId 00-fac4d5ebd16c27db74b36ab129f7e968-cdff92ec75fb404a-02` |

Resultado global: **aprobado** para login Google real, resolución del autor por
`sub` y aislamiento entre cuentas en la configuración real.

Alcance y límites, sin ocultarlos:

- La evidencia de acceso cruzado es una ruta observada por el propietario. Las
  demás (5.2–5.4) comparten la misma comprobación de propiedad, cubierta en CI por
  `HistoryApiTests`, `AssessmentApiTests` y las pruebas del tutor; no se repitieron
  una a una contra la beta.
- No se ejecutó el paso 3 (evaluación) ni la sección 6 (editorial); la voz sigue
  deshabilitada (4.2).
- Application Insights no registra solicitudes (`requests` vacío), así que los
  códigos HTTP no se pueden corroborar desde Azure; los logs de consola solo
  confirman los turnos del tutor y las solicitudes autenticadas con CSRF.

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
