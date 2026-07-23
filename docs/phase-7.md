# Fase 7 — Panel de autoría

La fase 7 incorpora un flujo protegido para crear, editar, previsualizar,
publicar, despublicar y revertir lecciones. El corpus publicado sigue viviendo
en el servidor MCP: Agent App sólo presenta la interfaz y actúa como proxy
administrativo.

## Configuración

La autoría permanece deshabilitada mientras no haya credenciales. En desarrollo
local con un solo proceso:

```dotenv
APP_AUTHORING_TOKEN=una-credencial-local-segura
MCP_CONTENT_AUTHORING_PATH=.data/content_authoring.json
```

En Docker Compose se configura una sola variable, inyectada con nombres
distintos en ambos servicios:

```dotenv
AUTHORING_TOKEN=una-credencial-segura-y-distinta-por-entorno
```

Agent App valida `APP_AUTHORING_TOKEN` antes de aceptar una operación. En modo
remoto, después llama a `/admin` del MCP usando `MCP_AUTHORING_TOKEN`. El secreto
se introduce en el panel, se conserva sólo en `sessionStorage` y nunca forma
parte del HTML, los logs ni el repositorio.

## Flujo editorial

1. El editor abre **Panel de autoría** e ingresa su nombre y credencial.
2. Crea una lección o selecciona una existente.
3. Guarda el borrador. El MCP valida ID, tema, nivel, título, fuente, texto y
   palabras clave.
4. Revisa la vista previa.
5. Publica. Sólo entonces el `ContentStore` usado por el recuperador léxico
   recibe el nuevo contenido.
6. Puede despublicar o revertir cualquier versión. La reversión crea una versión
   nueva y nunca elimina el historial anterior.

Editar un borrador de una lección ya publicada no cambia la versión que consulta
el tutor. Esto permite revisar modificaciones sin afectar sesiones activas.

## Contrato y persistencia

`LearningContent` es el contrato canónico de entrada:

- `id`: slug único de 3 a 100 caracteres;
- `topic`: uno de los 23 identificadores curriculares;
- `level`: `beginner`, `intermediate` o `advanced`;
- `title`: entre 3 y 120 caracteres;
- `text`: entre 40 y 2,000 caracteres;
- `source`: origen identificable, sin caracteres de control;
- `keywords`: hasta 20 valores únicos, de 2 a 60 caracteres.

`LocalContentAuthoringRepository` guarda snapshots completos en JSON mediante
archivo temporal, `fsync` y reemplazo atómico. El estado inicial se genera desde
`learning_content.json`; después, el archivo de autoría es la fuente de verdad
para el corpus publicado.

Cada revisión registra:

- versión continua;
- acción (`created`, `updated`, `published`, `unpublished` o `reverted`);
- editor y fecha UTC;
- borrador;
- snapshot publicado, si existe;
- versión de origen cuando la acción es una reversión.

## API

Agent App expone las rutas de interfaz bajo `/api/authoring/lessons`. Todas
requieren `X-Authoring-Token`.

| Método | Ruta | Acción |
| --- | --- | --- |
| `GET` | `/api/authoring/lessons` | Listar |
| `POST` | `/api/authoring/lessons` | Crear borrador |
| `GET` | `/api/authoring/lessons/{id}` | Recuperar con historial |
| `PUT` | `/api/authoring/lessons/{id}` | Editar borrador |
| `GET` | `/api/authoring/lessons/{id}/preview` | Previsualizar |
| `POST` | `/api/authoring/lessons/{id}/publish` | Publicar |
| `POST` | `/api/authoring/lessons/{id}/unpublish` | Despublicar |
| `POST` | `/api/authoring/lessons/{id}/revert` | Revertir |

El MCP mantiene el mismo contrato en `/admin/lessons`, protegido con su propia
configuración `MCP_AUTHORING_TOKEN`. Estas rutas administrativas no se registran
como herramientas MCP, de modo que ningún agente recibe privilegios editoriales.

## Importación futura

Los importadores posteriores de Markdown o documentos no escribirán directamente
en el corpus. Deberán transformar cada fuente al contrato `LearningContent` y
crear un borrador mediante el mismo servicio. Así reutilizarán validación, vista
previa, publicación e historial sin introducir un segundo camino editorial.

## Validación

La cobertura automatizada comprueba:

- rechazo de IDs y palabras clave inválidas;
- aislamiento entre borrador y contenido publicado;
- creación, edición, publicación y despublicación;
- persistencia del historial después de reiniciar;
- reversión de contenido y estado de publicación;
- autorización tanto en Agent App como en el MCP;
- disponibilidad inmediata del contenido publicado para el recuperador.
