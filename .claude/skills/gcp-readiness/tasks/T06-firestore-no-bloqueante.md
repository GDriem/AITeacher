# T06 — Firestore fuera del event loop

**Carril:** api · **Depende de:** T03 · **Prioridad:** alta

## Contexto

`FirestoreSessionRepository` (`agent_app/services/sessions.py:685` y siguientes)
es **síncrono**: `document.get()`, `document.set()`, `.stream()` son llamadas de
red bloqueantes. Se invoca desde handlers `async def` sin `asyncio.to_thread` ni
`run_in_threadpool`:

- `agent_app/api/main.py:129` (`_reconcile_persisted_chat_response`), `:675`,
  `:689`, `:699`, `:731`, `:826`
- `agent_app/agents/orchestrator.py:68`, `:228`, `:235`, `:276`, `:334`, `:369`,
  `:379`, `:409`

Cada ida a Firestore congela el event loop entero. Con la concurrencia por
defecto de Cloud Run (80, o 40 tras T01) eso serializa todas las peticiones de la
instancia — **y además interrumpe el bombeo de audio del WebSocket de voz**, que
vive en el mismo loop (`agent_app/services/live_voice.py`).

Lo mismo aplica a `FirestoreStudentProfileRepository` en
`agent_app/services/auth.py`.

## Archivos que puedes tocar

- `agent_app/services/sessions.py`
- `agent_app/services/auth.py`
- `agent_app/api/main.py`
- `agent_app/agents/orchestrator.py`
- `tests/`

## Cambios

El repositorio implementa un `Protocol` síncrono (`SessionRepository`) con dos
adaptadores: `LocalSessionRepository` (JSON atómico, también bloqueante pero en
disco local) y `FirestoreSessionRepository`. Tienes dos caminos:

**Camino 1 — envolver en el borde (menos invasivo).** Deja el protocolo síncrono
y mete las llamadas en `asyncio.to_thread(...)` en los puntos de uso `async`.
Ventaja: los adaptadores y sus tests no cambian. Coste: hay ~14 puntos de
llamada y es fácil olvidar uno, hoy o en el futuro.

**Camino 2 — un decorador asíncrono.** Un envoltorio que implemente el mismo
protocolo pero `async`, delegando cada método a `asyncio.to_thread`, y construido
en `build_session_repository` sólo para el backend `firestore`. Coste: hay que
`await` en todos los puntos de uso igualmente, y el protocolo pasa a ser `async`.

**Elige el camino 1 salvo que encuentres una razón fuerte para el otro**, y di en
tu respuesta cuál elegiste. El objetivo es que ninguna llamada de red a Firestore
ocurra en el hilo del event loop; lo demás es forma.

Aplica el mismo tratamiento a `FirestoreStudentProfileRepository`:
`authenticated_profile` se llama en cada petición autenticada.

`LocalSessionRepository` escribe a archivo temporal + `os.replace` y usa un lock
de archivo — **no cambies esa mecánica**, es una decisión deliberada del proyecto.

## Verificación

- `python -m pytest -q` sin regresiones (165 pruebas en verde antes de empezar).
- Los tests existentes usan el backend local; asegúrate de que sigan pasando sin
  cambios de comportamiento observable.
- Añade un test que verifique que el camino de Firestore no bloquea: por ejemplo,
  un doble de cliente Firestore cuyo `get()` duerma con `time.sleep`, y comprobar
  que dos peticiones concurrentes tardan aproximadamente lo que una, no el doble.
  Si ese test sale frágil en CI, sustitúyelo por uno que compruebe que el método
  se invoca desde un hilo distinto al del loop, y dilo.

## Commit sugerido

`Sacar las llamadas a Firestore del event loop`
