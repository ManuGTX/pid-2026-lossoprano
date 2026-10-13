import { ReactNode, useLayoutEffect, useRef } from 'react';

export default function ModalProducto({ titulo, idTitulo, ocupado, alCerrar, compacto = false, children }: {
  titulo: string; idTitulo: string; ocupado: boolean; alCerrar: () => void; compacto?: boolean; children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const elemento = dialogo.current!;
    const cuerpo = document.body;
    const raiz = document.documentElement;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const propiedades = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'] as const;
    const estilosPrevios = propiedades.map(propiedad => ({
      propiedad,
      valor: cuerpo.style.getPropertyValue(propiedad),
      prioridad: cuerpo.style.getPropertyPriority(propiedad),
    }));
    const overflowPrevio = raiz.style.getPropertyValue('overflow');
    const prioridadOverflow = raiz.style.getPropertyPriority('overflow');
    const anchoScrollbar = window.innerWidth - raiz.clientWidth;
    const paddingDerecho = parseFloat(window.getComputedStyle(cuerpo).paddingRight) || 0;
    cuerpo.style.position = 'fixed';
    cuerpo.style.top = `-${scrollY}px`;
    cuerpo.style.left = `-${scrollX}px`;
    cuerpo.style.width = '100%';
    cuerpo.style.overflow = 'hidden';
    cuerpo.style.paddingRight = `${paddingDerecho + anchoScrollbar}px`;
    raiz.style.overflow = 'hidden';
    elemento.showModal();
    elemento.querySelector<HTMLInputElement>('input:not([type="hidden"]), textarea, select')?.focus();
    return () => {
      elemento.close();
      for (const { propiedad, valor, prioridad } of estilosPrevios) {
        if (valor) cuerpo.style.setProperty(propiedad, valor, prioridad);
        else cuerpo.style.removeProperty(propiedad);
      }
      if (overflowPrevio) raiz.style.setProperty('overflow', overflowPrevio, prioridadOverflow);
      else raiz.style.removeProperty('overflow');
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
    };
  }, []);
  return <dialog ref={dialogo} className={`editar-producto-modal${compacto ? ' stock-modal' : ''}`} aria-labelledby={idTitulo}
    onCancel={evento => { evento.preventDefault(); if (!ocupado) alCerrar(); }}
    onClick={evento => { if (evento.target === evento.currentTarget && !ocupado) alCerrar(); }}>
    <div className="editar-producto-contenido">
      <header><h2 id={idTitulo}>{titulo}</h2>
        <button type="button" className="link" disabled={ocupado} onClick={alCerrar}>Cerrar ✕</button></header>
      {children}
    </div>
  </dialog>;
}
