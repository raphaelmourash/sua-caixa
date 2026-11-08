import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Abas "autoexplicativas": cada seção mostra ícone, título, uma linha dizendo o que ela faz
 * e (opcional) um contador. Só monta uma seção quando ela é aberta pela 1ª vez e DEPOIS a mantém
 * montada (apenas oculta), então seleção, filtros, rolagem e formulários não se perdem ao trocar de aba.
 *
 * sections: [{ id, icon, title, description, badge?, content }]
 */
export default function SectionTabs({ sections, defaultId, storageKey = 'suacaixa:aba', onChange }) {
  const [activeId, setActiveId] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* sem storage: tudo bem */ }
    return sections.some((s) => s.id === saved) ? saved : (defaultId ?? sections[0].id);
  });
  const [visited, setVisited] = useState(() => new Set([activeId]));
  const tabRefs = useRef({});

  const select = useCallback((id) => {
    setActiveId(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    try { localStorage.setItem(storageKey, id); } catch { /* ignora */ }
    if (onChange) onChange(id);
  }, [storageKey, onChange]);

  // Outras partes do app podem pedir uma aba: window.dispatchEvent(new CustomEvent('suacaixa:abrir-aba', { detail: 'downloads' }))
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  useEffect(() => {
    const handler = (e) => {
      if (sectionsRef.current.some((s) => s.id === e.detail)) select(e.detail);
    };
    window.addEventListener('suacaixa:abrir-aba', handler);
    return () => window.removeEventListener('suacaixa:abrir-aba', handler);
  }, [select]);

  const onKeyDown = (e, index) => {
    const n = sections.length;
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    const id = sections[next].id;
    select(id);
    if (tabRefs.current[id]) tabRefs.current[id].focus();
  };

  const tabId = (id) => `${storageKey}-tab-${id}`;
  const panelId = (id) => `${storageKey}-panel-${id}`;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Seções"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', // empilha sozinho em telas estreitas
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        {sections.map((s, index) => {
          const active = s.id === activeId;
          const hasBadge = s.badge !== undefined && s.badge !== null && s.badge !== 0 && s.badge !== '';
          return (
            <button
              key={s.id}
              ref={(el) => { tabRefs.current[s.id] = el; }}
              id={tabId(s.id)}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={panelId(s.id)}
              tabIndex={active ? 0 : -1}
              onClick={() => select(s.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                padding: '12px 14px',
                borderRadius: '12px',
                border: `1px solid ${active ? '#008891' : '#1e293b'}`,
                backgroundColor: active ? 'rgba(0,136,145,0.15)' : '#0b1020',
                color: '#e2e8f0',
                transition: 'background-color 0.2s, border-color 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: active ? '#22d3ee' : '#cbd5e1' }}>
                <span aria-hidden="true">{s.icon}</span>
                <span>{s.title}</span>
                {hasBadge && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#008891', color: '#fff', fontSize: '11px', padding: '1px 8px', borderRadius: '999px' }}>
                    {s.badge}
                  </span>
                )}
              </span>
              <span style={{ fontSize: '12px', lineHeight: 1.35, color: '#94a3b8' }}>{s.description}</span>
            </button>
          );
        })}
      </div>

      {sections.map((s) => (
        <div
          key={s.id}
          id={panelId(s.id)}
          role="tabpanel"
          aria-labelledby={tabId(s.id)}
          hidden={s.id !== activeId}
        >
          {visited.has(s.id) ? s.content : null}
        </div>
      ))}
    </div>
  );
}
