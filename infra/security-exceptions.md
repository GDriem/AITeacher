# Excepciones revisadas de Checkov

Estas excepciones son visibles para aprobación; no equivalen a pasar los controles omitidos. No se habilitan productos de seguridad de pago ni se amplía acceso para satisfacer un escáner.

| Check | Revisión |
|---|---|
| CKV_AZURE_36 | Blob solo tiene endpoint privado y `bypass:None`; habilitar trusted-services ampliaría acceso. Se conserva el aislamiento más estricto. |
| CKV_AZURE_43 | El escáner no resuelve el nombre dinámico. Resultado mecánico `staiteacherbeta8136`, 18caracteres minúsculos/alfa-numéricos; conforme a ARM. |
| CKV_AZURE_206 | LRS es el tier presupuestado de beta; no se afirma redundancia regional ni aceptación de recuperación productiva. |
| CKV_AZURE_112 | RSA2048 en KeyVault Standard. HSM requiere Premium no incluido en el presupuesto; cifrado con identidad, RBAC, rotación y protección contra purga sí aplicados. |
| CKV_AZURE_139 | ACR Basic público autenticado, sin admin/anónimos; datos de estudiante y DB permanecen privados. Premium/private-build tiene otro costo. |
| CKV_AZURE_163 | Defender de imágenes es configuración de suscripción con costo independiente. No se habilita ni se afirma análisis de vulnerabilidades. Pendiente de decisión antes de producción. |
| CKV_AZURE_166 | Quarantine depende de Premium. Se usan builds controlados y digest inmutable; esto no reemplaza escaneo de vulnerabilidades. |

Ejecutar primero escaneo sin filtros y conservar su resultado. Para el análisis restante sobre ARM compilado:

```bash
checkov -f /tmp/aiteacher-main.json --framework arm --skip-download --compact \
  --skip-check CKV_AZURE_36,CKV_AZURE_43,CKV_AZURE_206,CKV_AZURE_112,CKV_AZURE_139,CKV_AZURE_163,CKV_AZURE_166
```

El Bicep de compute contiene expresiones que Checkov3.3.30 no interpreta; el ARM compilado complementa esa cobertura. Nunca informar el resultado filtrado como escaneo completo sin excepciones. La aceptación final de estas decisiones corresponde a la aprobación del despliegue beta.
