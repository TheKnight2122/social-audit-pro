# Portales y actualizacion al ingresar

## Decisiones recibidas

Se confirma prueba online sin presupuesto de alojamiento, con pausas por inactividad aceptadas; actualizacion al entrar al dashboard; redes administradas por el administrador y APIs de pago desactivadas. El correo es Microsoft 365 y lo administra el jefe de la empresa. Cada empresa solo vera cuentas designadas por el administrador, mediante la organizacion correspondiente. El volumen inicial no esta definido y se espera crecimiento gradual; las pruebas se solicitan lo antes posible. Faltan buzon remitente, autorizacion de aplicacion y accesos a servicios. No se solicito separar usuarios de la misma empresa entre si.

## Accesos

- `#/cuenta/admin`: entrada de administradores y equipo interno.
- `#/cuenta/client`: entrada de clientes.
- Ambos usan la autenticacion existente, verificacion y MFA cuando esta habilitado. El enlace no asigna roles ni eleva permisos. Despues del login se muestra la experiencia correspondiente al rol de la organizacion activa.
- El administrador crea usuarios desde Configuracion. Debe seleccionar o crear primero la organizacion correspondiente desde Cuenta antes de dar de alta clientes. No se debe incluir a distintas empresas clientes en una misma organizacion.
- El cliente ve Dashboard y Cuenta. El dashboard muestra comunidad, publicaciones, visualizaciones, likes y tabla con alcance, vistas, likes y comentarios. No estima metricas ausentes ni muestra datos de ejemplo a clientes sin conexiones.
- Los permisos analiticos de lectura siguen vigentes; esta entrega simplifica la interfaz, no incorpora un contrato nuevo para ocultar campos analiticos de la misma empresa por API. Reportes y demas herramientas del administrador se conservan.

## Actualizacion

Entrar al dashboard con sesion activa envia POST `/api/v1/analytics/dashboard/refresh`, con CSRF. Se muestran los ultimos datos mientras se consulta. El servidor toma la organizacion de la sesion, no del cuerpo del pedido.

Cada conexion configurada utiliza el bloqueo comun de sincronizacion. La reclamacion y el intervalo minimo de quince minutos se comprueban atomicamente en SQLite mediante inicio y fin de la ultima tarea. Errores del proveedor respetan el reintento existente de treinta minutos. Otra pestaña o usuario no fuerza consultas repetidas durante esos intervalos. Las conexiones revocadas se excluyen.

Cada proveedor dispone de veinte segundos en este flujo. Si falla o excede el limite, el dashboard conserva los datos persistidos y muestra actualizacion incompleta. Se revalidan sesion, organizacion y permiso de lectura antes de guardar; un SDK que ignore cancelacion puede seguir consultando externamente pero no persistir tarde. No hay garantia de datos en tiempo real ni sustitucion de metricas ausentes por ceros.

No se modificaron los horarios existentes: un administrador puede pausarlos desde Integraciones para operar solo bajo demanda. La sincronizacion bajo demanda necesita el backend encendido y credenciales validas; GitHub Pages no ejecuta este flujo.

## Despliegue y limites

El alojamiento gratuito sigue pendiente. Para el esquema propuesto faltan PostgreSQL, activar el transporte Microsoft 365 preparado en v0.5.5, credenciales/aprobaciones sociales y validacion productiva. El correo corporativo por si solo no autoriza el envio desde la aplicacion; el jefe debe autorizar el acceso al buzon designado.

No se crearon cuentas externas ni se contrataron servicios. Presupuesto cero no garantiza disponibilidad continua, ni implica que todas las APIs sociales sean gratuitas. X requiere revisar su coste y autorizacion antes de activarlo. No se promete alta disponibilidad ni migracion automatica entre PC y nube.

## Verificacion

`npm test`: 66 pruebas aprobadas, ocho nuevas para refresco, intervalo, errores, CSRF, permisos, bloqueos y aislamiento.

Revision Playwright con base en memoria: cliente en 1440x1000 y 390x844, una consulta efectiva al recargar, rutas restringidas en interfaz, cliente sin datos, ambos accesos y herramientas del administrador conservadas. Las capturas `docs/assets/portal/` usan fixtures simulados, no cuentas oficiales reales. El rotulo Datos oficiales es el estado de interfaz ejercitado mediante un proveedor simulado.
