# Documentación de AITeacher

AITeacher completó las ocho fases de su hoja de ruta el 23 de julio de 2026.
Esta página es el punto de entrada a la documentación vigente del producto.

## Empezar

- [README principal](../README.md): instalación, ejecución local, Docker,
  capacidades y contratos principales.
- [Guion de demo](demo-script.md): recorrido de 8–10 minutos y plan alternativo
  sin voz.
- [Colección de Postman](../postman/agent-mcp-run.postman_collection.json):
  comprobación manual de Agent App y del servidor MCP.

## Diseño y decisiones

- [Arquitectura](architecture.md): componentes, secuencia de aprendizaje,
  fronteras y decisiones técnicas de las ocho fases.
- [Hoja de ruta completada](product-roadmap.md): objetivos, criterios verificados
  y decisiones entregadas por fase.
- [Proveedor Microsoft Foundry](foundry.md): configuración opcional, contrato y
  limitaciones.

## Guías por capacidad

| Guía | Capacidad |
| --- | --- |
| [Fase 1](phase-1.md) | Servidor MCP, contenido, recuperación y persistencia local |
| [Fase 2](phase-2.md) | Ruta adaptativa, prerrequisitos y recomendaciones |
| [Fase 3](phase-3.md) | Dominio, nivel y conceptos por tema |
| [Fase 4](phase-4.md) | Sesiones persistentes, retención y aislamiento |
| [Fase 5](phase-5.md) | Evaluación híbrida, rúbricas y fallback |
| [Fase 6](phase-6.md) | Feedback, práctica y proyectos integradores |
| [Fase 7](phase-7.md) | Autoría, publicación y versionado de lecciones |
| [Fase 8](phase-8.md) | Accesibilidad, observabilidad y rendimiento |

## Operación

- [Despliegue en Cloud Run](deployment.md): topología de dos servicios,
  identidad, secretos, verificación y rollback.
- [Fase 8](phase-8.md#privacidad-y-alcance-operativo): límites de las métricas
  locales y privacidad.
- [Variables de ejemplo](../.env.example): configuración local sin
  credenciales reales.

La guía histórica
[`agent-mcp-run-guia-completa.pdf`](../agent-mcp-run-guia-completa.pdf)
conserva el contexto original de la charla. Ante diferencias, prevalecen el
código, el README y las guías Markdown de este directorio.
