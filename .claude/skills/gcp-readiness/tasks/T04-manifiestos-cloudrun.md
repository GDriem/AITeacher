# T04 — Decidir el destino de `infra/cloudrun/*.yaml`

**Carril:** infra · **Depende de:** T01 · **Prioridad:** bloqueante

## Contexto

`infra/cloudrun/agent-service.yaml` y `mcp-service.yaml` **no se usan**.
`deploy.sh` despliega con `gcloud run deploy --image ... --set-env-vars ...` y
nunca ejecuta `gcloud run services replace`. Los YAML son documentación que
parece configuración, y ya divergieron:

| Ajuste | YAML | Lo que realmente se aplica |
|---|---|---|
| `containerConcurrency` (agent) | 40 | 80 (default de Cloud Run) |
| `maxScale` (mcp) | 10 | 100 (default) |
| recursos | 1 CPU / 1 Gi | defaults |

El riesgo real: alguien edita el YAML para cambiar algo y no pasa nada en el
despliegue.

Dato medido en la auditoría, por si informa la decisión: el agent-app consume
**84 MiB** y el mcp-server **48 MiB** en reposo, así que el default de 512 Mi
sobra y `1Gi` del YAML nunca fue necesario.

## Archivos que puedes tocar

- `infra/cloudrun/agent-service.yaml`
- `infra/cloudrun/mcp-service.yaml`
- `infra/cloudrun/deploy.sh`
- `README.md`

## Cambios

Elige **una** de las dos salidas y aplícala entera. No dejes un estado a medias.

**Opción A — los YAML mandan (recomendada si se quiere infra declarativa).**
Cambia `deploy.sh` para que sustituya los marcadores (`PROJECT_ID`, `REGION`,
`TAG`, `MCP_SERVICE_URL`, `MCP_SERVICE_HOST`, `GOOGLE_OAUTH_WEB_CLIENT_ID`) en
una copia temporal y aplique `gcloud run services replace`. Ventaja: un solo
sitio donde vive la configuración. Coste: hay que trasladar a los YAML todo lo
que T01 acaba de añadir al script (`--timeout`, `MCP_TIMEOUT_SECONDS`,
`MCP_AUTHORING_URL`, `--concurrency`), y el secreto `APP_SESSION_SECRET` ya está
como `secretKeyRef` en el YAML, así que verifica que coincide con lo que crea el
script.

**Opción B — `deploy.sh` manda (recomendada si se prefiere lo simple).**
Borra los dos YAML y añade a `README.md` una tabla corta con la configuración
efectiva de cada servicio (imagen, cuenta de servicio, escalado, concurrencia,
timeout, variables). Ventaja: cero divergencia posible. Coste: la configuración
sólo se lee leyendo un script bash.

Decide tú según lo que encuentres en el repositorio, aplica la opción, y **di en
tu respuesta cuál elegiste y por qué**. Si eliges A, los valores del YAML deben
quedar idénticos a los que aplica `deploy.sh` tras T01 — compáralos uno a uno y
lista las diferencias que corregiste.

## Lo que NO debes hacer

- No ejecutes `gcloud` ni `deploy.sh`.
- Si T01 todavía no está aplicada (no ves `firestore databases` en `deploy.sh`),
  **para y dilo**: esta tarea depende de ella y la comparación saldría mal.

## Verificación

```bash
bash -n infra/cloudrun/deploy.sh
ls infra/cloudrun/
```

Si elegiste A, valida que los YAML resultantes son YAML bien formado:

```bash
python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" \
  infra/cloudrun/*.yaml
```

## Commit sugerido

`Alinear los manifiestos de Cloud Run con el despliegue real`
