import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Garante UMA única instância do conteúdo na tela, não importa quantas vezes o componente seja montado
 * (ex.: <JukeboxPlayer /> no App e de novo dentro de uma aba). Também renderiza em document.body, então
 * o conteúdo continua visível mesmo se quem o montou estiver dentro de uma aba oculta (display: none).
 * Se a instância principal for desmontada, a próxima assume.
 */
const registry = { ids: [], listeners: new Set() };
const notify = () => registry.listeners.forEach((fn) => fn());

export default function SingletonPortal({ children }) {
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = Symbol('singleton');
  const [primary, setPrimary] = useState(false);

  useEffect(() => {
    const id = idRef.current;
    const sync = () => setPrimary(registry.ids[0] === id);
    registry.ids.push(id);
    registry.listeners.add(sync);
    notify();
    return () => {
      registry.ids = registry.ids.filter((x) => x !== id);
      registry.listeners.delete(sync);
      notify();
    };
  }, []);

  if (!primary || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
