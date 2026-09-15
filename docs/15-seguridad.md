# Seguridad

## Reglas iniciales

- No versionar contrasenas, tokens, API keys ni credenciales.
- Usar `.env.example` para documentar variables necesarias sin valores privados.
- Mantener `.gitignore` actualizado.
- Revisar riesgos de seguridad cuando se definan autenticacion, autorizacion, manejo de datos y despliegue.
- No almacenar contrasenas de redes sociales directamente.
- Utilizar OAuth u otros mecanismos oficiales de cada plataforma.
- Cifrar tokens de API y datos sensibles.
- Aplicar permisos por rol en backend, no solo en interfaz.

## Riesgos conocidos

- El MVP usa datos demo y no maneja credenciales reales.
- Las futuras integraciones requeriran control de permisos, limites de API y almacenamiento seguro de tokens.
- La futura exportacion de reportes debe respetar permisos por cliente/cuenta.

## Pendiente

- Definir requisitos de seguridad.
- Implementar autenticacion real.
- Implementar autorizacion por roles.
- Implementar cifrado de tokens.
- Implementar auditoria de actividad.
