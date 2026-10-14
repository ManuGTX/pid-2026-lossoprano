# BulkMarket Web

Interfaz React responsive de BulkMarket: registro de comprador/vendedor, inicio de sesión, edición y baja del negocio.

En Pedidos, el vendedor administra los pedidos recibidos y puede consultar sus propias compras. El comprador dispone de Seguimiento (órdenes en curso) e Historial (órdenes completadas), con los estados y datos históricos de cada suborden. La orden general aparece completada únicamente cuando todas sus subórdenes están entregadas o cerradas; las rechazadas y canceladas se consideran cerradas. Usá Actualizar pedidos para consultar cambios de la otra parte. El vendedor actualiza stock desde Mis Productos → Agregar stock.

Crea `.env`, ejecutá `npm install` y luego `npm run dev`.

Para Vercel y la migración de datos e imágenes, seguí [la guía de despliegue](../DEPLOYMENT.md).
