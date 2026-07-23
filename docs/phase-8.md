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

### 3. Responsive, rendimiento y cierre

- pruebas de contrato accesible y de layouts móvil/escritorio;
- validación del flujo principal en navegador a ambos tamaños;
- revisión de recursos y dependencias del frontend;
- ejecución de la suite completa y reconstrucción de Docker Compose;
- actualización de roadmap, README y decisiones de esta guía.

## Privacidad y alcance operativo

La observabilidad es deliberadamente agregada y local a cada instancia. Sirve
como panel mínimo para la demo y para diagnóstico inmediato; un despliegue
horizontal deberá exportar las mismas señales a un backend central antes de
considerarlas métricas globales.
