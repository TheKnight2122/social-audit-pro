# Estado del proyecto

## Resumen ejecutivo

Social Audit Pro es un MVP avanzado local con backend, persistencia, identidad, organizaciones, analitica, PDF, conectores OAuth y sincronizacion automatica. La demostracion publica sigue siendo estatica y segura para presentacion. El producto todavia no es un servicio SaaS desplegado ni una plataforma de alta disponibilidad.

## Completado

- Once vistas independientes y adaptables.
- Motor analitico con formulas, auditoria, hallazgos y recomendaciones.
- API REST Express bajo `/api/v1`.
- SQLite con seis migraciones y datos persistentes.
- Registro, login, logout, sesiones, CSRF y permisos por rol.
- Verificacion de correo, recuperacion de contrasena y MFA TOTP.
- Organizaciones, membresias y cambio de contexto.
- Aislamiento de cuentas, publicaciones, historicos, reportes, actividad e integraciones por organizacion.
- Secretos y tokens cifrados en reposo.
- OAuth YouTube validado como primer conector completo.
- Adaptadores OAuth y normalizacion para Instagram, Facebook, TikTok, LinkedIn y X.
- PKCE para TikTok y X.
- Sincronizacion manual y programada con bloqueo por arrendamiento.
- Reportes persistentes y PDF profesional.
- Imagen Docker, Compose de referencia, endpoints de salud y apagado ordenado.
- Demostracion estatica desplegada por GitHub Pages.
- Copias cifradas y verificadas, restauracion sin sobrescritura y programacion opcional.
- Monitoreo HTTP basico, logs JSON sin datos sensibles y metricas protegidas por clave de operador.
- 42 pruebas automatizadas aprobadas.
- Manuales e informes semanales en Word.

## Implementado pero pendiente de activacion externa

- Instagram, Facebook, TikTok, LinkedIn y X necesitan aplicaciones registradas, credenciales, permisos aprobados y validacion con cuentas reales.
- El correo necesita un servidor SMTP y dominio verificado para entregar mensajes fuera del entorno local.
- El contenedor necesita un host de produccion y gestion segura de variables.
- Las copias periodicas necesitan clave propia y activacion; no se modificaron secretos ni la base del usuario.

## Pendiente

- Desplegar backend, base y correo en un proveedor productivo.
- Migrar SQLite a PostgreSQL o equivalente compartido.
- Separar API y trabajadores mediante cola administrada.
- Configurar balanceo, almacenamiento externo de copias, retencion, centralizacion de metricas/logs, trazas y alertas.
- Completar revocacion y manejo de cuotas especifico de cada proveedor.
- Realizar pruebas reales de conectores, carga y seguridad.

## Limitaciones conocidas

- Sin credenciales OAuth, las vistas usan datos demostrativos.
- GitHub Pages solo muestra el frontend y no ejecuta autenticacion, base de datos ni sincronizaciones.
- Una instalacion SQLite debe ejecutarse como una unica instancia.
- Las metricas dependen de permisos y disponibilidad de cada API; los valores ausentes no se inventan.

## Proximo objetivo

Obtener credenciales de una primera plataforma adicional, validar el flujo completo en un entorno de prueba y elegir proveedor productivo con PostgreSQL, SMTP y gestion de secretos.
