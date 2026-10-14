import { ReactNode, useEffect, useState } from 'react';
import { api, EstadoSuborden, Pedido, Suborden } from './api';
import { ACCIONES_COMPRADOR, ACCIONES_VENDEDOR, CONDICIONES_PAGO, ESTADOS_PEDIDO, ESTADOS_SUBORDEN, formatCurrency } from './utils';

type Vista = 'ventas' | 'seguimiento' | 'historial';
const fecha = (valor: string) => new Date(valor).toLocaleDateString('es-AR');

export default function Pedidos({ token, esVendedor }: { token: string; esVendedor: boolean }) {
  const [vista, setVista] = useState<Vista>(esVendedor ? 'ventas' : 'seguimiento');
  const [compras, setCompras] = useState<Pedido[]>([]);
  const [ventas, setVentas] = useState<Suborden[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enCurso, setEnCurso] = useState<number | null>(null);

  async function cargar() {
    try {
      const [misCompras, misVentas] = await Promise.all([api.misCompras(token), esVendedor ? api.misVentas(token) : []]);
      setCompras(misCompras);
      setVentas(misVentas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.');
    } finally { setCargando(false); }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function cambiarEstado(suborden: Suborden, estado: EstadoSuborden) {
    const devuelveStock = estado === 'RECHAZADA' || estado === 'CANCELADA';
    if (devuelveStock && !window.confirm(`¿Seguro que querés ${estado === 'RECHAZADA' ? 'rechazar' : 'cancelar'} la orden #${suborden.idSuborden}? No se puede deshacer.`)) return;
    setEnCurso(suborden.idSuborden);
    setError('');
    try {
      await api.cambiarEstadoSuborden(suborden.idSuborden, estado, token);
      if (devuelveStock) window.dispatchEvent(new Event('stock-actualizado'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el pedido.');
    } finally {
      // La otra parte pudo haber cambiado el estado: se vuelve a leer siempre.
      await cargar();
      setEnCurso(null);
    }
  }

  const acciones = (suborden: Suborden, disponibles: typeof ACCIONES_VENDEDOR) => disponibles[suborden.estado]?.map(accion =>
    <button key={accion.estado} type="button" className={accion.estado === 'RECHAZADA' || accion.estado === 'CANCELADA' ? 'danger' : 'primary'}
      disabled={enCurso !== null} onClick={() => cambiarEstado(suborden, accion.estado)}>{accion.etiqueta}</button>);

  const comprasVisibles = compras.filter(pedido => vista === 'historial' ? pedido.estado === 'COMPLETADA' : pedido.estado === 'EN_CURSO');
  const vistas: { id: Vista; etiqueta: string }[] = [
    ...(esVendedor ? [{ id: 'ventas' as const, etiqueta: 'Pedidos recibidos' }] : []),
    { id: 'seguimiento', etiqueta: 'Seguimiento' }, { id: 'historial', etiqueta: 'Historial' },
  ];

  return (
    <>
      <section className="welcome">
        <span className="eyebrow">PEDIDOS</span>
        <h1>{esVendedor ? 'Gestioná tus pedidos' : 'Seguí tus pedidos'}</h1>
        <p>{esVendedor ? 'Administrá los pedidos recibidos y actualizá tu stock desde Mis Productos.' : 'Consultá el seguimiento de tus compras y el historial de órdenes completadas.'}</p>
      </section>
      <section className="pedidos">
        <div className="pedidos-tabs" aria-label="Tipo de pedidos">
          {vistas.map(opcion => <button key={opcion.id} type="button" aria-pressed={vista === opcion.id}
            className={vista === opcion.id ? 'active' : ''} onClick={() => setVista(opcion.id)}>{opcion.etiqueta}</button>)}
        </div>
        <button type="button" className="link pedidos-actualizar" disabled={cargando || enCurso !== null}
          onClick={() => { setError(''); setCargando(true); void cargar(); }}>Actualizar pedidos</button>
        {error && <p className="error" role="alert">{error}</p>}
        {cargando && <p className="muted">Cargando pedidos…</p>}
        {!cargando && vista === 'ventas' && (ventas.length === 0 ? <p className="muted">Todavía no recibiste pedidos.</p> : ventas.map(suborden =>
          <TarjetaSuborden key={suborden.idSuborden} suborden={suborden}
            titulo={`Orden #${suborden.idSuborden} · ${suborden.nombreComprador}`} detalle={`Pedido #${suborden.idPedido} del ${fecha(suborden.creadoEn)}`}>
            {acciones(suborden, ACCIONES_VENDEDOR)}
          </TarjetaSuborden>))}
        {!cargando && vista !== 'ventas' && (comprasVisibles.length === 0 ? <p className="muted">{vista === 'historial' ? 'Todavía no tenés órdenes completadas.' : 'No tenés compras en curso.'}</p> : comprasVisibles.map(pedido =>
          <article className="pedido" key={pedido.idPedido}>
            <header>
              <h2>Pedido #{pedido.idPedido}</h2>
              <span className={`estado-pedido ${pedido.estado.toLowerCase()}`}>{ESTADOS_PEDIDO[pedido.estado]}</span>
            </header>
            <p className="muted">{fecha(pedido.creadoEn)} · Total {formatCurrency(pedido.total)}</p>
            <p className="muted">{pedido.estado === 'COMPLETADA' ? 'Todas las subórdenes están entregadas o cerradas.' : 'La orden se completará cuando todas sus subórdenes estén entregadas o cerradas.'} Las rechazadas o canceladas se consideran cerradas.</p>
            {pedido.subordenes.map(suborden =>
              <TarjetaSuborden key={suborden.idSuborden} suborden={suborden} titulo={suborden.nombreVendedor} detalle={`Orden #${suborden.idSuborden}`}>
                {acciones(suborden, ACCIONES_COMPRADOR)}
              </TarjetaSuborden>)}
          </article>))}
      </section>
    </>
  );
}

function TarjetaSuborden({ suborden, titulo, detalle, children }: { suborden: Suborden; titulo: string; detalle: string; children?: ReactNode }) {
  return (
    <article className="suborden">
      <header>
        <div>
          <b>{titulo}</b>
          <small>{detalle}</small>
        </div>
        <span className={`estado-suborden ${suborden.estado.toLowerCase()}`}>{ESTADOS_SUBORDEN[suborden.estado]}</span>
      </header>
      <ul className="suborden-items">
        {suborden.items.map(item => <li key={item.idProducto}>
          <span>{item.cantidad} × {item.nombre}</span>
          <span>{formatCurrency(item.subtotal)}</span>
        </li>)}
      </ul>
      <div className="suborden-total"><span>Total</span><b>{formatCurrency(suborden.total)}</b></div>
      <small>Entrega: {suborden.direccionEntrega} · Pago: {CONDICIONES_PAGO[suborden.condicionPago]} (simulado)</small>
      <small>Última actualización: {new Date(suborden.actualizadoEn).toLocaleString('es-AR')}</small>
      {children && <div className="suborden-acciones">{children}</div>}
    </article>
  );
}
