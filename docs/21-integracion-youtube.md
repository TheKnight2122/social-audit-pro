# Integracion oficial de YouTube

## Requisitos externos

1. Crear o seleccionar un proyecto en Google Cloud.
2. Habilitar YouTube Data API v3 y YouTube Analytics API.
3. Configurar la pantalla de consentimiento OAuth. Si la aplicacion esta en modo de prueba, agregar las cuentas autorizadas como usuarios de prueba.
4. Crear un cliente OAuth 2.0 de tipo `Web application`.
5. Registrar exactamente la URL de redireccion local:

```text
http://127.0.0.1:4173/api/v1/integrations/youtube/oauth/callback
```

Google exige que la URL utilizada coincida exactamente con la registrada. El uso de HTTP se limita al entorno local de loopback; un despliegue real debe usar un dominio HTTPS y su callback correspondiente.

## Variables privadas

Crear `.env` a partir de `.env.example` y completar:

```text
APP_BASE_URL=http://127.0.0.1:4173
TOKEN_ENCRYPTION_KEY=un-secreto-aleatorio-largo
YOUTUBE_OAUTH_CLIENT_ID=cliente-de-google
YOUTUBE_OAUTH_CLIENT_SECRET=secreto-de-google
YOUTUBE_OAUTH_REDIRECT_URI=http://127.0.0.1:4173/api/v1/integrations/youtube/oauth/callback
```

No versionar `.env`, tokens ni credenciales reales.

## Permisos solicitados

- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

Son permisos de lectura para consultar el canal autorizado, sus videos y las metricas analiticas disponibles. La aplicacion no solicita ni almacena la contrasena de Google o YouTube.

## Flujo en la aplicacion

1. Iniciar el servidor con `npm start` y acceder como un usuario con permiso para administrar integraciones.
2. Abrir `Integraciones` y pulsar `Conectar cuenta` en YouTube.
3. Autorizar los permisos en la pantalla oficial de Google.
4. El callback valida el estado de un solo uso, intercambia el codigo, cifra los tokens y ejecuta la primera sincronizacion.
5. Las vistas existentes pasan de datos demo a datos oficiales para ese usuario.
6. `Sincronizar ahora` obtiene cambios, actualiza registros existentes y agrega nuevos videos o historicos sin duplicarlos.

## Datos y limites

Se guardan los datos del canal, suscriptores cuando no estan ocultos, videos, fechas, vistas, likes, comentarios y las metricas historicas que YouTube Analytics autorice. Alcance, impresiones y demografia no se inventan si los endpoints o permisos actuales no los proporcionan.

La demostracion de GitHub Pages sigue siendo estatica y no ejecuta OAuth ni guarda secretos. Para publicar la integracion real se necesita desplegar el backend y SQLite, o una base equivalente, en infraestructura HTTPS.

## Referencias oficiales

- https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps
- https://developers.google.com/youtube/v3/guides/authentication
- https://developers.google.com/youtube/v3/docs/playlistItems/list
- https://developers.google.com/youtube/analytics/reference/reports/query
