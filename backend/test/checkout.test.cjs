require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PedidosService } = require('../dist/products/orders.service');
const { TRANSICIONES } = require('../dist/products/order.entity');

// Comprador (negocio 1) con productos de dos vendedores (negocios 2 y 3) en el carrito.
function escenario() {
  let estado = { stock: { 1: 10, 2: 10 }, carrito: [{ idProducto: 1, version: 1, cantidad: 3 }, { idProducto: 2, version: 1, cantidad: 2 }], pedidos: [], subordenes: [] };
  const productos = {
    1: { idProducto: 1, version: 1, idNegocio: 2, nombre: 'Producto A', precioBase: '10.00' },
    2: { idProducto: 2, version: 1, idNegocio: 3, nombre: 'Producto B', precioBase: '5.00' },
  };
  const negocios = {
    1: { idNegocio: 1, nombreComercial: 'Comprador', montoMinimoOrden: '0.00' },
    2: { idNegocio: 2, nombreComercial: 'Vendedor A', montoMinimoOrden: '0.00' },
    3: { idNegocio: 3, nombreComercial: 'Vendedor B', montoMinimoOrden: '0.00' },
  };
  const manager = {
    getRepository: entidad => ({
      Cliente: { findOne: async () => ({ idCliente: 1, idNegocio: 1 }) },
      CarritoItem: { find: async () => estado.carrito, delete: async () => { estado.carrito = []; } },
      Producto: { findOne: async ({ where }) => productos[where.idProducto] && { ...productos[where.idProducto], stock: estado.stock[where.idProducto] } },
      PrecioEscalonado: { findBy: async ({ idProducto }) => idProducto === 1 ? [{ cantidadMinima: 3, precioUnitario: '8.00' }] : [] },
      Negocio: { findOne: async ({ where }) => negocios[where.idNegocio] },
      Pedido: {
        findOne: async ({ where }) => {
          const pedido = estado.pedidos.find(p => p.claveConfirmacion === where.claveConfirmacion);
          return pedido && { ...pedido, subordenes: estado.subordenes.filter(s => s.idPedido === pedido.idPedido) };
        },
        create: datos => datos,
        save: async datos => { if (estado.fallarGuardado) throw new Error('Fallo de escritura'); const pedido = { ...datos, idPedido: 1 }; estado.pedidos.push(pedido); return pedido; },
      },
      Suborden: {
        create: datos => datos,
        findOne: async ({ where }) => { const suborden = estado.subordenes.find(s => s.idSuborden === where.idSuborden); return suborden && structuredClone(suborden); },
        save: async datos => {
          if (!Array.isArray(datos)) return Object.assign(estado.subordenes.find(s => s.idSuborden === datos.idSuborden), datos);
          const nuevas = datos.map((suborden, i) => ({ estado: 'PENDIENTE', ...suborden, idSuborden: i + 1 }));
          estado.subordenes.push(...nuevas);
          return nuevas;
        },
      },
    }[entidad.name]),
    query: async (sql, [cantidad, idProducto]) => { estado.stock[idProducto] += sql.includes('stock +') ? cantidad : -cantidad; },
  };
  const servicio = new PedidosService({ transaction: async callback => {
    const antes = structuredClone(estado);
    try { return await callback(manager); } catch (error) { estado = antes; throw error; }
  } });
  return { servicio, estado: () => estado, productos, negocios, dto: { items: [...estado.carrito], claveConfirmacion: 'clave', total: '34.00', entregas: [
    { idNegocio: 2, direccionEntrega: 'Calle 123', condicionPago: 'CONTADO' },
    { idNegocio: 3, direccionEntrega: 'Depósito 9', condicionPago: 'CUENTA_CORRIENTE' },
  ] } };
}

test('checkout genera una orden general y una suborden por vendedor; descuenta una sola vez ante reintentos', async () => {
  const e = escenario();
  const pedido = await e.servicio.confirmar(1, e.dto);
  assert.equal(pedido.total, '34.00');
  assert.deepEqual(pedido.subordenes.map(s => [s.idNegocioVendedor, s.nombreVendedor, s.total, s.direccionEntrega, s.condicionPago, s.estado]), [
    [2, 'Vendedor A', '24.00', 'Calle 123', 'CONTADO', 'PENDIENTE'],
    [3, 'Vendedor B', '10.00', 'Depósito 9', 'CUENTA_CORRIENTE', 'PENDIENTE'],
  ]);
  assert.equal(pedido.subordenes[0].items[0].precioUnitario, '8.00');
  assert.equal(pedido.subordenes[0].nombreComprador, 'Comprador');
  assert.deepEqual(e.estado().stock, { 1: 7, 2: 8 });
  assert.equal(e.estado().carrito.length, 0);
  const reintento = await e.servicio.confirmar(1, e.dto);
  assert.equal(reintento.idPedido, pedido.idPedido);
  assert.equal(reintento.subordenes.length, 2);
  assert.deepEqual(e.estado().stock, { 1: 7, 2: 8 });
  assert.equal(e.estado().pedidos.length, 1);
});

