# T02 — Excluir `y/` y `node_modules` de `.gcloudignore`

**Carril:** infra-2 · **Depende de:** — · **Prioridad:** bloqueante

## Contexto

`deploy.sh` ejecuta `gcloud builds submit ... .`, que sube el directorio completo
como contexto de build. `gcloud` usa `.gcloudignore` cuando existe e **ignora
`.gitignore` por completo**. El `.gcloudignore` actual no excluye:

| Directorio | Tamaño medido |
|---|---|
| `y/` (un google-cloud-sdk que quedó en la raíz) | 303 MB |
| `frontend/node_modules` | 280 MB |

Son ~583 MB que se suben a Cloud Build en cada despliegue y que Docker descarta
después vía `.dockerignore` — pero el contexto ya viajó. Build lento, caro, y con
riesgo de fallar por tamaño.

`y/` sí está en `.gitignore` (línea 168, `/y/`), por eso `git status` sale limpio
y el problema pasa desapercibido.

## Archivos que puedes tocar

- `.gcloudignore`

## Cambios

Añade las exclusiones que faltan. Revisa `.dockerignore` y `.gitignore` y alinea
`.gcloudignore` con ellos para todo lo que sea pesado y regenerable:

- `y/` (con una línea de comentario explicando qué es, porque no es obvio)
- `frontend/node_modules`
- `frontend/dist`, `frontend/coverage`, `frontend/playwright-report`,
  `frontend/test-results`
- `**/*.egg-info`

Ojo: **no excluyas `frontend/`** entero. El `Dockerfile` de `agent_app` compila
el frontend dentro de la imagen (`COPY frontend ./` en la etapa `frontend-build`),
así que el código fuente sí tiene que viajar.

## Verificación

```bash
# El contexto que subiría gcloud, aproximado:
du -sh y frontend/node_modules 2>/dev/null   # lo que dejas de subir
grep -c . .gcloudignore
```

Comprueba a mano que `frontend/src`, `frontend/package.json`,
`frontend/pnpm-lock.yaml` y `frontend/index.html` **no** quedan excluidos por
ninguna regla nueva. Si tienes `gcloud` disponible, este comando lista lo que se
subiría sin subir nada:

```bash
gcloud meta list-files-for-upload . 2>/dev/null | wc -l
gcloud meta list-files-for-upload . 2>/dev/null | grep -c "^frontend/src" # > 0
gcloud meta list-files-for-upload . 2>/dev/null | grep -c "^y/"           # 0
```

Si `gcloud` no está disponible, dilo en tu respuesta en vez de inventar el
resultado.

## Commit sugerido

`Excluir el SDK y node_modules del contexto de Cloud Build`
