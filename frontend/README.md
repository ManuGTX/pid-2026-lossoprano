# BulkMarket Web

Interfaz React responsive de BulkMarket: registro de comprador/vendedor, inicio de sesión, edición y baja del negocio.

Mis Compras está disponible para compradores y vendedores, con Seguimiento (compras en curso) e Historial (compras completadas). La orden general aparece completada únicamente cuando todas sus subórdenes están entregadas o cerradas; las rechazadas y canceladas se consideran cerradas.

Pedidos es una sección independiente y exclusiva de vendedores: Pedidos recibidos muestra sus ventas pendientes, confirmadas, preparadas o enviadas, con las acciones de gestión; Historial reúne las entregadas, rechazadas y canceladas. El cierre de la suborden de ese vendedor basta para que aparezca en su historial de ventas, aunque la orden general del comprador siga en curso por otros vendedores. Cada sección consulta solamente su listado de compras o ventas. Usá Actualizar pedidos para consultar cambios de la otra parte. El vendedor actualiza stock desde Mis Productos → Agregar stock.

Crea `.env`, ejecutá `npm install` y luego `npm run dev`.

Para Vercel y la migración de datos e imágenes, seguí [la guía de despliegue](../DEPLOYMENT.md).
