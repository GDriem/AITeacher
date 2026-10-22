# Hito 2: unidades editoriales

El host .NET conserva unidades en el esquema PostgreSQL `content`. El catálogo
continúa en `curriculum`; un contrato de aplicación valida el tema de destino.
No se modifica el catálogo durante la importación y no hay referencias EF entre
módulos. Los temas no se pueden eliminar en esta etapa.

## Contrato y flujo

Todas las rutas requieren sesión. Crear, revisar, consultar historial, publicar,
despublicar e importar requieren autor y las escrituras requieren CSRF. El
[OpenAPI](openapi.yaml) define los cuerpos y las respuestas. Las solicitudes
[Postman](../postman/collections/AITeacher%20Backend/api/units) incluyen ejemplos
completos y guardan `unitId`, `revisionId` y `unitVersion` tras escribir. Configure
`topicId` con un tema real del catálogo. Use el flujo Google/CSRF del README.

1. `POST /api/units` con `{topicId,document}` crea un borrador y su revisión 1.
2. `POST /api/units/{unitId}/revisions` con `{version,document}` añade una revisión
   completa. No modifica la anterior ni la publicación activa. Guarde los IDs
   estables de objetivos/conceptos al revisar el mismo material.
3. `POST /api/units/{unitId}/revisions/{revisionId}/publish` con `{version}` valida
   cobertura y activa esa revisión de forma atómica. También permite volver a una
   revisión histórica válida. No genera índices, llamadas IA ni trabajos externos.
4. `POST /api/units/{unitId}/unpublish` con `{version}` retira la publicación de
   las lecturas del alumno. Conserva revisiones y procedencia de publicación.

`version` corresponde a la unidad, aumenta en cada escritura y protege revisión,
publicación y retiro frente a concurrencia. Una versión obsoleta devuelve `409`;
recargue antes de reintentar. Crear unidades no es idempotente. Un fallo al guardar
revierte todas las escrituras de esa operación.

`GET /api/units` lista con `offset=0`, `limit=50` (máximo 100) y filtro opcional
`topicId`; orden estable por ID. Los autores ven la revisión más reciente; los
alumnos solo la activa publicada. `GET /api/units/{unitId}` sigue la misma regla.
Una unidad sin publicación devuelve `404` al alumno. El historial de autor usa
`GET /api/units/{unitId}/revisions`, paginado y ordenado por número descendente,
y `GET /api/units/{unitId}/revisions/{revisionId}` para recuperar un snapshot.
`publishedAt` en el historial conserva la primera publicación de cada revisión.

## Documento y publicación

`document` exige `title` y los arrays `concepts`, `objectives`, `readings`,
`exercises`, `assessments` y `prerequisites`. Los arrays pueden estar vacíos al
crear un borrador; máximo 200 entradas cada uno, documento de hasta 2 MB. Los
límites de texto figuran en OpenAPI. Los textos son texto plano y el cliente debe
escaparlos al representarlos; no constituyen HTML confiable.

Los IDs son UUID locales a la revisión. Un objetivo vincula `conceptIds`; lectura,
ejercicio y evaluación vinculan `objectiveIds`. Las referencias deben existir
dentro del mismo snapshot, los IDs deben ser únicos y los prerrequisitos no pueden
formar ciclos. No se aceptan referencias a otro documento ni a un banco externo.

La publicación de `kind: learningUnit` exige al menos un objetivo y, para **cada** objetivo, conceptos,
lectura, práctica y evaluación. Todo el snapshot se publica junto: no puede
apuntar a un borrador externo. Las evaluaciones de esta entrega son material
editorial (`prompt` y `privateCriteria`), todavía sin corrección ni intentos. El
banco ejecutable, sus opciones y claves, políticas y entregas son el hito 3.
El alumno recibe lectura, objetivos, conceptos y ejercicios, sin `assessments`,
criterios privados ni metadatos del registro importado.

Las revisiones y la procedencia de primera publicación son append-only. Triggers
PostgreSQL rechazan UPDATE y DELETE incluso mediante SQL directo. El puntero activo
solo puede referenciar una revisión de la misma unidad. Publicar no modifica el
snapshot; editar una publicación requiere añadir otra revisión. No hay borrado de
unidades en esta entrega. No existe todavía un índice RAG al que propagar retiros.

## Importación del corpus existente

