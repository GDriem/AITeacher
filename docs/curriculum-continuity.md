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
explícito. Antes de migrar, esa cuenta no ve unidades publicadas. La inspección administrativa posterior confirmó que no existían borradores ni
entradas de catálogo; los informes siguientes registran ese estado previo.

Los commits de esta fase incluyen solo archivos nuevos y cambios propios en
archivos previamente versionados. Los archivos React/BrowserHost que ya estaban
sin seguimiento al iniciar conservan sus ediciones en el árbol de trabajo; no se
incluye en estos commits toda la entrega previa de otra sesión.


## Resultado real en Azure — 21 de octubre de 2026

Beta: https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io

Revisión saludable `ca-aiteacher-beta-8136--0000008`, imagen
`craiteacherbeta8136.azurecr.io/aiteacher@sha256:eec351672dbaa63c26d561307977363c6892e74651454f7f49b9c5cbf4d10e8a`.
Build ACR `nj3` aprobado. Solo se actualizó la imagen de esta app y se ejecutó el
job existente con overrides por ejecución. No hubo cambios IAM, red, infraestructura
ni esquema; la definición del job permaneció idéntica. La revisión anterior usaba
`sha256:5eeae7a0a0baa41865e8855a26b19fd0e5d4f63b14fb1b7f76c50005c8dc2df3`.
Volver a esa imagen no despublica ni elimina contenidos; el rollback productivo
con escrituras nuevas sigue siendo una aceptación distinta, no ensayada aquí.

| Contenido | Origen | Destino conciliado |
| --- | ---: | ---: |
| Materias | 3 | 3 |
| Categorías | 9 | 9 |
| Temas | 35 | 35 |
| Escala de nivel de lectura | 1 representación nueva del nivel original | 1 |
| Niveles de lectura | 3 | 3 |
| Lecturas / unidades publicadas | 82 | 82 |
| Prerrequisitos entre temas | 42 | 42 en manifiesto versionado y referencia HTTP |
| Ejercicios / evaluaciones en el corpus | 0 / 0 | 0 / 0 |

IA: 49 lecturas en 24 temas; Inglés: 12 en 4; Redes: 21 en 7.
Niveles: 35 principiantes, 25 intermedias y 22 avanzadas. Se conservan los textos,
títulos, fuentes, IDs, temas, niveles y keywords sin reescribirlos. El modelo
normal de catálogo sigue teniendo un único nivel opcional por tema: los niveles
de cada lectura se conservan en `readingProvenance`, sin asignar un nivel único
artificial a todo el tema. Las relaciones entre temas se conservan en el manifiesto;
no se convierten en prerrequisitos conceptuales ni se afirman como competencias.

Manifiesto SHA-256:
`5e34b969907afce31d07c2d18e4c6b03d78c351a8b767d35dc5027dc4e9735f2`.
El registro original completo queda en la revisión reservada al autor; el alumno
solo recibe metadatos de lectura explícitos y el contenido publicado.

Informes sin datos personales:

- [Primera inspección](curriculum-evidence/azure-before.json): cero entradas y unidades.
- [Inspección tras reanudar](curriculum-evidence/azure-before-resume.json): mismo estado, sin conflictos.
- [Importación y publicación](curriculum-evidence/azure-apply.json): 82/82, `matches=true`.
- [Repetición](curriculum-evidence/azure-repeat.json): 0 entradas nuevas y 0 lecturas por importar/publicar; mismos 82 IDs.
- [Conciliación final](curriculum-evidence/azure-reconcile.json): 3 materias, 9 categorías, 35 temas, 3 niveles, 82 unidades/publicaciones; sin diferencias.

La conciliación comprueba padres del catálogo, hash de origen con tema de destino,
igualdad del registro original, texto/título/fuente de lectura, nivel/keywords,
versiones y publicación activa. Los 82 IDs de unidad y sus 35 IDs de tema coinciden
entre la primera ejecución y la repetición. No se migraron alumnos, sesiones,
historial ni progreso. El login de aceptación usa la identidad normal de la beta;
no forma parte de la importación curricular.

## Qué puede probar un alumno

