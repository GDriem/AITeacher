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
