# Fase 8 — Accesibilidad, observabilidad y pulido

La fase 8 prepara AITeacher para uso real con una interfaz recuperable, señales
operativas comprensibles y validación automatizada en móvil y escritorio. La
implementación se divide en tres entregables verificables y commits separados.

## Entregables

### 1. Accesibilidad y resiliencia de interfaz

- navegación semántica y enlace para saltar al contenido;
- foco visible, retorno de foco y cierre con `Escape` en paneles;
- estados de carga y cambios anunciados a lectores de pantalla;
- errores con acción de reintento y recuperación automática al volver la red;
- contraste reforzado, objetivos táctiles y respeto a movimiento reducido.

La interfaz sigue los patrones aplicables de WCAG 2.2 AA. Las funciones
principales no dependen del puntero: los formularios, filtros, tarjetas, panel de
autoría y proyectos pueden operarse mediante tabulación, `Enter`, `Espacio` y
`Escape`.

### 2. Observabilidad y panel mínimo

Agent App medirá peticiones HTTP, latencia, errores, llamadas al modelo, tokens,
costo configurable y finalización de actividades. Las métricas serán agregadas
y no contendrán mensajes, respuestas, IDs de estudiante ni secretos.

El panel de salud y uso consumirá un endpoint de resumen de sólo lectura. Los
tokens que un proveedor no reporte se identificarán explícitamente como
estimados; el costo se calculará con precios configurados por entorno, nunca con
tarifas codificadas que puedan quedar obsoletas.

La implementación usa `ObservabilityRegistry`, un registro en memoria con una
ventana acotada de muestras de latencia. `ObservableModelProvider` decora el
puerto ya existente sin acoplar los agentes a Gemini o Foundry. El resumen se
consulta en:

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/healthz` | Vida del proceso y configuración básica |
| `GET` | `/readyz` | Proceso inicializado y listo para tráfico |
| `GET` | `/api/observability` | Salud, uso, latencia y actividades agregadas |

Las tarifas se configuran con
`MODEL_INPUT_COST_PER_MILLION_USD` y
`MODEL_OUTPUT_COST_PER_MILLION_USD`. Un valor `0` mantiene la medición de tokens
sin atribuir un costo potencialmente incorrecto. La cantidad de muestras se
limita con `OBSERVABILITY_MAX_LATENCY_SAMPLES`.

El resumen no conserva rutas concretas desconocidas, parámetros, cuerpos ni
resultados del modelo. Para evitar cardinalidad y filtraciones, usa plantillas de
ruta de FastAPI y agrupa las rutas no reconocidas como `<unmatched>`.

### 3. Responsive, rendimiento y cierre

- pruebas de contrato accesible y de layouts móvil/escritorio;
- validación del flujo principal en navegador a ambos tamaños;
- revisión de recursos y dependencias del frontend;
- ejecución de la suite completa y reconstrucción de Docker Compose;
- actualización de roadmap, README y decisiones de esta guía.

El frontend se mantiene en HTML, CSS y JavaScript nativos, sin `npm`, CDN ni
framework de runtime. `GZipMiddleware` comprime respuestas mayores de 1 KB y los
dos recursos enlazados usan una versión de despliegue en la URL para que una
hora de caché no sirva CSS o JavaScript de una entrega anterior.

La suite fija presupuestos de 30 KB para HTML, 40 KB para CSS y 100 KB para
JavaScript, además de comprobar que el script sea diferido y que no existan
recursos remotos. También valida los contratos de columnas para:

- escritorio: contenido y sidebar, catálogo de cuatro columnas;
- tableta hasta 900 px: una columna principal y catálogo de dos columnas;
- móvil hasta 600 px: una columna y controles de sesión reorganizados.

La prueba en navegador se ejecutó a 1440×1000 y 390×844. En escritorio se
completaron explicación y evaluación con `Ctrl+Enter`; el foco pasó a la
pregunta y después al feedback. En móvil se abrió y cerró un proyecto con
retorno de foco. La comprobación final confirmó ancho completo sin scroll
horizontal y ausencia de errores de consola.

Los dos entrypoints construyen su aplicación ASGI una sola vez dentro de
`main()`. Esto elimina la inicialización duplicada de Uvicorn y evita que importar
el módulo MCP intente crear persistencia local dentro de una imagen de Agent App
configurada para usar el MCP remoto.

## Validación final

Los comandos de cierre son:

```powershell
.\.venv\Scripts\python.exe -m pytest
node --check agent_app\static\app.js
docker compose up --build -d
```

Después de levantar Compose se comprueban `/healthz`, `/readyz`, el catálogo, el
chat, la evaluación y `/api/observability`. La validación no requiere
credenciales porque usa el proveedor `mock`.

## Privacidad y alcance operativo

La observabilidad es deliberadamente agregada y local a cada instancia. Sirve
como panel mínimo para la demo y para diagnóstico inmediato; un despliegue
horizontal deberá exportar las mismas señales a un backend central antes de
considerarlas métricas globales.
