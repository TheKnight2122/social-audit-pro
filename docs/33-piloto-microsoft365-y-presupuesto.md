# Preparacion del piloto con Microsoft 365

## Decisiones confirmadas

El objetivo inmediato es probar con empresas y datos reales sin contratar hosting. Se aceptan pausas por inactividad y no se autoriza consumo de APIs de pago. Las consultas se solicitan al ingresar al dashboard. El volumen crecera gradualmente y no existe fecha fija; se prioriza una primera prueba cuanto antes.

El administrador gestiona servicios y redes. El jefe administra Microsoft 365. Cada empresa ve las cuentas que el administrador conecta dentro de su organizacion. Las sesiones del cliente no pueden elegir otra empresa mediante identificadores enviados a la API. La entrega actual no agrega un selector de cuentas por usuario ni transferencia de una cuenta entre empresas; no se deben mezclar clientes de empresas distintas en una misma organizacion.

## Implementado en v0.5.5

- Transporte Microsoft Graph HTTPS para verificaciones y recuperacion; conserva SMTP como alternativa.
- Token de aplicacion temporal en memoria, reutilizado entre envios y renovado antes de caducar.
- Remitente fijo, rechazo de redirecciones, limite de diez segundos por solicitud y errores genericos sin secretos.
- Sin reintento automatico del envio para evitar duplicados tras una respuesta incierta. Se requiere solicitar un nuevo enlace si el envio falla.
- X desactivado por defecto aun con credenciales, en OAuth, consultas manuales, dashboard y trabajador.
- Estado visible de X desactivado por presupuesto y 76 pruebas automatizadas aprobadas.

Las pruebas usan respuestas simuladas. Tener transporte configurado no verifica permisos ni entrega real. La bandeja usa el estado `sent` y el contrato existente `delivered=true` cuando el proveedor acepta; no representan confirmacion de llegada al destinatario. Graph devuelve HTTP 202 para esa aceptacion. [Referencia de sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)

## Acciones del jefe para Microsoft 365

1. Designar el buzon remitente de avisos y confirmar que esta disponible en Exchange Online.
2. Registrar una aplicacion de un solo tenant en Microsoft Entra ID; conservar tenant ID y client ID.
3. Generar una credencial de aplicacion con caducidad y custodiarla en el servidor o gestor de secretos. No enviar contrasenas del buzon ni claves por chat, correo o GitHub.
4. Autorizar envio limitado al buzon designado mediante Exchange Online RBAC for Applications y el rol `Application Mail.Send`. Un administrador con permisos suficientes debe registrar el principal de servicio en Exchange, definir el alcance y probar que el buzon autorizado queda incluido y otro buzon queda excluido.
5. Revisar permisos anteriores de Entra: una concesion global equivalente puede ampliar el acceso y no queda restringida simplemente por anadir RBAC. No conceder Mail.Read ni permisos globales innecesarios.

El proceso de RBAC y la comprobacion de alcance estan descritos por [Microsoft](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac). La autorizacion es una tarea del administrador de Microsoft 365; no se ejecuto en este avance.

## Configuracion privada del servidor

```dotenv
EMAIL_PROVIDER=microsoft365
M365_TENANT_ID=
M365_CLIENT_ID=
M365_CLIENT_SECRET=
M365_SENDER=
X_API_ENABLED=false
```

Completar valores reales solo en `.env` privado o en secretos del host; despues reiniciar. Tenant y client ID deben ser GUID; sender es la direccion del buzon. Si falta configuracion, el servicio no intenta SMTP como alternativa silenciosa. No hace falta habilitar autenticacion basica SMTP. El adaptador implementa [client credentials de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) y solo admite los endpoints de la nube global.

## Acciones del administrador para la prueba

1. Preparar las cuentas del proveedor gratuito de backend y de PostgreSQL, sin contratar planes pagos. El despliegue aun necesita portar la persistencia SQLite; no basta subir los archivos actuales a un disco temporal.
2. Crear una organizacion por empresa y crear sus usuarios Cliente desde ese contexto. Conectar solo las cuentas sociales asignadas a esa empresa con las aplicaciones oficiales autorizadas.
3. Mantener X desactivado. Antes de activar cualquier otra API, comprobar que los productos, cuotas y condiciones elegidos no generan costes. El sistema no puede detectar cambios de precios externos.
4. Una vez desplegado, comprobar login, correo, recuperacion, 2FA, aislamiento y refresco con cuentas reales de prueba. Empezar con pocos usuarios y aumentar tras medir errores y tiempos.

No se crearon cuentas de proveedores ni se activaron servicios externos. No hay PostgreSQL, backend publico, alta disponibilidad ni capacidad productiva validada en esta entrega. La pagina de GitHub Pages sigue siendo una demo estatica. X utiliza precios por uso segun su [documentacion oficial](https://docs.x.com/x-api/getting-started/pricing); su activacion posterior requiere aprobacion expresa, no solo disponer de credenciales.
