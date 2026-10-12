import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cliente } from '../users/user.entity';
import { Negocio } from '../business/business.entity';
import { CarritoItem } from './cart-item.entity';
import { Producto } from './products.entity';
import { PrecioEscalonado, precioParaCantidad } from './price-tier.entity';
import { EstadoSuborden, LineaPedido, Pedido, Suborden, TRANSICIONES } from './order.entity';
import { ConfirmarPedidoDto } from './dto/confirmar-pedido.dto';

const centavos = (valor: string) => BigInt(valor.replace('.', ''));
const importe = (valor: bigint) => `${valor / 100n}.${(valor % 100n).toString().padStart(2, '0')}`;

@Injectable()
export class PedidosService {
  constructor(private readonly db: DataSource) {}

  confirmar(idCliente: number, dto: ConfirmarPedidoDto) {
    return this.db.transaction(async manager => {
      const cliente = await manager.getRepository(Cliente).findOne({ where: { idCliente }, lock: { mode: 'pessimistic_write' } });
      if (!cliente) throw new UnauthorizedException('La cuenta ya no existe.');
      const pedidos = manager.getRepository(Pedido);
      const anterior = await pedidos.findOne({ where: { idCliente, claveConfirmacion: dto.claveConfirmacion }, relations: { subordenes: true } });
      if (anterior) return anterior;
      const carrito = manager.getRepository(CarritoItem);
      const filas = await carrito.find({ where: { idCliente }, order: { idProducto: 'ASC' } });
      if (!filas.length || filas.length !== dto.items.length || filas.some(fila => !dto.items.some(item =>
        item.idProducto === fila.idProducto && item.version === fila.version && item.cantidad === fila.cantidad))) {
        throw new ConflictException('El carrito cambió. Revisalo antes de confirmar.');
      }
      // Una suborden por vendedor: cada una junta sus líneas y su propio total.
      const grupos = new Map<number, { items: LineaPedido[]; total: bigint }>();
      for (const fila of filas) {
        const producto = await manager.getRepository(Producto).findOne({ where: { idProducto: fila.idProducto }, loadEagerRelations: false, lock: { mode: 'pessimistic_write' } });
        if (!producto || producto.version !== fila.version) throw new ConflictException('Un producto cambió. Revisá el carrito.');
        if (producto.idNegocio === cliente.idNegocio) throw new ConflictException('No podés comprar productos de tu propio negocio.');
        if (fila.cantidad < (producto.cantidadMinimaCompra ?? 1) || fila.cantidad > producto.stock) throw new ConflictException(`No hay stock suficiente o no se cumple el mínimo de ${producto.nombre}.`);
        const tramos = await manager.getRepository(PrecioEscalonado).findBy({ idProducto: producto.idProducto });
        const precioUnitario = precioParaCantidad(producto.precioBase, tramos, fila.cantidad);
        const subtotal = centavos(precioUnitario) * BigInt(fila.cantidad);
        const grupo = grupos.get(producto.idNegocio) ?? { items: [], total: 0n };
        grupo.items.push({ idProducto: producto.idProducto, nombre: producto.nombre, cantidad: fila.cantidad, precioUnitario, subtotal: importe(subtotal) });
        grupo.total += subtotal;
        grupos.set(producto.idNegocio, grupo);
      }
      if (dto.entregas.length !== grupos.size || dto.entregas.some(entrega => !grupos.has(entrega.idNegocio))) {
        throw new ConflictException('Indicá la entrega y la condición de pago de cada vendedor del carrito.');
      }
      const negocios = manager.getRepository(Negocio);
      const comprador = await negocios.findOne({ where: { idNegocio: cliente.idNegocio } });
      let total = 0n;
      const subordenes: Partial<Suborden>[] = [];
      for (const entrega of [...dto.entregas].sort((a, b) => a.idNegocio - b.idNegocio)) {
        const grupo = grupos.get(entrega.idNegocio)!;
        const vendedor = await negocios.findOne({ where: { idNegocio: entrega.idNegocio }, lock: { mode: 'pessimistic_read' } });
        if (!vendedor || grupo.total < centavos(vendedor.montoMinimoOrden)) throw new ConflictException(`No se alcanza el monto mínimo de ${vendedor?.nombreComercial ?? 'un vendedor'}.`);
        total += grupo.total;
        subordenes.push({ idNegocioVendedor: vendedor.idNegocio, nombreVendedor: vendedor.nombreComercial,
          idNegocioComprador: cliente.idNegocio, nombreComprador: comprador?.nombreComercial ?? 'Comprador',
          direccionEntrega: entrega.direccionEntrega, condicionPago: entrega.condicionPago, items: grupo.items, total: importe(grupo.total) });
      }
      if (importe(total) !== dto.total) throw new ConflictException('El importe cambió. Revisá el carrito antes de confirmar.');
      for (const { items } of subordenes) {
        for (const item of items!) {
          // El movimiento de inventario no es una edición comercial: conserva la versión del carrito.
          await manager.query('UPDATE producto SET stock = stock - $1 WHERE id_producto = $2', [item.cantidad, item.idProducto]);
        }
      }
      const pedido = await pedidos.save(pedidos.create({ idCliente, idNegocioComprador: cliente.idNegocio,
        claveConfirmacion: dto.claveConfirmacion, total: importe(total) }));
      const repo = manager.getRepository(Suborden);
      pedido.subordenes = await repo.save(subordenes.map(suborden => repo.create({ ...suborden, idPedido: pedido.idPedido })));
      await carrito.delete({ idCliente });
      return pedido;
    });
  }

  listarCompras(idNegocio: number) {
    return this.db.getRepository(Pedido).find({ where: { idNegocioComprador: idNegocio }, relations: { subordenes: true },
      order: { idPedido: 'DESC', subordenes: { idSuborden: 'ASC' } } });
  }

  listarVentas(idNegocio: number) {
    return this.db.getRepository(Suborden).find({ where: { idNegocioVendedor: idNegocio }, order: { idSuborden: 'DESC' } });
  }

  cambiarEstado(idSuborden: number, idNegocio: number, estado: EstadoSuborden) {
    return this.db.transaction(async manager => {
      const repo = manager.getRepository(Suborden);
      const suborden = await repo.findOne({ where: { idSuborden }, lock: { mode: 'pessimistic_write' } });
      const parte = suborden?.idNegocioVendedor === idNegocio ? 'vendedor' : suborden?.idNegocioComprador === idNegocio ? 'comprador' : null;
      if (!suborden || !parte) throw new NotFoundException('Pedido no encontrado.');
      if (!TRANSICIONES[suborden.estado][parte].includes(estado)) {
        throw new ConflictException(`No podés pasar este pedido de ${suborden.estado.toLowerCase()} a ${estado.toLowerCase()}.`);
      }
      if (estado === EstadoSuborden.RECHAZADA || estado === EstadoSuborden.CANCELADA) {
        // Devuelve el stock descontado al confirmar. Los productos eliminados se ignoran.
        for (const item of [...suborden.items].sort((a, b) => a.idProducto - b.idProducto)) {
          await manager.query('UPDATE producto SET stock = stock + $1 WHERE id_producto = $2', [item.cantidad, item.idProducto]);
        }
      }
      suborden.estado = estado;
      return repo.save(suborden);
    });
  }
}
