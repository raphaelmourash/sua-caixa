import React, { useState } from 'react';
import { useDownloads } from '../context/DownloadContext';
import { useJukebox } from '../context/JukeboxContext';

const formatSpeed = (bps) => {
  if (!bps) return '';
  return bps >= 1024 * 1024 ? `${(bps / 1024 / 1024).toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`;
};

const formatEta = (s) => {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${sec}`;
};

const STATUS_COLOR = {
  queued: '#64748b',
  downloading: '#008891',
  processing: '#eab308',
  done: '#22c55e',
  error: '#ef4444',
};

function statusText(d) {
  switch (d.status) {
    case 'queued': return 'Na fila…';
    case 'downloading': {
      const extra = [formatSpeed(d.speed), d.eta != null ? `faltam ${formatEta(d.eta)}` : ''].filter(Boolean).join(' • ');
      return `Baixando ${Math.floor(d.percent)}%${extra ? ' • ' + extra : ''}`;
    }
    case 'processing': return d.kind === 'video' ? 'Juntando vídeo e áudio…' : 'Convertendo para MP3…';
    case 'done': return 'Concluído ✓';
    case 'error': return d.error || 'Erro no download';
    default: return '';
  }
}

export function ProgressBar({ percent, status }) {
  const indeterminate = status === 'processing';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(percent)}
      style={{ height: '8px', borderRadius: '4px', backgroundColor: '#1e293b', overflow: 'hidden' }}
    >
      <div
        style={{
          height: '100%',
          width: `${percent}%`,
          backgroundColor: STATUS_COLOR[status] || '#008891',
          borderRadius: '4px',
          transition: 'width 0.25s ease-out, background-color 0.3s',
          ...(indeterminate ? { opacity: 0.85 } : {}),
        }}
      />
    </div>
  );
}

export default function DownloadsPanel() {
  const { downloads, retryDownload, removeDownload, clearFinished } = useDownloads();
  const { setQueueAndPlay } = useJukebox();
  const [selectedDownloads, setSelectedDownloads] = useState([]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedDownloads(downloads.map((_, idx) => idx));
    } else {
      setSelectedDownloads([]);
    }
  };

  const handleToggleSelect = (idx) => {
    setSelectedDownloads((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  if (!downloads || downloads.length === 0) {
    return (
      <div className="card card-bordered" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        Nenhum download ainda. Use o botão ⬇ em uma faixa para começar.
      </div>
    );
  }

  const finished = downloads.filter((d) => d.status === 'done' || d.status === 'error').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      
      <div className="card card-bordered" style={{ padding: '20px', margin: 0 }}>
        
        {/* Cabeçalho da Central com Contagem, Selecionar Todos e Ações */}
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '14px' }}>
            🎵 FAIXAS DETETADAS / FILA DE DOWNLOAD ({downloads.length} FAIXAS)
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={selectedDownloads.length === downloads.length && downloads.length > 0}
              />
              Selecionar Todos
            </label>

            <button
              onClick={() => {
                const tracksToQueue = selectedDownloads.length > 0 
                  ? selectedDownloads.map(i => downloads[i]) 
                  : downloads;
                setQueueAndPlay(tracksToQueue, 0);
              }}
              className="btn btn-teal btn-sm"
            >
              ▶ Tocar Fila (Jukebox)
            </button>

            {finished > 0 && (
              <button
                onClick={clearFinished}
                className="btn btn-red btn-sm"
                style={{ fontWeight: 'bold' }}
              >
                🗑️ Limpar Concluídos
              </button>
            )}
          </div>
        </div>

        {/* Lista de Downloads com Progresso e Ações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
          {downloads.map((d, idx) => (
            <div
              key={d.id || idx}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px',
              }}
            >
              <input
                type="checkbox"
                checked={selectedDownloads.includes(idx)}
                onChange={() => handleToggleSelect(idx)}
              />

              {d.thumbnail ? (
                <img src={d.thumbnail} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                  🎵
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {idx + 1}. {d.title || d.url}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
                    {d.kind === 'video' ? 'MP4' : 'MP3'}
                  </span>
                </div>
                <ProgressBar percent={d.percent || 0} status={d.status} />
                <span style={{ color: d.status === 'error' ? '#f87171' : '#94a3b8', fontSize: '11px' }}>
                  {statusText(d)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {d.status === 'error' && (
                  <button 
                    onClick={() => retryDownload(d.id)} 
                    title="Tentar de novo"
                    className="btn btn-yellow btn-sm"
                    style={{ fontSize: '11px', padding: '6px 10px' }}
                  >
                    ↻ Tentar
                  </button>
                )}
                
                <button
                  onClick={() => setQueueAndPlay(downloads, idx)}
                  className="btn btn-dark btn-sm"
                  style={{ fontSize: '11px', padding: '6px 10px' }}
                  title="Ouvir esta faixa"
                >
                  ▶ Ouvir
                </button>

                {(d.status === 'done' || d.status === 'error' || d.status === 'queued' || d.status === 'downloading') && (
                  <button 
                    onClick={() => removeDownload(d.id)} 
                    title="Remover da lista"
                    className="btn btn-red btn-sm"
                    style={{ fontSize: '11px', padding: '6px 8px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}