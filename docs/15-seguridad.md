# Seguridad

## Controles implementados

- No versionar contrasenas, tokens, API keys ni credenciales.
- Usar `.env.example` para documentar variables necesarias sin valores privados.
- Mantener `.gitignore` actualizado.
- No almacenar contrasenas de redes sociales directamente.
- Utilizar OAuth u otros mecanismos oficiales de cada plataforma.
- Contrasenas de usuarios derivadas con `scrypt` y salt individual.
- Sesiones persistentes mediante token aleatorio, almacenado como hash y enviado en cookie `HttpOnly` y `SameSite=Strict`.
- Proteccion CSRF para operaciones con cambios y validacion de origen.
- Credenciales de integracion cifradas con AES-256-GCM.
- Permisos por rol aplicados en cada endpoint del backend.
- Cabeceras CSP, `X-Content-Type-Options`, `Referrer-Policy` y ocultamiento de `X-Powered-By`.
- Limite de tamano JSON y limitador basico de intentos de login.
- Registro de actividad para acciones sensibles.
- Estado OAuth aleatorio, almacenado como hash, con expiracion de diez minutos y consumo de un solo uso.
- Tokens de acceso y renovacion de YouTube cifrados con AES-256-GCM y nunca expuestos al frontend.
- Conexion y consultas oficiales limitadas al usuario propietario de la autorizacion.
- Prevencion de reasignacion de una cuenta social ya registrada a otro usuario.

## Riesgos conocidos

- Las conexiones oficiales de YouTube se aislan por usuario, pero todavia no existe un modelo completo de organizaciones o empresas compartidas.
- El limitador de login vive en memoria y debe trasladarse a almacenamiento compartido para multiples instancias.
- No se implementaron recuperacion de contrasena, verificacion de correo ni segundo factor.
- SQLite es adecuado para desarrollo e instalacion local, pero un despliegue distribuido requerira una base administrada.
- La seguridad final de OAuth depende de configurar correctamente redirecciones, permisos y rotacion de secretos en cada proveedor.

## Pendiente

- Agregar aislamiento multiempresa y autorizacion por cuenta social.
- Incorporar revocacion explicita, rotacion de secretos y los controles OAuth requeridos por los proveedores restantes.
- Agregar restablecimiento de contrasena, verificacion de correo y MFA.
- Incorporar analisis de dependencias, pruebas de penetracion y gestion centralizada de secretos antes de produccion.
