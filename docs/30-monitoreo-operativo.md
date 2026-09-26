# Monitoreo operativo

Desde v0.5.2 el backend registra solicitudes HTTP y calcula estadisticas del proceso. Permite detectar errores y lentitud sin guardar contenido de las solicitudes. No equivale a una plataforma de monitoreo centralizada ni activa servicios externos.

## Registros

Cada respuesta o desconexion emite una linea JSON a stdout con `event`, `timestamp`, `level`, `requestId`, `method`, `status` y `durationMs`. Los eventos son `http.completed` o `http.aborted`. Los errores 5xx y abortos tienen nivel `error`.

`X-Request-Id` se genera de nuevo en el servidor, ignorando cualquier valor enviado por el cliente. Permite buscar la solicitud en los registros. No se incluyen URL, parametros OAuth, cuerpos, cookies, otras cabeceras, direcciones IP ni identificadores de usuarios u organizaciones. Los metodos desconocidos se agrupan como `OTHER`. No hay etiquetas basadas en valores del cliente.

El manejador central no imprime excepciones completas, que pueden contener secretos. Esta decision limita el diagnostico interno: no incluye stack ni causa detallada. Los errores del parser JSON tampoco reflejan el cuerpo recibido. Los fallos de arranque y los eventos de los trabajadores son flujos separados; esto no es una garantia de saneamiento de todos los logs del sistema operativo o proxy.

## Activacion de metricas

1. Generar un secreto propio de 32 bytes aleatorios, representado por 64 caracteres hexadecimales, usando un gestor de secretos o `crypto.randomBytes(32)` de Node.js.
2. Guardarlo como `OPERATIONS_METRICS_TOKEN` en el entorno privado del servidor. No reutilizar claves de copias u OAuth ni incluirlo en Git, capturas, URLs o historial de comandos.
3. Reiniciar el servidor. Una clave configurada con formato incorrecto impide iniciar; una clave vacia deja el endpoint desactivado con 404.
4. Consultar `GET /api/v1/operations/metrics` mediante `Authorization: Bearer <secreto>` usando un cliente seguro. Fuera de localhost, usar HTTPS y restringir el acceso en el proxy/firewall.

Una clave ausente o incorrecta ante el endpoint habilitado devuelve 401. Las cookies, parametros de URL y roles de organizaciones no autorizan acceso. Todas sus respuestas tienen `Cache-Control: no-store`. Es acceso global del operador del servidor, no una funcion para clientes ni administradores de una empresa.

La clave local del usuario no se configura automaticamente. Rotarla requiere reemplazarla y reiniciar. No hay interfaz de administracion ni endpoint equivalente en GitHub Pages.

## Datos disponibles

- `scope`: siempre `process`.
- `uptimeSeconds`: tiempo desde la creacion del monitor.
- `memoryRssBytes`: memoria residente del proceso Node.js.
- `http.active`, `completed`, `aborted`: solicitudes activas, finalizadas y desconectadas antes de finalizar.
- `http.statuses`: totales por clase 1xx, 2xx, 3xx, 4xx y 5xx.
- `http.durationMs`: suma, maximo, media y cubetas acumuladas hasta 50, 100, 250, 500, 1000, 2500 y 5000 ms. `leMs: null` representa todas las duraciones.

Las duraciones solo incluyen respuestas finalizadas; los abortos tienen contador y log propios. Se mide con reloj monotono. No son percentiles ni metricas de rendimiento de redes sociales. Incluye trafico estatico, verificaciones de salud y consultas al propio endpoint. La consulta actual aparece activa y se contabiliza como completada al finalizar la respuesta.

## Operacion y limites

Los contadores se mantienen en memoria acotada y reinician con el proceso. No hay series historicas, trazas distribuidas, alarmas, exportador Prometheus ni colector externo. El endpoint no consulta SQLite y puede servir aunque la base no este disponible; no reemplaza `/api/v1/health/ready`.

Compose configura rotacion de stdout/stderr a tres archivos de 10 MB. Esta configuracion aun debe validarse en Docker. En ejecucion directa, el operador debe controlar permisos, rotacion y espacio de los logs; los contadores acotados no limitan el tamano del archivo de salida. Un destino de logs que lance una excepcion no interrumpe solicitudes, pero puede perder evidencia.

Faltan centralizacion, politicas de retencion, metricas de los trabajadores, alertas, carga y validacion productiva. El cambio no agrega dependencias, no contrata servicios, no cambia SQLite ni proporciona alta disponibilidad.

## Validacion

Ocho pruebas nuevas verifican clave/activacion, acceso solo por cabecera, ausencia de datos sensibles, identificadores propios, errores JSON/413/500, contadores y desconexiones simuladas, fallo del logger e independencia de SQLite. La bateria completa registra 42 pruebas aprobadas.