Entrar con Google en la URL de la beta. El catálogo muestra 82 materiales en 35
temas. Filtrar por materia, categoría, tema y nivel; abrir una lectura; consultar
el texto y la fuente; volver conservando filtros. Ejemplo probado en Chrome real:
Redes → Enrutamiento → Enrutamiento dinámico con OSPF → Principiante → Abrir unidad.
El texto explica estado de enlace y muestra la fuente RFC 2328. Avanzado selecciona
la lectura «Diseño de áreas y convergencia». También se abrieron en Chrome
«Saludos según la situación» (Inglés, Intermedio) y «Entrenar con retropropagación»
(IA, Intermedio); se usó teclado para los filtros y la apertura.

La interfaz informa que son lecturas sin prácticas/evaluaciones ni acreditación
de dominio. El tutor no está configurado en esta beta y su botón no se ofrece como
actividad disponible. Esta importación no genera evaluaciones ni resume historial.
Se mantuvieron apuntes, repasos e historial como capacidades existentes, sin
crear datos para aparentar continuidad educativa.

La regresión HTTPS y Postman real aprobó nuevamente 25/25 aserciones, salida 0.
Se verificaron además la sesión real de alumno y el catálogo publicado en Chrome.
Con la sesión real, el historial de revisiones de la lectura OSPF devolvió 403
y la lectura publicada devolvió su revisión activa con `origin: null`.
El aislamiento de dos alumnos, autoría y recorrido con IA simulada se verificó
localmente; no se afirma una segunda cuenta Google real ni aceptación pedagógica.

## Diferencias y aceptaciones abiertas

| Área | Resultado de esta entrega | Abierto |
| --- | --- | --- |
| Corpus y catálogo | Publicados y conciliados, repetición sin duplicados | Aceptación docente de la calidad del contenido |
| Descubrimiento y lectura | Navegación por catálogo y niveles desplegada | Recomendaciones adaptativas y continuidad de actividades anteriores |
| Google | Login real de alumno y sesión conservada entre revisiones | Rol de autor y aislamiento entre dos identidades Google reales en Azure |
| IA / voz | Interfaces existentes, disponibilidad real indicada sin simulación en beta | Credenciales/federación, configuración, calidad y costos de proveedores; micrófono físico, interrupción y fallos reales |
| Actividades | No se fabricaron objetivos, ejercicios ni pruebas | Curación y equivalencias editoriales explícitas de las actividades Python; proyectos integradores |
| Aprendizaje | No se infiere dominio ni se mueve progreso | Datos docentes y calibración del hito 6; recomendaciones de repaso |
| Corte | No se cambian escritores Python ni recursos GCP | Ensayo de activación por funcionalidad, observabilidad, restauración y reversión del hito 8 |

La aplicación anterior de referencia fue consultada en navegador y pide acceso;
no se inició otra sesión allí. La comparación funcional usa el currículo y las
funcionalidades Python del repositorio, no una aceptación de sus proveedores en vivo.
El hito 7 permanece abierto. Publicación del corpus no equivale a migración completa
ni a paridad de actividades, IA, voz, historial o progreso.

## Repetir de forma conservadora

Desde la raíz y con la sesión Azure autorizada, usando siempre el mismo digest:

```sh
.venv/bin/python backend/scripts/prepare-curriculum-manifest.py --check
python3 backend/scripts/run-curriculum-azure.py inspect --image '<digest de arriba>' --report docs/curriculum-evidence/inspeccion-nueva.json
# Revisar conflictos antes de aplicar; nunca editar el SQL para hacerlos desaparecer.
python3 backend/scripts/run-curriculum-azure.py apply --image '<digest de arriba>' --report docs/curriculum-evidence/ejecucion-nueva.json
python3 backend/scripts/run-curriculum-azure.py reconcile --image '<digest de arriba>' --report docs/curriculum-evidence/conciliacion-nueva.json
```

Cada informe debe usar una ruta nueva. Ante pérdida de la salida, recuperar con
`--execution <nombre>` y la operación/digest originales: no repetir una escritura
solo porque faltó su salida. El comando valida operación e imagen de la ejecución.
No hay rollback automático, borrado ni reparación silenciosa de conflictos.
