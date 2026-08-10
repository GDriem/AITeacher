# Google Login y perfiles de alumnos

## Objetivo

Vincular el progreso, las conversaciones y la ruta adaptativa a una identidad de
Google verificada por el backend, y conservar un modo invitado para desarrollo
local cuando la autenticacion no este configurada.

## Decisiones

- Google Identity Services entrega el ID token en el navegador.
- FastAPI verifica firma, audiencia, emisor y vigencia antes de confiar en la
  identidad.
- El backend emite una cookie de sesion `HttpOnly`, `SameSite=Lax` y firmada; el
  frontend nunca decide el identificador persistente de un usuario autenticado.
- El identificador interno es `google:<sub>`. No se usa el correo como llave,
  porque puede cambiar.
- Se guarda un perfil minimo: nombre, correo, foto, alta, ultimo acceso y ultimo
  cambio. Las conversaciones y el progreso existentes siguen usando el mismo
  contrato de `student_id`, ahora resuelto por el servidor.
- Sin `GOOGLE_CLIENT_ID`, el sistema conserva el modo invitado actual para que el
  entorno local siga siendo util. Con Google configurado, las APIs de alumno
  requieren una sesion valida.

## Fases verificables

1. Implementar verificacion, cookie de sesion y repositorio de perfiles con
   pruebas unitarias.
2. Aplicar la identidad autenticada a todas las APIs de alumno y cubrir que no
   pueda suplantarse un `student_id` enviado por el cliente.
3. Integrar la pantalla y estados de Google Login, documentar configuracion y
   ejecutar pruebas funcionales, accesibilidad y rendimiento del frontend.

## Configuracion prevista

- `GOOGLE_CLIENT_ID`: OAuth 2.0 Web Client ID.
- `APP_SESSION_SECRET`: secreto aleatorio para firmar cookies.
- `APP_AUTH_COOKIE_SECURE`: `true` en HTTPS; puede ser `false` solo en desarrollo.
- `APP_STUDENT_PROFILES_BACKEND`: `local` o `firestore`.
- `APP_STUDENT_PROFILES_PATH`: archivo JSON del backend local.
- `FIRESTORE_STUDENT_PROFILES_COLLECTION`: coleccion de perfiles.
