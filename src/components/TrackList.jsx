import React, { useState, useMemo } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { useDownloads, getVideoId } from '../context/DownloadContext';

export default function TrackList({ tracks, setTracks }) {
  const { addToQueue, setQueueAndPlay } = useJukebox();
  const [selectedTracks, setSelectedTracks] = useState([]);
  const { enqueueDownload, enqueueMany, getTrackState } = useDownloads();

  // Estados de busca, ordenação e expansão do painel
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('original'); // 'original' | 'az' | 'za'
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);

  // Estados para os formulários de salvamento
  const [playlistName, setPlaylistName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [albumName, setAlbumName] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [existingPlaylist, setExistingPlaylist] = useState('');

  const getDisplayTitle = (track, idx) => {
    if (!track) return `Faixa ${idx + 1}`;
    if (track.title && track.title.trim() !== '' && track.title !== track.id) {
      return track.title;
    }
    return `Música ${idx + 1} (${track.id || 'Desconhecida'})`;
  };

  // Filtragem e ordenação dinâmica mantendo o índice original para ações corretas
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
    if (!playlistName.trim()) {
      alert('Por favor, informe o nome da playlist.');
      return;
    }

    const savedPlaylists = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
    const name = playlistName.trim();

    if (savedPlaylists[name] && !window.confirm(`Já existe uma playlist chamada "${name}". Substituir? (as faixas atuais dela serão perdidas)`)) {
      return;
    }

    savedPlaylists[name] = {
      folder: artistName.trim() || 'Geral',
      album: albumName.trim() || 'Singles / Catálogo',
      artist: artistName.trim() || 'Vários Artistas',
      coverUrl: coverUrl.trim() || '',
      tracks: tracks
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
    const fresh = tracks.filter((t) => !existingKeys.has(keyOf(t)));
    const skipped = tracks.length - fresh.length;
    const updatedTracks = [...currentTracks, ...fresh];

    savedPlaylists[existingPlaylist] = {
      ...(typeof target === 'object' ? target : {}),
      tracks: updatedTracks
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
      
      {/* 1. MEIO: FAIXAS DETETADAS */}
      <div className="card card-bordered" style={{ padding: '20px', margin: 0 }}>
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '14px' }}>
            🎵 FAIXAS DETETADAS ({filteredAndSortedTracks.length} de {tracks.length} FAIXAS)
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={allFilteredSelected}
              />
              Selecionar Todos
            </label>

            {selectedTracks.length > 0 && (
              <button
                onClick={handleDownloadSelected}
                className="btn btn-dark btn-sm"
                style={{ backgroundColor: '#0284c7', color: '#fff' }}
                title="Envia as faixas marcadas para a Central de Downloads"
              >
                ⬇ Baixar selecionadas ({selectedTracks.length})
              </button>
            )}

            <button
              onClick={() => {
                const tracksToQueue = selectedTracks.length > 0 
                  ? selectedTracks.map(i => tracks[i]) 
                  : filteredAndSortedTracks.map(item => item.track);
                addToQueue(tracksToQueue);
              }}
              className="btn btn-teal btn-sm"
            >
              Tocar Fila (Jukebox)
            </button>

            <button
              onClick={handleClearQueue}
              className="btn btn-red btn-sm"
              style={{ fontWeight: 'bold' }}
              title="Limpar fila e recolher secção"
            >
              🗑️ Limpar Fila
            </button>
          </div>
        </div>

        {/* BARRA DE BUSCA E FILTRO / ORDENAÇÃO */}
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
                    <input
                      type="checkbox"
                      checked={selectedTracks.includes(originalIndex)}
                      onChange={() => handleToggleSelect(originalIndex)}
                    />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px', fontSize: '13px', color: '#cbd5e1' }}>
                      {originalIndex + 1}. {displayTitle}
                    </span>
                  </div>

                  <div className="track-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleDownload(track, originalIndex)}
                      disabled={dlState === 'busy'}
                      className="btn btn-dark btn-sm"
                      title={dlState === 'downloaded' ? 'Já baixada: clique para baixar de novo' : 'Enviar para a Central de Downloads'}
                      style={{ backgroundColor: dlState === 'downloaded' ? '#15803d' : '#0284c7', color: '#fff', fontSize: '11px', padding: '4px 10px' }}
                    >
                      {dlState === 'busy' ? '⬇ Baixando…' : dlState === 'waiting' ? '⏳ Na Central' : dlState === 'downloaded' ? '✓ Baixada' : '⬇ Baixar'}
                    </button>
                    <button
                      onClick={() => setQueueAndPlay(tracks, originalIndex)}
                      className="btn btn-dark btn-sm"
                      title="Tocar esta faixa e definir a fila a partir daqui"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      ▶ Ouvir
                    </button>
                    <button
                      onClick={() => handleRemoveTrack(originalIndex)}
                      className="btn btn-red btn-sm"
                      title="Remover"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. BARRA DE SALVAMENTO DE PLAYLIST (COMPACTA, EXPANSÍVEL E COM PADRÃO AZUL) */}
      <div className="card card-bordered" style={{ padding: '0', margin: 0, overflow: 'hidden' }}>
        
        <button
          type="button"
          onClick={() => setIsSavePanelOpen(!isSavePanelOpen)}
          className="card-title card-title-teal"
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'none',
            border: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            outline: 'none',
            fontSize: '14px',
            margin: 0,
            textAlign: 'left'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            💾 GUARDAR OU ADICIONAR ÀS MINHAS PLAYLISTS ({tracks.length} FAIXAS)
          </span>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>
            {isSavePanelOpen ? '▲ Recolher' : '▼ Expandir Opções'}
          </span>
        </button>

        {isSavePanelOpen && (
          <div style={{ padding: '16px', borderTop: '1px solid #1f2937', backgroundColor: '#0b0f19' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%', alignItems: 'stretch' }}>
              
              {/* Guardar em Pasta / Banda ou Mix */}
              <div style={{ padding: '14px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '12px' }}>
                      📁 GUARDAR EM PASTA / BANDA
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Nome da playlist (ex: Rock)..."
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      className="input-text"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Banda / Artista..."
                        value={artistName}
                        onChange={(e) => setArtistName(e.target.value)}
                        className="input-text"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      />
                      <input
                        type="text"
                        placeholder="Álbum..."
                        value={albumName}
                        onChange={(e) => setAlbumName(e.target.value)}
                        className="input-text"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="URL da Capa (Opcional)..."
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                      className="input-text"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    />
                  </div>
                </div>

                <button onClick={handleSaveNewPlaylist} className="btn btn-yellow btn-sm" style={{ width: '100%', fontWeight: 'bold', padding: '6px', marginTop: '10px' }}>
                  Guardar Playlist
                </button>
              </div>

              {/* Adicionar a Playlist Existente */}
              <div style={{ padding: '14px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ marginBottom: '10px' }}>
                    <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '12px', display: 'block' }}>
                      ➕ ADICIONAR A PLAYLIST EXISTENTE
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '12px' }}>
                    <select
                      value={existingPlaylist}
                      onChange={(e) => setExistingPlaylist(e.target.value)}
                      className="select-dropdown"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '12px', height: '36px', cursor: 'pointer' }}
                    >
                      <option value="">Selecione uma playlist...</option>
                      {existingNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button onClick={handleAddToExistingPlaylist} className="btn btn-teal btn-sm" style={{ width: '100%', fontWeight: 'bold', padding: '6px', marginTop: '10px' }}>
                  Adicionar a Esta Playlist
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}