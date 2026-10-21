# Continuidad curricular de la beta

## Diagnóstico y alcance autorizado (21 de octubre de 2026 UTC)

Se revisaron `.agents/AGENTS.md`, hitos 6/7, arquitectura, contrato editorial,
importador, currículo Python y recorrido React/.NET. Los cambios locales previos
se conservan. El destino es exclusivamente la beta México; no se trasladan alumnos,
historial ni progreso y no se retiran escritores Python.

| Área | Existente | Brecha |
| --- | --- | --- |
| Catálogo | Materias/categorías/escalas/niveles/temas persistentes y API | Falta conciliar el currículo Python y navegación del alumno |
| Corpus | 82 lecturas, 35 temas; importador idempotente con procedencia | Importar crea borradores; publicación exige actividades ausentes |
| Aprendizaje | Lectura, tutor, prácticas y evaluaciones implementados | Las lecturas no contienen prácticas ni pruebas; no inventarlas |
| Relaciones | Prerrequisitos conceptuales dentro de una unidad | Origen tiene prerrequisitos entre temas; conservarlos sin inferir dominio |
| Niveles | Nivel opcional único por tema | Las lecturas de un mismo tema tienen niveles distintos |
| Google/IA/voz | Puertos e interfaz implementados; beta responde HTTPS | Aceptaciones reales independientes de migración/publicación |

Se implementará material explícito `reading` publicable con lecturas válidas y
sin objetivos, conceptos, ejercicios ni evaluaciones. La unidad completa mantiene
su validación de cobertura. Procedencia pública acotada conservará nivel y keywords;
el registro original permanecerá reservado a autoría. Los prerrequisitos entre
temas se conservarán en el manifiesto versionado y se mostrarán como orientación,
sin convertirlos en bloqueos ni acreditaciones. No se equiparan niveles originales
con CEFR, competencia o dominio.

## Fases verificables

1. Diagnóstico y decisiones: este documento; revisión de fuentes/contratos.
2. Contrato de lectura, manifiesto e importación/publicación repetible, conciliación
   y navegación curricular; pruebas locales y commit separado.
3. Inspección real del destino antes de escribir; ejecutar migración conservadora,
   publicar, repetir, conciliar y actualizar imagen de la beta sin ampliar permisos.
4. Navegador real y documentación de evidencia; mantener abiertos los criterios
   de Google/IA/voz, calibración, equivalencia de actividades y corte pendientes.

La consulta HTTPS de `/api/auth/status` confirmó autenticación Google habilitada,
sin sesión en el cliente de diagnóstico. La sesión Azure corresponde a la
suscripción autorizada. Esto no demuestra que el destino esté vacío: el inventario
curricular autenticado sigue siendo requisito previo a cualquier escritura.

## Implementación y validación local

Material `reading` explícito; la publicación valida lecturas y prohíbe fingir
objetivos, conceptos, prácticas y evaluaciones. `learningUnit` mantiene cobertura
completa. No hay migraciones de esquema: se versionan documentos JSON inmutables.

El comando `--curriculum inspect|apply|reconcile` usa una transacción serializable
entre los dos esquemas curriculares, el importador existente y el servicio de
publicación. Conciliación por slug/padres y procedencia completa; los conflictos
conservan todo el lote sin cambios. Versiones modificadas o publicaciones retiradas
no se reactivan automáticamente. Los datos de alumnos no intervienen.

El manifiesto embebido se genera con `.venv/bin/python
backend/scripts/prepare-curriculum-manifest.py`; `--check` detecta diferencias
contra Python y el corpus antes de ejecutar. Contiene las relaciones originales
entre temas. `/api/catalog/source-curriculum` las sirve únicamente con sesión;
no sustituye el grafo conceptual ni establece bloqueos por dominio.

`run-curriculum-azure.py` ejecuta una imagen por digest en el job migrador ya
existente, sin actualizar su definición. Guarda informes nuevos, no sobrescribe
informes anteriores y comprueba que el template del job quedó idéntico.

Validación local: 9 pruebas de dominio, 80 de integración PostgreSQL, 25/25
aserciones Postman y dos recorridos Chromium. El recorrido migrado comprueba
materia/categoría/tema/nivel, fuente, ausencia de actividades inventadas, tutor
con simulación HTTP y regreso conservando filtros. Axe sin infracciones en
320/768/1024/1440px. OpenAPI y colecciones sin incidencias; TypeScript y ESLint
aprobados. Build .NET sin advertencias/errores; build React .NET y presupuesto
aprobados. Google y proveedores se sustituyen solo en las pruebas locales.

La sesión real Google sí entró a Azure con cuenta de alumno tras consentimiento
explícito. Antes de migrar, esa cuenta no ve unidades publicadas. El inventario
administrativo sigue pendiente; no se deduce que no existan borradores.

Los commits de esta fase incluyen solo archivos nuevos y cambios propios en
archivos previamente versionados. Los archivos React/BrowserHost que ya estaban
sin seguimiento al iniciar conservan sus ediciones en el árbol de trabajo; no se
incluye en estos commits toda la entrega previa de otra sesión.
