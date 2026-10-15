import type { Suborden } from './api';

// Usamos la fecha de entrega y el mismo huso horario para todos los vendedores.
function mesDeFecha(fecha: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
  }).format(fecha);
}

export function resumirVentas(subordenes: Suborden[], hoy = new Date()) {
  const entregadas = subordenes.filter(suborden => suborden.estado === 'ENTREGADA');
  const [anio, mes] = mesDeFecha(hoy).split('-').map(Number);
  const meses = Array.from({ length: 12 }, (_, indice) => ({
    mes: mesDeFecha(new Date(Date.UTC(anio, mes - 12 + indice, 15))),
    ventas: 0, centavos: 0,
  }));
  const productos = new Map<number, { idProducto: number; nombre: string; unidades: number }>();
  let totalCentavos = 0;

  for (const venta of entregadas) {
    const centavos = Math.round(Number(venta.total) * 100);
    totalCentavos += centavos;
    const mesEntrega = mesDeFecha(new Date(venta.actualizadoEn));
    const mesVenta = meses.find(item => item.mes === mesEntrega);
    if (mesVenta) {
      mesVenta.ventas++;
      mesVenta.centavos += centavos;
    }
    // Las líneas históricas siguen disponibles aunque el producto se haya borrado.
    for (const item of venta.items) {
      const producto = productos.get(item.idProducto) ?? { idProducto: item.idProducto, nombre: item.nombre, unidades: 0 };
      producto.unidades += item.cantidad;
      productos.set(item.idProducto, producto);
    }
  }

  return {
    ventas: entregadas.length,
    montoTotal: (totalCentavos / 100).toFixed(2),
    montoPromedio: entregadas.length ? (Math.round(totalCentavos / entregadas.length) / 100).toFixed(2) : '0.00',
    productos: [...productos.values()].sort((a, b) => b.unidades - a.unidades || a.idProducto - b.idProducto).slice(0, 5),
    meses: meses.map(item => ({ mes: item.mes, ventas: item.ventas, monto: (item.centavos / 100).toFixed(2) })),
  };
}