test('checkout rechaza stock insuficiente, versión vieja, precio distinto, productos propios y entregas que no coinciden', async () => {
  for (const alterar of [
    e => { e.estado().stock[1] = 2; }, e => { e.productos[2].version = 2; }, e => { e.dto.total = '1.00'; },
    e => { e.productos[1].idNegocio = 1; }, e => { e.dto.items = []; },
    e => { e.dto.entregas.pop(); }, e => { e.dto.entregas[1].idNegocio = 9; },
  ]) {
    const e = escenario(); alterar(e);
    const antes = structuredClone(e.estado());
    await assert.rejects(e.servicio.confirmar(1, e.dto), error => error.getStatus() === 409);
    assert.deepEqual(e.estado(), antes);
  }
});

test('cada suborden valida el monto mínimo de su vendedor', async () => {
  const e = escenario();
  e.negocios[3].montoMinimoOrden = '10.01';
  await assert.rejects(e.servicio.confirmar(1, e.dto), /mínimo de Vendedor B/);
  assert.deepEqual(e.estado().stock, { 1: 10, 2: 10 });
  e.negocios[3].montoMinimoOrden = '10.00';
  assert.equal((await e.servicio.confirmar(1, e.dto)).subordenes.length, 2);
});

test('un fallo al guardar el pedido revierte el descuento y conserva el carrito', async () => {
  const e = escenario();
  e.estado().fallarGuardado = true;
  await assert.rejects(e.servicio.confirmar(1, e.dto), /Fallo de escritura/);
  assert.deepEqual(e.estado().stock, { 1: 10, 2: 10 });
  assert.equal(e.estado().carrito.length, 2);
  assert.equal(e.estado().pedidos.length, 0);
  assert.equal(e.estado().subordenes.length, 0);
});

test('el vendedor avanza su suborden paso a paso y solo las partes pueden cambiarla', async () => {
  const e = escenario();
  await e.servicio.confirmar(1, e.dto);
  const conflicto = error => error.getStatus() === 409;
  await assert.rejects(e.servicio.cambiarEstado(1, 2, 'ENVIADA'), conflicto);
  await assert.rejects(e.servicio.cambiarEstado(1, 3, 'CONFIRMADA'), error => error.getStatus() === 404);
  await assert.rejects(e.servicio.cambiarEstado(99, 2, 'CONFIRMADA'), error => error.getStatus() === 404);
  await assert.rejects(e.servicio.cambiarEstado(1, 1, 'CONFIRMADA'), conflicto);
  for (const estado of ['CONFIRMADA', 'PREPARADA']) assert.equal((await e.servicio.cambiarEstado(1, 2, estado)).estado, estado);
  await assert.rejects(e.servicio.cambiarEstado(1, 1, 'CANCELADA'), conflicto);
  for (const estado of ['ENVIADA', 'ENTREGADA']) assert.equal((await e.servicio.cambiarEstado(1, 2, estado)).estado, estado);
  await assert.rejects(e.servicio.cambiarEstado(1, 2, 'RECHAZADA'), conflicto);
  assert.equal(e.estado().subordenes[1].estado, 'PENDIENTE');
  assert.deepEqual(e.estado().stock, { 1: 7, 2: 8 });
});

test('rechazar o cancelar una suborden devuelve solo su stock y es definitivo', async () => {
  const e = escenario();
  await e.servicio.confirmar(1, e.dto);
  assert.equal((await e.servicio.cambiarEstado(2, 3, 'RECHAZADA')).estado, 'RECHAZADA');
  assert.deepEqual(e.estado().stock, { 1: 7, 2: 10 });
  await assert.rejects(e.servicio.cambiarEstado(2, 3, 'CONFIRMADA'), error => error.getStatus() === 409);
  await e.servicio.cambiarEstado(1, 2, 'CONFIRMADA');
  assert.equal((await e.servicio.cambiarEstado(1, 1, 'CANCELADA')).estado, 'CANCELADA');
  assert.deepEqual(e.estado().stock, { 1: 10, 2: 10 });
  await assert.rejects(e.servicio.cambiarEstado(1, 1, 'CANCELADA'), error => error.getStatus() === 409);
  assert.deepEqual(e.estado().stock, { 1: 10, 2: 10 });
});

test('entregada, rechazada y cancelada son estados finales', () => {
  assert.deepEqual(Object.keys(TRANSICIONES), ['PENDIENTE', 'CONFIRMADA', 'PREPARADA', 'ENVIADA', 'ENTREGADA', 'RECHAZADA', 'CANCELADA']);
  for (const estado of ['ENTREGADA', 'RECHAZADA', 'CANCELADA']) assert.deepEqual(TRANSICIONES[estado], { vendedor: [], comprador: [] });
});
