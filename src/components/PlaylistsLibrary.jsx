import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { useDownloads } from '../context/DownloadContext';
import {
  loadPlaylists, savePlaylists, uniqueName, dedupeTracks, appendUnique,
  duplicateIndexes, exportBackup, parseBackup, mergeImported,
} from '../services/playlistStore';

const C = { border: '#1e293b', bg: '#0b1020', row: '#0b0f19', muted: '#94a3b8', dim: '#64748b', text: '#e2e8f0', teal: '#008891', cyan: '#22d3ee' };

const titleOf = (t, i) => (t?.title && String(t.title).trim()) || `Música ${i + 1}`;
const thumbOf = (t) => t?.thumbnail || t?.cover_url || t?.thumbnails?.[0]?.url || null;
const fmtDur = (s) => {
  if (!s || !Number.isFinite(Number(s))) return '';
  const n = Math.round(Number(s));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const fmtTotal = (tracks) => {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const total = safeTracks.reduce((a, t) => a + (Number(t?.duration) || Number(t?.duration_seconds) || 0), 0);
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
  
  if (p?.coverUrl && typeof p.coverUrl === 'string' && p.coverUrl.trim() !== '') {
    return <div style={box}><img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }

  const tracksList = Array.isArray(p?.tracks) ? p.tracks : [];
  const uniqueThumbs = Array.from(new Set(tracksList.map(thumbOf).filter(Boolean)));

  if (uniqueThumbs.length >= 4) {
    return (
      <div style={{ ...box, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
        {uniqueThumbs.slice(0, 4).map((u, i) => <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
      </div>
    );
  }

  if (uniqueThumbs.length === 2 || uniqueThumbs.length === 3) {
    return (
      <div style={{ ...box, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {uniqueThumbs.slice(0, 4).map((u, i) => <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
      </div>
    );
  }

  if (uniqueThumbs.length === 1) {
    return <div style={box}><img src={uniqueThumbs[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }

  return <div style={box}>💿</div>;
}

const sm = { fontSize: '11px', padding: '5px 9px' };

export default function PlaylistsLibrary() {
  const { setQueueAndPlay, addToQueue } = useJukebox();
  const { enqueueDownload, enqueueMany, getTrackState } = useDownloads();

  const [playlists, setPlaylists] = useState(() => loadPlaylists());
  const [activeName, setActiveName] = useState(null);
  const [plFilter, setPlFilter] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('manual');
  const [viewMode, setViewMode] = useState('list');
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState('');
  const [toast, setToast] = useState(null);
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
      showToast('Não foi possível salvar.');
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
  };

  const view = useMemo(() => {
    if (!active || !Array.isArray(active.tracks)) return [];
    let rows = active.tracks.map((t, i) => ({ t, i }));
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => titleOf(r.t, r.i).toLowerCase().includes(q));
    if (sort === 'az') rows.sort((a, b) => titleOf(a.t, a.i).localeCompare(titleOf(b.t, b.i), 'pt-BR'));
    if (sort === 'za') rows.sort((a, b) => titleOf(b.t, b.i).localeCompare(titleOf(a.t, a.i), 'pt-BR'));
    return rows;
  }, [active, filter, sort]);

  const activeTracks = Array.isArray(active?.tracks) ? active.tracks : [];
  const selectedTracks = [...selected].sort((a, b) => a - b).map((i) => activeTracks[i]).filter(Boolean);
  const allVisibleSelected = view.length > 0 && view.every((r) => selected.has(r.i));

  const playSingleTrack = (track) => { if (track) setQueueAndPlay([track], 0); };
  const playAll = () => activeTracks.length && setQueueAndPlay(activeTracks, 0);
  const playShuffle = () => activeTracks.length && setQueueAndPlay(shuffled(activeTracks), 0);

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleAllVisible = () => setSelected(allVisibleSelected ? new Set() : new Set(view.map((r) => r.i)));

  const removeTracks = (indexes) => {
    if (!active || indexes.length === 0) return;
    const before = playlists;
    const drop = new Set(indexes);
    const nextTracks = activeTracks.filter((_, k) => !drop.has(k));
    if (!commit(playlists.map((p, i) => (i === activeIdx ? { ...p, tracks: nextTracks } : p)))) return;
    setSelected(new Set());
    showToast(`${indexes.length} faixa(s) removida(s).`, () => { commit(before); setToast(null); });
  };

  const createPlaylist = () => {
    const name = uniqueName(playlists, 'Nova playlist');
    if (commit([...playlists, { name, folder: '', album: '', artist: '', coverUrl: '', tracks: [] }])) selectPlaylist(name);
  };

  const deletePlaylist = () => {
    if (!active) return;
    const before = playlists;
    const name = active.name;
    if (!commit(playlists.filter((_, i) => i !== activeIdx))) return;
    setActiveName(null);
    setSelected(new Set());
    showToast(`Playlist "${name}" excluída.`, () => { commit(before); setActiveName(name); setToast(null); });
  };

  const startEdit = () => { setEditing({ name: active.name, artist: active.artist || '', album: active.album || '', coverUrl: active.coverUrl || '' }); setEditError(''); };
  const saveEdit = () => {
    const name = editing.name.trim();
    if (!name) { setEditError('Dê um nome para a playlist.'); return; }
    const next = playlists.map((p, i) => (i === activeIdx ? { ...p, name, artist: editing.artist.trim(), album: editing.album.trim(), coverUrl: editing.coverUrl.trim() } : p));
    if (commit(next)) { setActiveName(name); setEditing(null); setEditError(''); }
  };

  const handleTrackDownload = (track, idx) => {
    if (!(track.webpage_url || track.url)) return;
    const item = { ...track, title: titleOf(track, idx) };
    if (getTrackState(track) === 'downloaded') {
      if (!window.confirm(`"${item.title}" já foi baixada. Baixar de novo?`)) return;
      enqueueDownload(item, undefined, { force: true });
      return;
    }
    enqueueDownload(item);
  };

  const shownPlaylists = playlists.filter((p) => p.name.toLowerCase().includes(plFilter.trim().toLowerCase()));
  const input = { className: 'input-text', style: { width: '100%' } };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: '16px', alignItems: 'start' }}>
      
      {/* Esquerda: Lista de Playlists & Backup/Importar */}
      <aside className="card card-bordered" style={{ padding: '14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '13px' }}>💿 MINHAS PLAYLISTS ({playlists.length})</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className={`btn btn-sm ${viewMode === 'list' ? 'btn-teal' : 'btn-dark'}`} style={{ padding: '3px 6px', fontSize: '10px' }} onClick={() => setViewMode('list')}>☰</button>
            <button type="button" className={`btn btn-sm ${viewMode === 'grid' ? 'btn-teal' : 'btn-dark'}`} style={{ padding: '3px 6px', fontSize: '10px' }} onClick={() => setViewMode('grid')}>⊞</button>
            <button type="button" className="btn btn-teal btn-sm" style={sm} onClick={createPlaylist}>＋ Nova</button>
          </div>
        </div>

        {playlists.length > 3 && (
          <input {...input} placeholder="🔍 Buscar playlist…" value={plFilter} onChange={(e) => setPlFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px' }} />
        )}

        {viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
            {shownPlaylists.map((p) => {
              const on = p.name === active?.name;
              const pCount = Array.isArray(p.tracks) ? p.tracks.length : 0;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => selectPlaylist(p.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: '10px', color: C.text,
                    border: `1px solid ${on ? C.teal : C.border}`, backgroundColor: on ? 'rgba(0,136,145,0.15)' : C.bg,
                  }}
                >
                  <Cover p={p} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? C.cyan : C.text }}>{p.name}</span>
                    <span style={{ fontSize: '11px', color: C.dim }}>{pCount} faixas</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
            {shownPlaylists.map((p) => {
              const on = p.name === active?.name;
              const pCount = Array.isArray(p.tracks) ? p.tracks.length : 0;
              return (
                <div
                  key={p.name}
                  onClick={() => selectPlaylist(p.name)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'center', cursor: 'pointer', padding: '8px', borderRadius: '10px', color: C.text,
                    border: `1px solid ${on ? C.teal : C.border}`, backgroundColor: on ? 'rgba(0,136,145,0.15)' : C.bg, alignItems: 'center'
                  }}
                >
                  <Cover p={p} size={64} />
                  <span style={{ minWidth: 0, width: '100%' }}>
                    <span style={{ fontWeight: 700, fontSize: '12px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? C.cyan : C.text }}>{p.name}</span>
                    <span style={{ fontSize: '10px', color: C.dim }}>{pCount} faixas</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button type="button" className="btn btn-dark btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={() => exportBackup(playlists)}>⬇ Backup</button>
          <button type="button" className="btn btn-dark btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={() => fileRef.current?.click()}>⬆ Importar</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await f.text();
              const parsed = parseBackup(text);
              if (!parsed) { showToast('Arquivo inválido.'); return; }
              const next = mergeImported(playlists, parsed.playlists);
              if (commit(next)) showToast('Backup importado com sucesso!');
            } catch { showToast('Erro ao ler arquivo.'); }
            e.target.value = '';
          }} />
        </div>
      </aside>

      {/* Direita: Playlist Ativa com Checkboxes e Ações */}
      <section className="card card-bordered" style={{ padding: '18px', margin: 0, minWidth: 0 }}>
        {!active ? (
          <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '40px 10px' }}>Selecione ou crie uma playlist.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(11, 16, 32, 0.7)', border: `1px solid ${C.border}`, borderRadius: '12px' }}>
              <Cover p={active} size={84} />
              <div style={{ flex: 1, minWidth: '220px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: C.cyan, backgroundColor: 'rgba(0,136,145,0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,136,145,0.3)' }}>
                  Playlist Ativa
                </span>

                <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginTop: '4px', marginBottom: '6px', lineHeight: 1.2 }}>
                  {active.name}
                </div>

                {active.artist && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: C.muted }}>🎤 Artista / Banda:</span>
                    <span style={{ fontWeight: 700, color: '#22d3ee' }}>{active.artist}</span>
                  </div>
                )}

                <div style={{ fontSize: '12px', color: C.muted }}>
                  {activeTracks.length} faixas{fmtTotal(activeTracks) ? ` • ${fmtTotal(activeTracks)}` : ''}{active.album ? ` • Álbum: ${active.album}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-teal btn-sm" onClick={playAll} disabled={!activeTracks.length}>▶ Tocar tudo</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={() => addToQueue(activeTracks)} disabled={!activeTracks.length}>＋ Adicionar à Fila</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={playShuffle} disabled={!activeTracks.length}>🔀 Aleatório</button>
                <button type="button" className="btn btn-dark btn-sm" style={{ backgroundColor: '#0284c7', color: '#fff' }} onClick={() => enqueueMany(activeTracks)} disabled={!activeTracks.length}>⬇ Baixar playlist</button>
                <button type="button" className="btn btn-dark btn-sm" onClick={startEdit}>✎ Editar</button>
                <button type="button" className="btn btn-red btn-sm" onClick={deletePlaylist}>🗑 Excluir</button>
              </div>
            </div>

            {editing && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px', marginBottom: '14px', backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
                <input {...input} placeholder="Nome" value={editing.name} onChange={(e) => setEditing((o) => ({ ...o, name: e.target.value }))} />
                <input {...input} placeholder="Artista" value={editing.artist} onChange={(e) => setEditing((o) => ({ ...o, artist: e.target.value }))} />
                <input {...input} placeholder="Álbum" value={editing.album} onChange={(e) => setEditing((o) => ({ ...o, album: e.target.value }))} />
                <input {...input} placeholder="URL da Capa" value={editing.coverUrl} onChange={(e) => setEditing((o) => ({ ...o, coverUrl: e.target.value }))} />
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-teal btn-sm" onClick={saveEdit}>Salvar</button>
                  <button type="button" className="btn btn-dark btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <input {...input} style={{ flex: 1, minWidth: '160px', padding: '8px 12px', fontSize: '12px' }} placeholder="🔍 Filtrar faixas…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <select className="select-dropdown" value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}>
                <option value="manual">Ordem de adição</option>
                <option value="az">Título A → Z</option>
                <option value="za">Título Z → A</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                Selecionar visíveis ({view.length})
              </label>
              {selected.size > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                  <button type="button" className="btn btn-dark btn-sm" style={{ backgroundColor: '#0284c7', color: '#fff', ...sm }} onClick={() => enqueueMany(selectedTracks)}>⬇ Baixar selecionadas ({selected.size})</button>
                  <button type="button" className="btn btn-teal btn-sm" style={sm} onClick={() => addToQueue(selectedTracks)}>＋ Adicionar à Fila</button>
                  <button type="button" className="btn btn-red btn-sm" style={sm} onClick={() => removeTracks([...selected])}>🗑 Remover selecionadas</button>
                </div>
              )}
            </div>

            {activeTracks.length === 0 ? (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '30px 10px', border: `1px dashed ${C.border}`, borderRadius: '10px' }}>
                Esta playlist está vazia.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto' }}>
                {view.map((r) => {
                  const dlState = getTrackState(r.t);
                  const isSelected = selected.has(r.i);
                  return (
                    <div
                      key={`${r.i}-${titleOf(r.t, r.i)}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: C.row,
                        border: `1px solid ${isSelected ? C.teal : C.border}`, borderRadius: '8px'
                      }}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(r.i)} />
                      <span style={{ width: '30px', color: C.dim, fontSize: '12px', fontWeight: 700 }}>{r.i + 1}.</span>
                      <span style={{ flex: 1, minWidth: '0', color: '#cbd5e1', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {titleOf(r.t, r.i)}
                      </span>
                      {fmtDur(r.t?.duration || r.t?.duration_seconds) && <span style={{ fontSize: '11px', color: C.dim }}>{fmtDur(r.t?.duration || r.t?.duration_seconds)}</span>}
                      
                      <div style={{ display: 'flex', gap: '6px', flexShrink: '0' }}>
                        <button type="button" className="btn btn-dark btn-sm" style={sm} title="Ouvir" onClick={() => playSingleTrack(r.t)}>▶</button>
                        <button type="button" className="btn btn-dark btn-sm" style={sm} title="Adicionar à Fila" onClick={() => addToQueue([r.t])}>＋</button>
                        <button
                          type="button"
                          onClick={() => handleTrackDownload(r.t, r.i)}
                          disabled={dlState === 'busy'}
                          className="btn btn-dark btn-sm"
                          style={{ backgroundColor: dlState === 'downloaded' ? '#15803d' : '#0284c7', color: '#fff', fontSize: '11px', padding: '4px 10px' }}
                          title="Enviar para a Central de Downloads"
                        >
                          {dlState === 'busy' ? '⬇…' : dlState === 'downloaded' ? '✓ Baixada' : '⬇ Baixar'}
                        </button>
                        <button type="button" className="btn btn-red btn-sm" style={sm} title="Remover da Playlist" onClick={() => removeTracks([r.i])}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: '84px', left: '50%', transform: 'translateX(-50%)', zIndex: 390, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', backgroundColor: C.bg, border: `1px solid ${C.teal}`, borderRadius: '10px', color: C.text, fontSize: '13px' }}>
          <span>{toast.text}</span>
          <button type="button" className="btn btn-dark btn-sm" style={sm} onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}