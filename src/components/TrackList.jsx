import React, { useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { runYtdlp } from '../services/ytdlp';

export default function TrackList({ tracks, setTracks }) {
  const { addToQueue, setQueueAndPlay } = useJukebox();
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [downloadingIdx, setDownloadingIdx] = useState(null);

  // Estados para os painéis de salvamento no fundo
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

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTracks(tracks.map((_, idx) => idx));
    } else {
      setSelectedTracks([]);
    }
  };

  const handleToggleSelect = (idx) => {
    setSelectedTracks((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleRemoveTrack = (indexToRemove) => {
    if (setTracks) {
      setTracks(tracks.filter((_, idx) => idx !== indexToRemove));
      setSelectedTracks((prev) => prev.filter((i) => i !== indexToRemove));
    }
  };

  const handleClearQueue = () => {
    if (setTracks) {
      setTracks([]);
      setSelectedTracks([]);
    }
  };

  const handleDownload = async (track, idx) => {
    const targetUrl = track.webpage_url || track.url;
    if (!targetUrl) return;

    setDownloadingIdx(idx);
    try {
      alert(`A iniciar download: ${getDisplayTitle(track, idx)}`);
      await runYtdlp(targetUrl);
      alert('Download concluído com sucesso!');
    } catch (err) {
      console.error('Erro no download:', err);
      alert('Erro ao descarregar a faixa.');
    } finally {
      setDownloadingIdx(null);
    }
  };

  const handleSaveNewPlaylist = async () => {
    if (!playlistName.trim()) {
      alert('Por favor, informe o nome da playlist.');
      return;
    }

    const savedPlaylists = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
    
    savedPlaylists[playlistName] = {
      folder: artistName.trim() || 'Geral',
      album: albumName.trim() || 'Singles / Catálogo',
      artist: artistName.trim() || 'Vários Artistas',
      coverUrl: coverUrl.trim() || '',
      tracks: tracks
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(savedPlaylists));
    window.dispatchEvent(new Event('storage'));
    alert(`Playlist "${playlistName}" guardada com sucesso!`);
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
    const updatedTracks = [...currentTracks, ...tracks];

    savedPlaylists[existingPlaylist] = {
      ...(typeof target === 'object' ? target : {}),
      tracks: updatedTracks
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(savedPlaylists));
    window.dispatchEvent(new Event('storage'));
    alert(`Faixas adicionadas a "${existingPlaylist}" com sucesso!`);
  };

  const existingNames = Object.keys(JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}'));

  if (!tracks || tracks.length === 0) return null;

  return (
    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      
      {/* 1. MEIO: FAIXAS DETETADAS */}
      <div className="card card-bordered" style={{ padding: '20px', margin: 0 }}>
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '14px' }}>
            🎵 Faixas Detetadas ({tracks.length} faixas)
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={selectedTracks.length === tracks.length && tracks.length > 0}
              />
              Selecionar Todos
            </label>

            <button
              onClick={() => {
                const tracksToQueue = selectedTracks.length > 0 
                  ? selectedTracks.map(i => tracks[i]) 
                  : tracks;
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

        <div className="playlist-tracks" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
          {tracks.map((track, idx) => {
            const displayTitle = getDisplayTitle(track, idx);

            return (
              <div key={idx} className="playlist-track-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedTracks.includes(idx)}
                    onChange={() => handleToggleSelect(idx)}
                  />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px', fontSize: '13px', color: '#cbd5e1' }}>
                    {idx + 1}. {displayTitle}
                  </span>
                </div>

                <div className="track-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleDownload(track, idx)}
                    disabled={downloadingIdx === idx}
                    className="btn btn-dark btn-sm"
                    style={{ backgroundColor: '#0284c7', color: '#fff', fontSize: '11px', padding: '4px 10px' }}
                  >
                    {downloadingIdx === idx ? '⬇ A baixar...' : '⬇ Baixar'}
                  </button>
                  <button
                    onClick={() => setQueueAndPlay(tracks, idx)}
                    className="btn btn-dark btn-sm"
                    title="Tocar esta faixa e definir a fila a partir daqui"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    ▶ Ouvir
                  </button>
                  <button
                    onClick={() => handleRemoveTrack(idx)}
                    className="btn btn-red btn-sm"
                    title="Remover"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. FUNDO: PAINÉIS DE SALVAMENTO DE PLAYLIST */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '15px' }}>
        
        {/* Guardar em Pasta / Banda ou Mix */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span className="card-title" style={{ margin: 0, color: '#38bdf8' }}>
              📁 Guardar em Pasta / Banda ou Mix
            </span>
            <span style={{ fontSize: '11px', color: '#0d9488', backgroundColor: '#0f292a', padding: '2px 8px', borderRadius: '10px' }}>
              {tracks.length} faixas
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Nome da playlist (ex: Rock)..."
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="input-text"
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Banda / Artista (ex: Oasis)..."
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                className="input-text"
              />
              <input
                type="text"
                placeholder="Álbum..."
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                className="input-text"
              />
            </div>
            <input
              type="text"
              placeholder="URL da Capa (Opcional)..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="input-text"
            />
            <button onClick={handleSaveNewPlaylist} className="btn btn-yellow" style={{ width: '100%', fontWeight: 'bold' }}>
              Guardar Playlist
            </button>
          </div>
        </div>

        {/* Adicionar a Playlist Existente */}
        <div className="card" style={{ margin: 0 }}>
          <span className="card-title" style={{ color: '#f59e0b', marginBottom: '12px', display: 'block' }}>
            ➕ Adicionar a Playlist Existente
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'space-between', height: 'calc(100% - 30px)' }}>
            <select
              value={existingPlaylist}
              onChange={(e) => setExistingPlaylist(e.target.value)}
              className="select-dropdown"
            >
              <option value="">Selecione uma playlist...</option>
              {existingNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button onClick={handleAddToExistingPlaylist} className="btn btn-teal" style={{ width: '100%', fontWeight: 'bold' }}>
              Adicionar a Esta Playlist
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}