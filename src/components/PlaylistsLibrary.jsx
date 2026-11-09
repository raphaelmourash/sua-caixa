import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { useDownloads } from '../context/DownloadContext';
import {
  loadPlaylists, savePlaylists, uniqueName, dedupeTracks, appendUnique, reorder,
  duplicateIndexes, exportBackup, parseBackup, mergeImported,
} from '../services/playlistStore';

const C = { border: '#1e293b', bg: '#0b1020', row: '#0b0f19', muted: '#94a3b8', dim: '#64748b', text: '#e2e8f0', teal: '#008891', cyan: '#22d3ee' };

const titleOf = (t, i) => (t?.title && String(t.title).trim()) || `Música ${i + 1}`;
const thumbOf = (t) => t?.thumbnail || t?.thumbnails?.[0]?.url || null;
const fmtDur = (s) => {
  if (!s || !Number.isFinite(Number(s))) return '';
  const n = Math.round(Number(s));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const fmtTotal = (tracks) => {
  const total = tracks.reduce((a, t) => a + (Number(t?.duration) || 0), 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function Cover({ p, size = 44 }) {
  const box = { width: size, height: size, borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 };
  if (p.coverUrl) return <div style={box}><img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  const thumbs = p.tracks.map(thumbOf).filter(Boolean).slice(0, 4);
  if (thumbs.length >= 4) {
    return (
      <div style={{ ...box, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {thumbs.map((u, i) => <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
      </div>
    );
  }
  if (thumbs.length > 0) return <div style={box}><img src={thumbs[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  return <div style={box}>💿</div>;
}

const sm = { fontSize: '11px', padding: '5px 9px' };

export default function PlaylistsLibrary() {
  const { setQueueAndPlay, addToQueue } = useJukebox();
  const { enqueueMany } = useDownloads();

  const [playlists, setPlaylists] = useState(() => loadPlaylists());
  const [activeName, setActiveName] = useState(null);
  const [plFilter, setPlFilter] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('manual'); // manual | az | za
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState('');
  const [destName, setDestName] = useState('');
  const [toast, setToast] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const reload = () => { setPlaylists(loadPlaylists()); setToast(null); };
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (text, undo) => {
    setToast({ text, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 9000 : 5000);
  };

  const commit = (next) => {
    const res = savePlaylists(next);
    if (!res.ok) {
      showToast('Não foi possível salvar (armazenamento cheio?). Exporte um backup e libere espaço.');
      return false;
    }
    setPlaylists(next);
    setToast(null);
    return true;
  };

  const active = playlists.find((p) => p.name === activeName) || playlists[0] || null;
  const activeIdx = active ? playlists.findIndex((p) => p.name === active.name) : -1;

  const selectPlaylist = (name) => {
    setActiveName(name);
    setSelected(new Set());
    setFilter('');
    setEditing(null);
    setDragFrom(null);
  };

  const updateActive = (changes) => commit(playlists.map((p, i) => (i === activeIdx ? { ...p, ...changes } : p)));

  const view = useMemo(() => {
    if (!active) return [];
    let rows = active.tracks.map((t, i) => ({ t, i }));
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => titleOf(r.t, r.i).toLowerCase().includes(q));
    if (sort === 'az') rows.sort((a, b) => titleOf(a.t, a.i).localeCompare(titleOf(b.t, b.i), 'pt-BR'));
    if (sort === 'za') rows.sort((a, b) => titleOf(b.t, b.i).localeCompare(titleOf(a.t, a.i), 'pt-BR'));
    return rows;
  }, [active, filter, sort]);

  const dups = useMemo(() => (active ? duplicateIndexes(active.tracks) : new Set()), [active]);
  const canDrag = sort === 'manual' && !filter.trim();
  const selectedTracks = active ? [...selected].sort((a, b) => a - b).map((i) => active.tracks[i]).filter(Boolean) : [];
  const allVisibleSelected = view.length > 0 && view.every((r) => selected.has(r.i));
  const otherPlaylists = playlists.filter((p) => p.name !== active?.name);

  // Toca apenas esta música isolada na fila (Carrinho)
  const playSingleTrack = (track) => {
    if (track) setQueueAndPlay([track], 0);
  };

  const playFromView = (pos) => setQueueAndPlay(view.map((r) => r.t), pos);
  const playAll = () => active.tracks.length && setQueueAndPlay(active.tracks, 0);
  const playShuffle = () => active.tracks.length && setQueueAndPlay(shuffled(active.tracks), 0);

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleAllVisible = () => setSelected(allVisibleSelected ? new Set() : new Set(view.map((r) => r.i)));

  const removeTracks = (indexes) => {
    if (!active || indexes.length === 0) return;
    const before = playlists;
    const drop = new Set(indexes);
    if (!commit(playlists.map((p, i) => (i === activeIdx ? { ...p, tracks: p.tracks.filter((_, k) => !drop.has(k)) } : p)))) return;
    setSelected(new Set());
    showToast(`${indexes.length} faixa${indexes.length > 1 ? 's removidas' : ' removida'} de "${active.name}".`, () => { commit(before); setToast(null); });
  };

  const moveOrCopy = (move) => {
    const dest = playlists.find((p) => p.name === destName);
    if (!active || !dest || selectedTracks.length === 0) return;
    const { tracks, added, skipped } = appendUnique(dest.tracks, selectedTracks);
    const drop = new Set(selected);
    const next = playlists.map((p) => {
      if (p.name === dest.name) return { ...p, tracks };
      if (move && p.name === active.name) return { ...p, tracks: p.tracks.filter((_, k) => !drop.has(k)) };
      return p;
    });
    if (!commit(next)) return;
    setSelected(new Set());
    showToast(`${added} faixa${added === 1 ? '' : 's'} ${move ? 'movida' : 'copiada'}${added === 1 ? '' : 's'} para "${dest.name}"${skipped ? ` (${skipped} já ${skipped === 1 ? 'estava' : 'estavam'} lá)` : ''}.`);
  };

  const removeDuplicates = () => {
    const { tracks, removed } = dedupeTracks(active.tracks);
    if (removed === 0) return;
    const before = playlists;
    if (updateActive({ tracks })) showToast(`${removed} repetida${removed > 1 ? 's removidas' : ' removida'}.`, () => { commit(before); setToast(null); });
  };

  const onDrop = (toIndex) => {
    if (dragFrom !== null && dragFrom !== toIndex && canDrag) updateActive({ tracks: reorder(active.tracks, dragFrom, toIndex) });
    setDragFrom(null);
  };

  const createPlaylist = () => {
    const name = uniqueName(playlists, 'Nova playlist');
    if (commit([...playlists, { name, folder: '', album: '', artist: '', coverUrl: '', tracks: [] }])) selectPlaylist(name);
  };

  const deletePlaylist = () => {
    const before = playlists;
    const name = active.name;
    if (!commit(playlists.filter((_, i) => i !== activeIdx))) return;
    setActiveName(null);
    setSelected(new Set());
    showToast(`Playlist "${name}" excluída (${active.tracks.length} faixas).`, () => { commit(before); setActiveName(name); setToast(null); });
  };

  const startEdit = () => { setEditing({ name: active.name, artist: active.artist, album: active.album, coverUrl: active.coverUrl }); setEditError(''); };
  const saveEdit = () => {
    const name = editing.name.trim();
    if (!name) { setEditError('Dê um nome para a playlist.'); return; }
    if (name !== active.name && playlists.some((p) => p.name === name)) { setEditError(`Já existe uma playlist chamada "${name}".`); return; }
    const next = playlists.map((p, i) => (i === activeIdx ? { ...p, name, artist: editing.artist.trim(), album: editing.album.trim(), coverUrl: editing.coverUrl.trim() } : p));
    if (commit(next)) { setActiveName(name); setEditing(null); setEditError(''); }
  };

  const doExport = () => {
    const blob = new Blob([exportBackup(playlists)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suacaixa-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup exportado para a sua pasta de downloads.');
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) { showToast(parsed.error); return; }
    const { list, added, renamed } = mergeImported(playlists, parsed.playlists);
    if (commit(list)) showToast(`${added} playlist${added > 1 ? 's importadas' : ' importada'}${renamed ? ` (${renamed} renomeada${renamed > 1 ? 's' : ''} para não sobrescrever)` : ''}.`);
  };

  const shownPlaylists = playlists.filter((p) => p.name.toLowerCase().includes(plFilter.trim().toLowerCase()));
  const input = { className: 'input-text', style: { width: '100%' } };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: '16px', alignItems: 'start' }}>
      
      {/* ---------- Coluna esquerda: biblioteca com seletor de lista/grelha ---------- */}
      <aside className="card card-bordered" style={{ padding: '14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '13px' }}>💿 MINHAS PLAYLISTS ({playlists.length})</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              type="button" 
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-teal' : 'btn-dark'}`} 
              style={{ padding: '3px 6px', fontSize: '10px' }} 
              onClick={() => setViewMode('list')}
              title="Vista em Lista"
            >
              ☰
            </button>
            <button 
              type="button" 
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-teal' : 'btn-dark'}`} 
              style={{ padding: '3px 6px', fontSize: '10px' }} 
              onClick={() => setViewMode('grid')}
              title="Vista em Grelha / Cartões"
            >
              ⊞
            </button>
            <button type="button" className="btn btn-teal btn-sm" style={sm} onClick={createPlaylist} title="Criar playlist vazia">＋ Nova</button>
          </div>
        </div>

        {playlists.length > 3 && (
          <input {...input} placeholder="🔍 Buscar playlist…" value={plFilter} onChange={(e) => setPlFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px' }} />
        )}

        {viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '460px', overflowY: 'auto' }}>
            {playlists.length === 0 && (
              <div style={{ color: C.muted, fontSize: '12px', lineHeight: 1.6, padding: '8px 4px' }}>
                Nenhuma playlist ainda. Importe um link na aba <strong>Importar &amp; Analisar</strong> e use <strong>Guardar</strong>, ou crie uma vazia em <strong>＋ Nova</strong>.
              </div>
            )}
            {shownPlaylists.map((p) => {
              const on = p.name === active?.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  data-playlist={p.name}
                  onClick={() => selectPlaylist(p.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: '10px', color: C.text,
                    border: `1px solid ${on ? C.teal : C.border}`, backgroundColor: on ? 'rgba(0,136,145,0.15)' : C.bg,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Cover p={p} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? C.cyan : C.text }}>{p.name}</span>
                    <span style={{ fontSize: '11px', color: C.dim }}>{p.tracks.length} faixas</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '460px', overflowY: 'auto', paddingRight: '2px' }}>
            {shownPlaylists.map((p) => {
              const on = p.name === active?.name;
              return (
                <div
                  key={p.name}
                  onClick={() => selectPlaylist(p.name)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left', cursor: 'pointer', padding: '8px', borderRadius: '10px', color: C.text,
                    border: `1px solid ${on ? C.teal : C.border}`, backgroundColor: on ? 'rgba(0,136,145,0.15)' : C.bg,
                    transition: 'all 0.2s ease', alignItems: 'center', textAlign: 'center'
                  }}
                >
                  <Cover p={p} size={64} />
                  <span style={{ minWidth: 0, width: '100%' }}>
                    <span style={{ fontWeight: 700, fontSize: '12px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? C.cyan : C.text }}>{p.name}</span>
                    <span style={{ fontSize: '10px', color: C.dim }}>{p.tracks.length} faixas</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', borderTop: `1px solid ${C.border}`, paddingTop: '10px' }}>
          <button type="button" className="btn btn-dark btn-sm" style={{ ...sm, flex: 1 }} onClick={doExport} disabled={playlists.length === 0} title="Salva todas as playlists em um arquivo .json">⬇ Backup</button>
          <button type="button" className="btn btn-dark btn-sm" style={{ ...sm, flex: 1 }} onClick={() => fileRef.current && fileRef.current.click()} title="Importa um backup sem sobrescrever o que já existe">⬆ Importar</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={doImport} />
        </div>
      </aside>

      {/* ---------- Coluna direita: playlist aberta ---------- */}
      <section className="card card-bordered" style={{ padding: '18px', margin: 0, minWidth: 0 }}>
        {!active ? (
          <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '40px 10px' }}>Selecione ou crie uma playlist para começar.</div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <Cover p={active} size={72} />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{active.name}</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                  {active.tracks.length} faixas{fmtTotal(active.tracks) ? ` • ${fmtTotal(active.tracks)}` : ''}
                  {active.artist ? ` • Artista: ${active.artist}` : ''}{active.album ? ` • Álbum: ${active.album}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-teal btn-sm" onClick={playAll} disabled={!active.tracks.length}>▶ Tocar tudo</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={() => addToQueue(active.tracks)} disabled={!active.tracks.length} title="Adiciona a playlist inteira à fila (Carrinho)">＋ Adicionar à Fila</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={playShuffle} disabled={!active.tracks.length}>🔀 Aleatório</button>
                <button type="button" className="btn btn-dark btn-sm" style={{ backgroundColor: '#0284c7', color: '#fff' }} onClick={() => enqueueMany(active.tracks)} disabled={!active.tracks.length} title="Envia a playlist para a Central de Downloads">⬇ Baixar playlist</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={startEdit}>✎ Editar</button>
                <button type="button" className="btn btn-red btn-sm" onClick={deletePlaylist} title="Excluir playlist (dá para desfazer)">🗑 Excluir</button>
              </div>
            </div>

            {/* Edição inline */}
            {editing && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px', marginBottom: '14px', backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
                <input {...input} aria-label="Nome" placeholder="Nome da playlist" value={editing.name} onChange={(e) => { const v = e.target.value; setEditing((o) => ({ ...o, name: v })); }} />
                <input {...input} aria-label="Artista" placeholder="Banda / Artista (opcional)" value={editing.artist} onChange={(e) => { const v = e.target.value; setEditing((o) => ({ ...o, artist: v })); }} />
                <input {...input} aria-label="Álbum" placeholder="Álbum (opcional)" value={editing.album} onChange={(e) => { const v = e.target.value; setEditing((o) => ({ ...o, album: v })); }} />
                <input {...input} aria-label="Capa" placeholder="URL da capa (opcional)" value={editing.coverUrl} onChange={(e) => { const v = e.target.value; setEditing((o) => ({ ...o, coverUrl: v })); }} />
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button type="button" className="btn btn-teal btn-sm" onClick={saveEdit}>Salvar</button>
                  <button type="button" className="btn btn-dark btn-sm" onClick={() => { setEditing(null); setEditError(''); }}>Cancelar</button>
                  {editError && <span role="alert" style={{ color: '#f87171', fontSize: '12px' }}>{editError}</span>}
                </div>
              </div>
            )}

            {/* Ferramentas da lista */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <input {...input} style={{ flex: 1, minWidth: '160px', padding: '8px 12px', fontSize: '12px' }} placeholder="🔍 Filtrar faixas…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <select className="select-dropdown" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordem" style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}>
                <option value="manual">Ordem de adição</option>
                <option value="az">Título A → Z</option>
                <option value="za">Título Z → A</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                Selecionar visíveis ({view.length}{filter.trim() ? ` de ${active.tracks.length}` : ''})
              </label>
              {dups.size > 0 && (
                <button type="button" className="btn btn-yellow btn-sm" style={sm} onClick={removeDuplicates}>Remover repetidas ({dups.size})</button>
              )}
            </div>

            {/* Barra de ações em lote */}
            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', marginBottom: '10px', backgroundColor: 'rgba(0,136,145,0.12)', border: `1px solid ${C.teal}`, borderRadius: '10px' }}>
                <strong style={{ color: C.cyan, fontSize: '12px' }}>{selected.size} selecionada{selected.size > 1 ? 's' : ''}</strong>
                <button type="button" className="btn btn-teal btn-sm" style={sm} onClick={() => setQueueAndPlay(selectedTracks, 0)}>▶ Tocar</button>
                <button type="button" className="btn btn-dark btn-sm" style={sm} onClick={() => addToQueue(selectedTracks)}>＋ Fila</button>
                <button type="button" className="btn btn-dark btn-sm" style={{ ...sm, backgroundColor: '#0284c7', color: '#fff' }} onClick={() => { enqueueMany(selectedTracks); setSelected(new Set()); }}>⬇ Baixar</button>
                <select className="select-dropdown" value={destName} onChange={(e) => setDestName(e.target.value)} aria-label="Playlist de destino" style={{ minWidth: '160px', fontSize: '12px' }}>
                  <option value="">Mover/copiar para…</option>
                  {otherPlaylists.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
                <button type="button" className="btn btn-dark btn-sm" style={sm} disabled={!destName} onClick={() => moveOrCopy(true)}>➜ Mover</button>
                <button type="button" className="btn btn-dark btn-sm" style={sm} disabled={!destName} onClick={() => moveOrCopy(false)}>⧉ Copiar</button>
                <button type="button" className="btn btn-red btn-sm" style={{ ...sm, marginLeft: 'auto' }} onClick={() => removeTracks([...selected])}>✕ Remover</button>
              </div>
            )}

            {/* Faixas */}
            {active.tracks.length === 0 ? (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '30px 10px', border: `1px dashed ${C.border}`, borderRadius: '10px' }}>
                Esta playlist está vazia. Na aba <strong>Importar &amp; Analisar</strong>, escolha faixas e use <strong>Adicionar a playlist existente</strong>.
              </div>
            ) : view.length === 0 ? (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '20px' }}>Nenhuma faixa corresponde a "{filter}".</div>
            ) : (
              <>
                {!canDrag && <div style={{ fontSize: '11px', color: C.dim, marginBottom: '6px' }}>Para arrastar e reordenar, use “Ordem de adição” e limpe o filtro.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
                  {view.map((r, pos) => {
                    const isDup = dups.has(r.i);
                    return (
                      <div
                        key={`${r.i}-${titleOf(r.t, r.i)}`}
                        data-row={r.i}
                        draggable={canDrag}
                        onDragStart={() => canDrag && setDragFrom(r.i)}
                        onDragOver={(e) => canDrag && e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); onDrop(r.i); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: C.row,
                          border: `1px solid ${selected.has(r.i) ? C.teal : '#1f2937'}`, borderRadius: '8px', opacity: dragFrom === r.i ? 0.4 : 1,
                          cursor: canDrag ? 'grab' : 'default',
                        }}
                      >
                        <input type="checkbox" checked={selected.has(r.i)} onChange={() => toggle(r.i)} aria-label={`Selecionar ${titleOf(r.t, r.i)}`} />
                        {canDrag && <span style={{ color: C.dim }} aria-hidden="true">⋮⋮</span>}
                        <span style={{ width: '30px', color: C.dim, fontSize: '12px', fontWeight: 700 }}>{r.i + 1}.</span>
                        <span style={{ flex: 1, minWidth: 0, color: '#cbd5e1', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {titleOf(r.t, r.i)}
                        </span>
                        {isDup && <span style={{ fontSize: '10px', color: '#eab308', border: '1px solid #eab308', borderRadius: '999px', padding: '1px 7px' }}>repetida</span>}
                        {fmtDur(r.t?.duration) && <span style={{ fontSize: '11px', color: C.dim }}>{fmtDur(r.t.duration)}</span>}
                        
                        {/* ▶ Toca apenas esta música isolada na fila */}
                        <button type="button" className="btn btn-dark btn-sm" style={sm} title="Ouvir apenas esta música (isola na fila)" onClick={() => playSingleTrack(r.t)}>▶</button>
                        
                        {/* ＋ Adiciona à fila acumulando (Carrinho de compras) */}
                        <button type="button" className="btn btn-dark btn-sm" style={sm} title="Adicionar à fila (Carrinho de compras)" onClick={() => addToQueue([r.t])}>＋</button>
                        
                        <button type="button" className="btn btn-dark btn-sm" style={{ ...sm, backgroundColor: '#0284c7', color: '#fff' }} title="Enviar para a Central de Downloads" onClick={() => enqueueMany([{ ...r.t, title: titleOf(r.t, r.i) }])}>⬇</button>
                        <button type="button" className="btn btn-red btn-sm" style={sm} title="Remover da playlist" onClick={() => removeTracks([r.i])}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* Aviso com "Desfazer" */}
      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: '84px', left: '50%', transform: 'translateX(-50%)', zIndex: 390, display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '90vw', padding: '10px 14px', backgroundColor: C.bg, border: `1px solid ${C.teal}`, borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', color: C.text, fontSize: '13px' }}>
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className="btn btn-teal btn-sm" style={sm} onClick={toast.undo}>Desfazer</button>}
          <button type="button" className="btn btn-dark btn-sm" style={sm} aria-label="Fechar aviso" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}