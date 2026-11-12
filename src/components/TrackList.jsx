import React, { useState, useMemo, useEffect } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { useDownloads, getVideoId } from '../context/DownloadContext';

export default function TrackList({ tracks, setTracks }) {
  const { addToQueue, setQueueAndPlay } = useJukebox();
  const [selectedTracks, setSelectedTracks] = useState([]);
  const { enqueueDownload, enqueueMany, getTrackState } = useDownloads();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('original');
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);

  // Nome da Playlist (personalizado pelo utilizador ou sugerido)
  const [playlistName, setPlaylistName] = useState('');
  
  // Informações oficiais trazidas do YouTube
  const [autoMetadata, setAutoMetadata] = useState({ artist: '', album: '', coverUrl: '', totalDuration: '', releaseYear: '' });
  const [existingPlaylist, setExistingPlaylist] = useState('');

  const fmtTotalDuration = (trackList) => {
    const totalSecs = trackList.reduce((acc, t) => acc + (Number(t?.duration) || Number(t?.duration_seconds) || 0), 0);
    if (!totalSecs) return '';
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return h ? `${h}h ${m}min` : `${m} min`;
  };

  useEffect(() => {
    if (tracks && tracks.length > 0) {
      const primeiraFaixa = tracks[0];
      const sugeridoPlaylist = primeiraFaixa.album || primeiraFaixa.title || 'Minha Playlist';
      const artistaOficial = primeiraFaixa.artist || primeiraFaixa.uploader || 'Vários Artistas';
      const albumOficial = primeiraFaixa.album || sugeridoPlaylist;
      
      const capaOficial = primeiraFaixa.thumbnail || primeiraFaixa.cover_url || primeiraFaixa.thumbnails?.[0]?.url || '';
      
      const duracaoStr = fmtTotalDuration(tracks);
      const anoOficial = primeiraFaixa.release_year || primeiraFaixa.upload_date?.slice(0, 4) || '2025';

      setPlaylistName((prev) => prev || sugeridoPlaylist);
      setAutoMetadata({
        artist: artistaOficial,
        album: albumOficial,
        coverUrl: capaOficial,
        totalDuration: duracaoStr,
        releaseYear: anoOficial
      });
    }
  }, [tracks]);

  const getDisplayTitle = (track, idx) => {
    if (!track) return `Faixa ${idx + 1}`;
    if (track.title && track.title.trim() !== '' && track.title !== track.id) {
      return track.title;
    }
    return `Música ${idx + 1} (${track.id || 'Desconhecida'})`;
  };

  const filteredAndSortedTracks = useMemo(() => {
    const mapped = tracks.map((track, originalIndex) => ({
      track,
      originalIndex,
      displayTitle: getDisplayTitle(track, originalIndex)
    }));

    const filtered = mapped.filter(({ displayTitle }) =>
      displayTitle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortBy === 'az') {
      filtered.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
    } else if (sortBy === 'za') {
      filtered.sort((a, b) => b.displayTitle.localeCompare(a.displayTitle));
    }

    return filtered;
  }, [tracks, searchQuery, sortBy]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTracks(filteredAndSortedTracks.map((item) => item.originalIndex));
    } else {
      setSelectedTracks([]);
    }
  };

  const handleToggleSelect = (originalIndex) => {
    setSelectedTracks((prev) =>
      prev.includes(originalIndex)
        ? prev.filter((i) => i !== originalIndex)
        : [...prev, originalIndex]
    );
  };

  const handleRemoveTrack = (originalIndexToRemove) => {
    if (setTracks) {
      setTracks(tracks.filter((_, idx) => idx !== originalIndexToRemove));
      setSelectedTracks((prev) => prev.filter((i) => i !== originalIndexToRemove));
    }
  };

  const handleClearQueue = () => {
    if (setTracks) {
      setTracks([]);
      setSelectedTracks([]);
    }
  };

  const handleDownload = (track, idx) => {
    if (!(track.webpage_url || track.url)) return;
    const item = { ...track, title: getDisplayTitle(track, idx) };
    if (getTrackState(track) === 'downloaded') {
      if (!window.confirm(`"${item.title}" já foi baixada. Baixar de novo?`)) return;
      enqueueDownload(item, undefined, { force: true });
      return;
    }
    enqueueDownload(item);
  };

  const handleDownloadSelected = () => {
    enqueueMany(selectedTracks.map((i) => ({ ...tracks[i], title: getDisplayTitle(tracks[i], i) })));
  };

  const handleSaveNewPlaylist = async () => {
    const name = playlistName.trim() || autoMetadata.album || 'Minha Playlist';

    const savedPlaylists = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');

    if (savedPlaylists[name] && !window.confirm(`Já existe uma playlist chamada "${name}". Substituir?`)) {
      return;
    }

    const resolvedArtist = autoMetadata.artist || 'Vários Artistas';
    const resolvedAlbum = autoMetadata.album || name;
    const resolvedCover = autoMetadata.coverUrl || (tracks[0]?.thumbnail || tracks[0]?.cover_url || '');

    const enrichedTracks = tracks.map((track, idx) => ({
      ...track,
      title: getDisplayTitle(track, idx),
      track_number: track.track_number || idx + 1,
      artist: track.artist || resolvedArtist,
      album_title: track.album_title || resolvedAlbum,
      cover_url: track.cover_url || track.thumbnail || resolvedCover,
      youtube_video_id: track.id || track.youtube_video_id
    }));

    savedPlaylists[name] = {
      folder: resolvedArtist,
      album: resolvedAlbum,
      artist: resolvedArtist,
      coverUrl: resolvedCover,
      tracks: enrichedTracks
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(savedPlaylists));
    window.dispatchEvent(new Event('storage'));
    alert(`Playlist "${name}" guardada com sucesso!`);
  };

  const handleAddToExistingPlaylist = () => {
    if (!existingPlaylist) {
      alert('Selecione uma playlist existente.');
      return;
    }

    const savedPlaylists = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
    const target = savedPlaylists[existingPlaylist];

    if (!target) return;

    const currentTracks = Array.isArray(target) ? target : (target.tracks || []);
    const keyOf = (t) => getVideoId(t) || t.webpage_url || t.url || t.id;
    const existingKeys = new Set(currentTracks.map(keyOf));
    
    // Correção: Mapeia corretamente usando 't' em vez de 'track' indefinido
    const fresh = tracks.filter((t) => !existingKeys.has(keyOf(t))).map((t, idx) => ({
      ...t,
      title: getDisplayTitle(t, idx),
      track_number: currentTracks.length + idx + 1,
      artist: t.artist || target.artist || 'Vários Artistas',
      album_title: t.album_title || target.album || existingPlaylist,
      cover_url: t.cover_url || t.thumbnail || target.coverUrl || ''
    }));

    const skipped = tracks.length - fresh.length;
    const updatedTracks = [...currentTracks, ...fresh];

    savedPlaylists[existingPlaylist] = {
      ...(typeof target === 'object' ? target : {}),
      tracks: updatedTracks,
      // Remove a capa estática única para forçar a exibição do mosaico com as capas misturadas
      coverUrl: ''
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(savedPlaylists));
    window.dispatchEvent(new Event('storage'));
    alert(`${fresh.length} faixa(s) adicionada(s) a "${existingPlaylist}"${skipped ? ` (${skipped} já estavam na playlist)` : ''}.`);
  };

  const existingNames = Object.keys(JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}'));

  if (!tracks || tracks.length === 0) return null;

  const allFilteredSelected = filteredAndSortedTracks.length > 0 && filteredAndSortedTracks.every((item) => selectedTracks.includes(item.originalIndex));

  return (
    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      
      {/* 1. FAIXAS DETETADAS */}
      <div className="card card-bordered" style={{ padding: '20px', margin: 0 }}>
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '14px' }}>
            🎵 FAIXAS DETETADAS ({filteredAndSortedTracks.length} de {tracks.length} FAIXAS)
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" onChange={handleSelectAll} checked={allFilteredSelected} />
              Selecionar Todos
            </label>

            {selectedTracks.length > 0 && (
              <button onClick={handleDownloadSelected} className="btn btn-dark btn-sm" style={{ backgroundColor: '#0284c7', color: '#fff' }}>
                ⬇ Baixar selecionadas ({selectedTracks.length})
              </button>
            )}

            <button
              onClick={() => {
                const tracksToQueue = selectedTracks.length > 0 ? selectedTracks.map(i => tracks[i]) : filteredAndSortedTracks.map(item => item.track);
                addToQueue(tracksToQueue);
              }}
              className="btn btn-teal btn-sm"
            >
              Tocar Fila (Jukebox)
            </button>

            <button onClick={handleClearQueue} className="btn btn-red btn-sm" style={{ fontWeight: 'bold' }}>
              🗑️ Limpar Fila
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Filtrar faixas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-text"
            style={{ flex: 1, minWidth: '240px', padding: '8px 12px', fontSize: '12px' }}
          />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="select-dropdown"
            style={{ width: '200px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}
          >
            <option value="original">Ordem de Adição</option>
            <option value="az">Nome (A - Z)</option>
            <option value="za">Nome (Z - A)</option>
          </select>
        </div>

        <div className="playlist-tracks" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredAndSortedTracks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
              Nenhuma faixa encontrada para "{searchQuery}".
            </div>
          ) : (
            filteredAndSortedTracks.map(({ track, originalIndex, displayTitle }) => {
              const dlState = getTrackState(track);

              return (
                <div key={originalIndex} className="playlist-track-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                    <input type="checkbox" checked={selectedTracks.includes(originalIndex)} onChange={() => handleToggleSelect(originalIndex)} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px', fontSize: '13px', color: '#cbd5e1' }}>
                      {originalIndex + 1}. {displayTitle}
                    </span>
                  </div>

                  <div className="track-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleDownload(track, originalIndex)}
                      disabled={dlState === 'busy'}
                      className="btn btn-dark btn-sm"
                      style={{ backgroundColor: dlState === 'downloaded' ? '#15803d' : '#0284c7', color: '#fff', fontSize: '11px', padding: '4px 10px' }}
                    >
                      {dlState === 'busy' ? '⬇ Baixando…' : dlState === 'waiting' ? '⏳ Na Central' : dlState === 'downloaded' ? '✓ Baixada' : '⬇ Baixar'}
                    </button>
                    <button onClick={() => setQueueAndPlay(tracks, originalIndex)} className="btn btn-dark btn-sm" style={{ fontSize: '11px', padding: '4px 10px' }}>
                      ▶ Ouvir
                    </button>
                    <button onClick={() => handleRemoveTrack(originalIndex)} className="btn btn-red btn-sm" style={{ fontSize: '11px', padding: '4px 8px' }}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. BARRA DE SALVAMENTO DE PLAYLIST */}
      <div className="card card-bordered" style={{ padding: '0', margin: 0, overflow: 'hidden', background: 'linear-gradient(135deg, #0b1020 0%, #111827 100%)' }}>
        <button
          type="button"
          onClick={() => setIsSavePanelOpen(!isSavePanelOpen)}
          style={{
            width: '100%', padding: '14px 20px', background: 'transparent', border: 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
            outline: 'none', textAlign: 'left'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>💾</span>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#22d3ee', display: 'block' }}>
                Guardar Playlist ({tracks.length} faixas)
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Nome a ser salvo: "{playlistName || autoMetadata.album}"
              </span>
            </div>
          </div>
          
          <span className="btn btn-teal btn-sm" style={{ fontSize: '12px', padding: '6px 14px' }}>
            {isSavePanelOpen ? '▲ Fechar' : '✨ Personalizar & Guardar'}
          </span>
        </button>

        {isSavePanelOpen && (
          <div style={{ padding: '24px', borderTop: '1px solid #1f2937', backgroundColor: '#0b0f19', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* PAINEL DE INFORMAÇÕES OFICIAIS COM CAPA EM DESTAQUE MÁXIMO */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '18px', backgroundColor: '#111827', borderRadius: '14px', border: '1px solid #1e293b', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              {autoMetadata.coverUrl ? (
                <img 
                  src={autoMetadata.coverUrl} 
                  alt="Capa do Álbum" 
                  style={{ 
                    width: '92px', 
                    height: '92px', 
                    borderRadius: '10px', 
                    objectFit: 'cover', 
                    boxShadow: '0 8px 24px rgba(0,0,0,0.7)', 
                    border: '1px solid rgba(255,255,255,0.15)',
                    flexShrink: 0 
                  }} 
                />
              ) : (
                <div style={{ width: '92px', height: '92px', borderRadius: '10px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}>💿</div>
              )}
              
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 'bold', letterSpacing: '0.8px' }}>
                  Informações Oficiais
                </span>
                <div style={{ fontSize: '16px', fontWeight: '900', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                  {autoMetadata.album}
                </div>
                <div style={{ fontSize: '13px', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Artista / Canal: <strong style={{ color: '#38bdf8' }}>{autoMetadata.artist}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  Ano: {autoMetadata.releaseYear} • {tracks.length} músicas{autoMetadata.totalDuration ? ` • ${autoMetadata.totalDuration}` : ''}
                </div>
              </div>
            </div>

            {/* OPÇÕES DE SALVAMENTO LADO A LADO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
              
              <div style={{ padding: '16px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#008891', display: 'block', marginBottom: '8px' }}>
                    📁 CRIAR NOVA PLAYLIST
                  </span>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Nome da Playlist (Opcional):</label>
                  <input
                    type="text"
                    placeholder={autoMetadata.album}
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="input-text"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px' }}
                  />
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                    Se vazio, assume o nome oficial do álbum.
                  </span>
                </div>
                <button onClick={handleSaveNewPlaylist} className="btn btn-yellow btn-sm" style={{ width: '100%', fontWeight: 'bold', padding: '10px' }}>
                  💾 Guardar Nova Playlist
                </button>
              </div>

              <div style={{ padding: '16px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#008891', display: 'block', marginBottom: '8px' }}>
                    ➕ ADICIONAR A EXISTENTE
                  </span>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Selecione a biblioteca:</label>
                  <select
                    value={existingPlaylist}
                    onChange={(e) => setExistingPlaylist(e.target.value)}
                    className="select-dropdown"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', height: '38px', cursor: 'pointer', borderRadius: '6px' }}
                  >
                    <option value="">Selecione uma playlist...</option>
                    {existingNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={handleAddToExistingPlaylist} className="btn btn-teal btn-sm" style={{ width: '100%', fontWeight: 'bold', padding: '10px' }}>
                  ➕ Adicionar a Esta Playlist
                </button>
              </div>

            </div>

          </div>
        )}
      </div>

    </div>
  );
}