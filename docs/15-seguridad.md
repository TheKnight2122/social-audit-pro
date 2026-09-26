# Seguridad

## Controles implementados

- Contrasenas derivadas con `scrypt` y salt individual.
- Sesiones persistentes con token aleatorio almacenado como hash y cookie `HttpOnly` y `SameSite=Strict`.
- Proteccion CSRF, comprobacion de origen y permisos por rol en backend.
- Contexto de organizacion almacenado en sesion y aplicado a cuentas, analitica, reportes, actividad e integraciones.
- Verificacion de correo con token de un solo uso y expiracion.
- Recuperacion de contrasena con token de un solo uso, revocacion de sesiones y registro de actividad.
- MFA TOTP con secreto cifrado, QR de alta y codigos de recuperacion almacenados como hash.
- Credenciales, tokens OAuth y verificadores PKCE cifrados con AES-256-GCM.
- Estado OAuth aleatorio almacenado como hash, expiracion de diez minutos y consumo unico.
- PKCE S256 para TikTok y X.
- Limite de intentos de login almacenado en base de datos.
- Cabeceras CSP, `nosniff`, politica de referencia, limite JSON y ocultamiento de `X-Powered-By`.
- Validacion de HTTPS y longitud del secreto al iniciar en modo produccion.
- Registro de actividad de operaciones sensibles.
- Ningun secreto real se incluye en el repositorio ni en GitHub Pages.
- El servidor solo sirve los cinco archivos del frontend; base de datos, configuracion y codigo interno responden 404.
- Las respuestas API usan `Cache-Control: no-store`.

## Correo

En desarrollo, los mensajes se registran en una bandeja persistente sin guardar el token sin cifrar. En un despliegue real se debe configurar SMTP mediante variables de entorno, usar dominio verificado y controlar rebotes y abuso.

## Riesgos conocidos

- Los conectores distintos de YouTube necesitan validacion real, revision de permisos y manejo de revocaciones especifico de cada proveedor.
- SQLite es adecuado para desarrollo y una instancia, pero no para varios servidores escribiendo el mismo archivo.
- Falta un gestor externo de secretos, rotacion automatica, monitoreo centralizado y respuesta a incidentes.
- No se ha realizado auditoria externa, prueba de penetracion ni prueba de carga.
- MFA protege cuentas de la aplicacion, pero no sustituye la seguridad de las cuentas sociales conectadas.

## Antes de produccion

1. Migrar la persistencia a una base administrada con copias de seguridad.
2. Configurar HTTPS, secretos externos, SMTP y politicas de retencion.
3. Validar OAuth con aplicaciones aprobadas y cuentas de prueba de cada proveedor.
4. Incorporar revocacion, alertas, observabilidad y pruebas de seguridad.
5. Ejecutar revision de aislamiento entre organizaciones y autorizacion por recurso.
