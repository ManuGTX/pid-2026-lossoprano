const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');

function cargar(archivo, modulos) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src', archivo), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compiled, { exports, require: nombre => modulos[nombre], Intl, Date, isNaN, parseFloat });
  return exports;
}

async function pantalla(esVendedor = false) {
  const suborden = { idSuborden: 1, idPedido: 1, nombreComprador: 'Comercio', nombreVendedor: 'Marca A', estado: 'ENVIADA',
    total: '10.00', items: [{ idProducto: 1, nombre: 'Producto activo', cantidad: 1, subtotal: '10.00' }],
    direccionEntrega: 'Calle 123', condicionPago: 'CONTADO', creadoEn: '2026-10-12T12:00:00Z', actualizadoEn: '2026-10-14T12:00:00Z' };
  const datos = [
    { idPedido: 1, estado: 'EN_CURSO', total: '10.00', creadoEn: suborden.creadoEn, subordenes: [suborden] },
    { idPedido: 2, estado: 'COMPLETADA', total: '20.00', creadoEn: suborden.creadoEn,
      subordenes: [{ ...suborden, idSuborden: 2, idPedido: 2, nombreVendedor: 'Marca B', estado: 'CANCELADA', total: '20.00' }] },
  ];
  const estados = [];
  let indice = 0;
  let efecto;
  let consultasVentas = 0;
  const react = {
    useState(inicial) {
      const i = indice++;
      if (!(i in estados)) estados[i] = inicial;
      return [estados[i], valor => { estados[i] = typeof valor === 'function' ? valor(estados[i]) : valor; }];
    },
    useEffect(callback) { efecto ??= callback; },
  };
  const componente = cargar('Pedidos.tsx', { react, 'react/jsx-runtime': jsx,
    './utils': cargar('utils.ts', {}), './api': { api: {
      misCompras: async () => datos,
      misVentas: async () => { consultasVentas++; return [suborden]; },
    } },
  }).default;
  function render() { indice = 0; return componente({ token: 'token', esVendedor }); }
  function boton(nodo, texto) {
    if (!nodo || typeof nodo !== 'object') return;
    if (nodo.type === 'button' && nodo.props.children === texto) return nodo;
    for (const hijo of [nodo.props?.children].flat(Infinity)) {
      const encontrado = boton(hijo, texto);
      if (encontrado) return encontrado;
    }
  }
  render();
  efecto();
  await new Promise(resolve => setImmediate(resolve));
  return { datos, html: () => renderToStaticMarkup(render()), consultasVentas: () => consultasVentas,
    click: texto => { const accion = boton(render(), texto); assert.ok(accion, texto); accion.props.onClick(); } };
}

test('el comprador consulta seguimiento e historial con el estado general y los detalles históricos', async () => {
  const p = await pantalla();
  assert.match(p.html(), /Pedido #1/);
  assert.match(p.html(), /En curso/);
  assert.doesNotMatch(p.html(), /Pedido #2|Pedidos recibidos|Marcar entregada/);
  assert.equal(p.consultasVentas(), 0);
  p.click('Historial');
  assert.match(p.html(), /Pedido #2/);
  assert.match(p.html(), /Completada/);
  assert.match(p.html(), /Cancelada/);
  assert.match(p.html(), /Calle 123/);
  assert.doesNotMatch(p.html(), /Pedido #1/);
});

test('al actualizar, la orden completada deja seguimiento y aparece en historial', async () => {
  const p = await pantalla();
  p.datos[0].estado = 'COMPLETADA';
  p.datos[0].subordenes[0].estado = 'ENTREGADA';
  p.click('Actualizar pedidos');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(p.html(), /No tenés compras en curso/);
  assert.doesNotMatch(p.html(), /Pedido #1/);
  p.click('Historial');
  assert.match(p.html(), /Pedido #1/);
  assert.match(p.html(), /Entregada/);
});

test('el vendedor comienza en pedidos recibidos y tiene acciones de gestión y acceso a sus compras', async () => {
  const p = await pantalla(true);
  assert.match(p.html(), /Pedidos recibidos/);
  assert.match(p.html(), /Orden #1 · Comercio/);
  assert.match(p.html(), /Marcar entregada/);
  assert.match(p.html(), /Mis Productos/);
  assert.equal(p.consultasVentas(), 1);
  p.click('Seguimiento');
  assert.match(p.html(), /Pedido #1/);
  assert.doesNotMatch(p.html(), /Marcar entregada/);
});
