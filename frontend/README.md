# Frontend React de AITeacher

Este directorio contiene la interfaz React que convive con la aplicación
estática durante la migración descrita en
`docs/react-frontend-migration-plan.md`. R1 publica el catálogo y la acción de
iniciar un tema; R2 incorpora los proyectos integradores; R3 establece el
bootstrap y la identidad común; R4 añade administración y continuidad de
conversaciones. El feed y composer del tutor, evaluación pedagógica, práctica,
voz, observabilidad y autoría permanecen en la interfaz vigente.

## Arquitectura de R1–R4

```text
src/
├── app/                    # router, shell, QueryClient y límites de error
├── api/                    # cliente HTTP, errores y contrato generado
├── features/auth/          # bootstrap, identidad, gate, perfil y recuperación 401
├── features/catalog/       # consulta, filtros, ruta y acción de inicio
├── features/projects/      # catálogo, workspace, evaluación y rúbrica
├── features/sessions/      # listado, continuidad, mutaciones y drawer accesible
├── routes/                 # ensamblaje y división por ruta
├── styles/                 # tokens semánticos y reset global
└── test/                   # MSW, fixtures y render de integración
```

TanStack Query es dueño del catálogo remoto. La búsqueda, materia, categoría y
nivel viven en los search params; los resultados y la recomendación por
materia se derivan durante el render. No existe store global ni una copia local
del catálogo. La identidad anónima usa un adaptador versionado que comparte el
identificador mínimo con la UI heredada durante la convivencia. R3 la resuelve
una sola vez en `AuthProvider`; catálogo y proyectos reciben el `studentId`
común y nunca leen cookies, tokens o perfiles del almacenamiento local.

El bootstrap inicia `GET /api/capabilities` y `GET /api/auth/status` en
paralelo. Con autenticación deshabilitada crea una identidad local versionada;
con autenticación habilitada abre un gate modal que contiene el foco y carga
Google Identity Services sólo entonces. El perfil público vive en la caché de
TanStack Query, el token permanece exclusivamente en la cookie HttpOnly y un
`401` de cualquier cliente abre el mismo flujo de recuperación.

El cliente de `src/api/client.ts` consume tipos generados desde el OpenAPI de
FastAPI. Todos los fallos HTTP se convierten a `ApiError`, con estado,
correlation ID y un mensaje seguro para la interfaz. Los componentes no
conocen modelos Python, repositorios ni detalles del MCP.

Al iniciar un tema, React conserva el contrato funcional existente:

1. envía `Quiero aprender sobre {título}` a `POST /api/chat`;
2. guarda sólo el identificador de sesión necesario para convivencia;
3. abre `/?session={id}#tutor`;
4. la UI heredada recupera esa sesión y limpia el query param.

Así R1 prueba la vertical completa sin implementar anticipadamente el tutor de
R5 ni la administración de sesiones de R4.

R2 añade `/app/proyectos` como un chunk de ruta independiente. TanStack Query
posee el catálogo remoto; la selección, la propuesta y el estado de la
mutación permanecen locales a la pantalla. `GET /api/projects` y
`POST /api/projects/{project_id}/evaluate` se consumen exclusivamente mediante
el contrato generado. El workspace conserva la propuesta tras un fallo para
permitir reintentar, mueve el foco al reto y al resultado, y lo restaura al
botón de origen al cerrar.

R4 incorpora un drawer de conversaciones en el shell. TanStack Query conserva
el listado, los detalles y las invalidaciones explícitas de renombrar,
archivar, restaurar y eliminar. La búsqueda y la vista activa/archivada se
derivan durante render; el identificador activo es el único dato de
continuidad persistido y usa un esquema versionado compatible con la UI
heredada. Las aperturas tardías se descartan mediante un request ID y sólo la
solicitud vigente puede realizar el handoff al tutor heredado.

## Dirección visual

Los tokens parten del inventario heredado: canvas `#07111f`, superficies azul
pizarra, contenido frío, azul para guía, verde para dominio, ámbar para
atención y rojo para recuperación. Se conserva la tipografía del sistema, sin
descargas externas. La única pieza expresiva es la ruta de aprendizaje lineal;
el resto evita gradientes decorativos, sombras pesadas y tarjetas uniformes.

Los layouts se prueban en 320, 768, 1024 y 1440 px. Incluyen skip link, foco
visible, contraste elevado, movimiento reducido, estados de carga, vacío,
error/reintento y nombres accesibles.

La pieza distintiva de R2 es la mesa de proyecto: el catálogo numerado conduce
de reto a entregables y rúbrica sin recurrir a un grid de tarjetas decorativas.
La expresividad sigue concentrada en el recorrido de aprendizaje y el resto
usa las superficies y acentos semánticos definidos en R1.

En R4 el drawer funciona como bitácora compacta, no como un dashboard de
tarjetas: fecha, tema y número de mensajes explican cada entrada, mientras una
línea azul identifica la continuidad activa. A 320 px ocupa todo el ancho y la
marca cede espacio a navegación, conversaciones y cuenta.

## Desarrollo

Requisitos: Node 24, pnpm 11.16.0 y el entorno Python del repositorio.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Vite publica `http://127.0.0.1:4173/app/` y reenvía `/api` y `/ws` a
`http://127.0.0.1:8000`. FastAPI continúa siendo el único servidor público en
producción.

## Contrato OpenAPI

```powershell
pnpm api:generate
pnpm api:check
```

`api:generate` exporta un esquema determinista desde `create_app()` y actualiza
`src/api/generated/schema.ts`. Ambos archivos se versionan para que el build no
dependa de levantar el backend. `api:check` falla si el esquema o los tipos se
desvían.

## Verificación

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Vitest usa Testing Library, MSW y axe. Playwright comprueba teclado, consola,
axe en navegador, continuidad tras recarga y ausencia de overflow en los
cuatro anchos de referencia.
El build usa React Compiler y separa catálogo y proyectos por ruta. Google
Identity queda además en un chunk condicional fuera de la carga sin auth.

FastAPI sirve `frontend/dist` bajo `/app`, con fallback de SPA para rutas
profundas y caché inmutable para `/app/assets/*`. El Dockerfile construye esos
recursos en una etapa Node y copia solamente `dist` a la imagen Python final.

## Deuda deliberada al cerrar R4

- No se define todavía un presupuesto automático de bundle por ruta; R9 lo
  fijará con medición de Web Vitals y perfiles reales.
- No se incorpora una biblioteca de primitivas: R1 sólo necesita controles
  HTML nativos. La decisión se reevalúa cuando aparezcan dialogs y drawers.
- El feed, composer y contenido de la sesión se muestran en la UI heredada
  hasta R5; React administra la continuidad y entrega la sesión seleccionada.
- “Nueva conversación” limpia la selección y vuelve al catálogo; el primer
  mensaje creará la sesión cuando R5 incorpore el composer.
- El endpoint actual devuelve el listado completo, incluidas archivadas; no se
  inventa paginación del lado cliente sin un contrato de servidor.
- Capacidades ya se consultan, pero voz y autoría permanecen ocultas hasta R7 y
  R8.
- El drawer se aloja en el shell y el menú de cuenta continúa limitado a perfil
  y cierre de sesión.
- Las evaluaciones de proyecto no se guardan ni se restauran al recargar porque
  el contrato vigente tampoco ofrece persistencia para este dominio.
