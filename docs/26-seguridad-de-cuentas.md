# Seguridad de cuentas

## Verificacion de correo

El registro genera un token aleatorio. Solo su hash se guarda en `auth_tokens`; el enlace se envia mediante el servicio de correo. La confirmacion marca `email_verified_at` y consume el token.

Un nuevo login exige correo verificado. Si la contrasena es correcta y el correo sigue pendiente, se envia un enlace nuevo. La sesion inicial permite configurar la instalacion y solicitar la verificacion.

## Recuperacion de contrasena

La solicitud siempre devuelve una respuesta generica para no revelar si el correo existe. El token expira, es de un solo uso y queda inutilizado al cambiar la contrasena. El cambio revoca sesiones anteriores.

## Segundo factor

El usuario autenticado inicia el alta TOTP, escanea un QR y confirma un codigo. El secreto queda cifrado con la clave del servidor. Al activar MFA se generan codigos de recuperacion que se muestran una sola vez y se guardan como hashes.

Un login con MFA valido crea primero un desafio temporal. La sesion completa solo se entrega despues de validar TOTP o consumir un codigo de recuperacion.

## Correo local y productivo

`src/server/email.js` usa SMTP cuando esta configurado. En desarrollo registra una salida auditable sin conservar el enlace secreto en texto plano. Las variables se encuentran en `.env.example`.

Los enlaces de prueba estan desactivados por defecto. `EMAIL_PREVIEW_ENABLED=true` se reserva para un servidor de desarrollo en loopback con datos desechables; nunca debe habilitarse con datos reales. En produccion se ignora esta opcion.

## Operacion segura

- Proteger `TOKEN_ENCRYPTION_KEY` fuera del repositorio.
- Usar HTTPS y cookies seguras en produccion.
- Rotar claves mediante un procedimiento probado, no reemplazarlas directamente.
- Configurar limites, alertas y proteccion del proveedor SMTP.
- Mantener codigos de recuperacion fuera del equipo principal.