El corpus `mcp_learning_server/content/learning_content.json` contiene 82 lecturas
en 35 temas de origen. Carece de objetivos, ejercicios y evaluaciones. Se importa
un borrador `kind: reading` por registro, con una lectura y sus referencias vacías.
Ese material de solo lectura puede publicarse sin fabricar actividades. La unidad
completa `kind: learningUnit` mantiene todos sus requisitos de cobertura. El registro original completo
(incluidos ID, tema, nivel, fuente y keywords) queda en `revision.origin`.
Los niveles originales son procedencia; no se convierten automáticamente en
niveles del catálogo ni se infieren competencias.

Desde `backend/`, prepare un mapa explícito de tema de origen a UUID del catálogo:

```sh
python3 scripts/prepare-corpus-import.py > /tmp/topic-mappings.json
# Edite /tmp/topic-mappings.json y sustituya cada marcador por un UUID real.
python3 scripts/prepare-corpus-import.py \
  --topic-mappings /tmp/topic-mappings.json \
  --output /tmp/corpus-import.json
```

El script solo prepara archivos locales. Envíe `/tmp/corpus-import.json` como cuerpo
JSON a `POST /api/units/import` usando sesión de autor y CSRF, o reemplace el ejemplo
del request Import corpus de Postman por ese cuerpo. El endpoint devuelve
`{created,skipped,items:[{sourceId,unitId}]}`. Acepta 1–500 registros por lote.

La importación usa el namespace fijo `learning-content-v1` y el ID original para
deduplicar. Repetir los mismos registros y mappings conserva los IDs y omite los
existentes, incluso si después se editaron sus unidades. El hash se calcula sobre
los campos deserializados y el tema de destino; el orden de las propiedades JSON
no afecta el resultado. El orden de keywords sí forma parte del registro original.
Si cambia el origen o el mapping de un ID ya importado, todo el lote devuelve `409`
sin escrituras parciales; concilie el cambio mediante revisiones editoriales.
IDs duplicados en un lote, campos inválidos y mapas incompletos devuelven `400`.
Una carrera entre importaciones puede devolver `409`; repetir el mismo lote
permitirá omitir los registros que ya se hayan confirmado.

El ensayo automatizado importa las 82 lecturas en una base temporal, verifica el
origen y repite el lote después de una edición. No importa el corpus a producción,
no altera Firestore y no cambia los escritores Python o React.


## Publicación conservadora del catálogo original

Desde el 21 de octubre existe el comando administrativo
`--curriculum inspect|apply|reconcile`. Concilia las entradas del catálogo sin
sobrescribirlas, reutiliza `CorpusImporter` y `EditorialService.Publish` y conserva
revisiones/origen/publicaciones. Ejecuta una transacción serializable entre ambos
esquemas y no toca datos de alumnos. Un conflicto editorial cancela todo el lote.
Versiones modificadas y publicaciones retiradas no se reactivan automáticamente.

`kind: reading` requiere al menos una lectura válida y arrays vacíos de conceptos,
objetivos, prácticas, evaluaciones y prerrequisitos conceptuales. Publicar no
acredita dominio. El registro importado original sigue reservado a autoría;
`readingProvenance` expone explícitamente ID, tema, nivel y keywords de lectura.
Los niveles no se convierten en competencias. Los prerrequisitos entre temas se
preservan en `source-curriculum.json` y su endpoint autenticado, sin inventar
referencias conceptuales. No existe un único nivel correcto para todo un tema.

La beta Azure tiene 82 lecturas publicadas y su catálogo conciliado. Las actividades
Python no se convierten en definiciones ejecutables: su equivalencia/curación
sigue pendiente. [Procedimiento, límites e informes](../docs/curriculum-continuity.md).

## Descripción de tema

Desde el 22 de octubre los temas admiten `description`: texto plano opcional de
hasta 600 caracteres que el alumno ve en la página del tema y como extracto en el
catálogo. Solo los autores la escriben, al crear (`POST /api/catalog/topics`) o al
editar (`PUT /api/catalog/topics/{id}`) con la `version` leída; una versión
obsoleta devuelve `409`. En `PUT`, omitir `description` conserva la guardada
(así una pestaña con el bundle anterior, un script o una petición antigua no la
borran); enviarla como `null` o en blanco la borra. El servidor recorta espacios
y guarda las vacías como `null`. Materias, categorías, escalas y niveles no la tienen.

La migración `TopicDescription` del esquema `curriculum` añade una columna
nullable con un `CHECK` de texto no vacío; las filas existentes quedan en `null`
y los clientes anteriores siguen funcionando. `--curriculum` no escribe
descripciones y, como no sobrescribe entradas conciliadas, tampoco las borra.
