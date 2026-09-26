# Despliegue

## Estado

- Demostracion estatica: publicada automaticamente en GitHub Pages.
- Aplicacion completa: ejecutable localmente con backend y SQLite.
- Backend productivo: preparado para empaquetado, pero no desplegado en un proveedor externo.
- Alta disponibilidad: pendiente de base compartida, cola, balanceador y observabilidad.

## Entorno local

```bash
npm install
npm start
```

Abrir `http://127.0.0.1:4173`.

## Demostracion publica

```bash
npm run build
```

El flujo `.github/workflows/deploy-pages.yml` publica `dist/` al enviar cambios a `main`. La version estatica no expone la API ni almacena usuarios, sesiones o credenciales.

## Contenedor

El repositorio incluye `Dockerfile`, `.dockerignore` y `compose.production.yml`. El Compose es una referencia para una sola instancia con volumen persistente. Antes de usarlo deben configurarse `APP_BASE_URL`, `TOKEN_ENCRYPTION_KEY`, SMTP y las credenciales OAuth.

```bash
docker compose -f compose.production.yml up --build
```

Docker no estaba instalado en la maquina de desarrollo durante la validacion de v0.5.0, por lo que el contenedor no fue ejecutado localmente.

## Salud operativa

- `GET /api/v1/health/live`: confirma que el proceso responde.
- `GET /api/v1/health/ready`: confirma base disponible y servicio listo.
- `GET /api/v1/health`: alias compatible de disponibilidad.

El servidor deja de declararse listo durante el apagado, detiene el trabajador, cierra HTTP y despues cierra la base.

## Requisitos para produccion real

1. Elegir proveedor de aplicacion, base de datos, correo y secretos.
2. Migrar SQLite a PostgreSQL u otra base compartida.
3. Ejecutar migraciones como paso controlado de despliegue.
4. Separar API y trabajador y usar una cola compartida.
5. Configurar HTTPS, dominio, copias de seguridad, logs, metricas y alertas.
6. Registrar las URL OAuth productivas exactas en cada plataforma.
7. Realizar pruebas de carga, restauracion y seguridad antes de datos reales.
