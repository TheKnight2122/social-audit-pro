# Avance 011 - Seguridad, organizaciones, sincronizacion y conectores

Fecha: 2026-09-25.

## Solicitud

Avanzar integraciones oficiales de Instagram, Facebook, TikTok, LinkedIn y X; sincronizacion automatica; produccion; recuperacion de contrasena; verificacion de correo; 2FA; aislamiento por empresa y preparacion para alta disponibilidad.

## Resultado

- Se agrego el modelo de organizaciones y membresias.
- Se aislaron recursos y consultas por organizacion activa.
- Se agregaron programaciones y un trabajador con arrendamiento atomico.
- Se implementaron verificacion, recuperacion y MFA TOTP.
- Se agregaron adaptadores para las cinco redes pendientes y se generalizo OAuth.
- Se agrego PKCE para TikTok y X.
- Se agregaron Dockerfile, Compose, validaciones productivas y endpoints de salud.
- Se actualizaron interfaz, pruebas y documentacion.
- Se restringieron los archivos publicos a una lista explicita para impedir descargar la base local y archivos internos.
- Se corrigieron las metricas de seguidores multired, los valores ausentes y el consumo atomico de codigos de recuperacion.
- Se condiciono la publicacion de GitHub Pages a las pruebas automatizadas y se corrigio el aviso de arranque cuando el puerto esta ocupado.

## Verificacion

- `npm test`: 25 de 25 pruebas exitosas.
- `npm run build`: demostracion estatica generada.
- Revision visual de Cuenta en escritorio y movil.
- `git diff --check`: sin errores.
- `npm audit --omit=dev`: cero vulnerabilidades reportadas.
- Servidor local reiniciado; `/api/v1/health/ready` responde con base conectada.

## Limites declarados

- Los cinco conectores nuevos no se marcaron como activos: faltan credenciales, aprobaciones y validacion real.
- El backend no se desplego porque no se definio proveedor ni se entregaron secretos.
- La alta disponibilidad no se marco como completa: requiere PostgreSQL, cola, balanceador y observabilidad.
- Docker no estaba instalado en el equipo y el contenedor no pudo ejecutarse localmente.
