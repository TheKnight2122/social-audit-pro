# Conectores oficiales

## Estado por plataforma

| Plataforma | Codigo OAuth | Normalizacion | Renovacion | Validacion real |
|---|---|---|---|---|
| YouTube | Implementado | Implementada | Implementada | Flujo mas maduro; requiere credenciales propias |
| Instagram | Implementado | Implementada | Token de larga duracion inicial | Pendiente de credenciales y aprobacion |
| Facebook | Implementado | Implementada | Token de pagina obtenido en conexion | Pendiente de credenciales y aprobacion |
| TikTok | Implementado con PKCE | Implementada | Implementada | Pendiente de credenciales y aprobacion |
| LinkedIn | Implementado | Implementada | Segun token concedido | Pendiente de Community Management API |
| X | Implementado con PKCE | Implementada | Implementada | Pendiente de credenciales, plan y cuotas |

## Contrato comun

Todos los adaptadores entregan:

- Identidad y metadatos de la cuenta.
- Metricas disponibles en la API.
- Publicaciones y metricas publicas disponibles.
- Tokens vigentes o renovados.
- Fecha de sincronizacion.

El sistema no estima alcance, impresiones o demografia si el proveedor no los entrega.

## Activacion

1. Registrar una aplicacion oficial en el portal de la red.
2. Configurar la URL de callback exacta.
3. Solicitar productos, scopes y revisiones requeridos.
4. Guardar ID y secreto como variables del servidor.
5. Conectar una cuenta de prueba desde Integraciones.
6. Verificar sincronizacion, renovacion, revocacion y limites.

## Referencias oficiales

- YouTube: `docs/21-integracion-youtube.md`.
- Instagram: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- Facebook: https://developers.facebook.com/docs/facebook-login/
- TikTok: https://developers.tiktok.com/doc/display-api-overview/
- LinkedIn: https://learn.microsoft.com/linkedin/marketing/community-management/community-management-overview
- X: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code

Las APIs cambian con frecuencia. Antes de activar un proveedor se deben verificar versiones, productos, scopes y condiciones vigentes en su documentacion oficial.
