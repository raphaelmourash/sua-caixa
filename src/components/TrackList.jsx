import React, { useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { runYtdlp } from '../services/ytdlp';

export default function TrackList({ tracks, setTracks }) {
  const { addToQueue, setQueueAndPlay } = useJukebox();
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [downloadingIdx, setDownloadingIdx] = useState(null);

  // 🛡️ Função auxiliar para garantir um título formatado e legível
  const getDisplayTitle = (track, idx) => {
    if (!track) return `Faixa ${idx + 1}`;
    if (track.title && track.title.trim() !== '' && track.title !== track.id) {
      return track.title;
    }
    // Fallback inteligente caso o título venha vazio ou seja apenas o ID
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

  // 🗑️ Limpa a fila e recolhe a área de faixas detetadas
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

  if (!tracks || tracks.length === 0) return null;

  return (
    <div className="card card-bordered" style={{ marginTop: '20px', padding: '20px' }}>
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

          {/* 🗑️ Botão para limpar e recolher a secção */}
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
  );
}