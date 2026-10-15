# BulkMarket Web

Interfaz React responsive de BulkMarket: registro de comprador/vendedor, inicio de sesión, edición y baja del negocio.

Mis Compras está disponible para compradores y vendedores, con Seguimiento (compras en curso) e Historial (compras completadas). La orden general aparece completada únicamente cuando todas sus subórdenes están entregadas o cerradas; las rechazadas y canceladas se consideran cerradas.

Pedidos es una sección independiente y exclusiva de vendedores: Pedidos recibidos muestra sus ventas pendientes, confirmadas, preparadas o enviadas, con las acciones de gestión; Historial reúne las entregadas, rechazadas y canceladas. El cierre de la suborden de ese vendedor basta para que aparezca en su historial de ventas, aunque la orden general del comprador siga en curso por otros vendedores. Cada sección consulta solamente su listado de compras o ventas. Usá Actualizar pedidos para consultar cambios de la otra parte. El vendedor actualiza stock desde Mis Productos → Agregar stock.

En pantallas de hasta 1100 px, la navegación se abre desde Menú, con todas las secciones en una lista vertical y la sección activa resaltada. El carrito y el cierre de sesión siguen visibles en la barra. El menú se cierra al elegir una sección, tocar fuera o pulsar Escape; al volver a escritorio reaparecen las solapas.

Crea `.env`, ejecutá `npm install` y luego `npm run dev`.

Para Vercel y la migración de datos e imágenes, seguí [la guía de despliegue](../DEPLOYMENT.md).
