import React, { useState, useEffect } from 'react';
import { useDownloads } from '../context/DownloadContext';
import { useJukebox } from '../context/JukeboxContext';
import { getAvailableQualities } from '../services/ytdlp';

const formatBytes = (n) => {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i ? 1 : 0).replace('.', ',')} ${units[i]}`;
};
const formatSpeed = (bps) => (bps ? `${formatBytes(bps)}/s` : '');
const formatEta = (s) => {
  if (s == null) return '';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const formatDay = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const STATUS_COLOR = {
  staged: '#64748b', queued: '#64748b', preparing: '#3b82f6', downloading: '#008891', processing: '#eab308',
  paused: '#eab308', done: '#22c55e', error: '#ef4444', cancelled: '#ef4444',
};

function statusText(d) {
  switch (d.status) {
    case 'staged': return d.duplicateAt ? `Já baixada em ${formatDay(d.duplicateAt)} — baixar de novo?` : 'Aguardando você confirmar';
    case 'queued': return 'Na fila…';
    case 'preparing': return 'Analisando link e preparando…';
    case 'downloading': 
      return d.percent && Math.floor(d.percent) > 0 
        ? `Baixando ${Math.floor(d.percent)}%` 
        : 'Analisando link e preparando…';
    case 'processing': return d.kind === 'video' ? 'Juntando vídeo e áudio…' : 'Convertendo para MP3…';
    case 'paused': return `Pausado em ${Math.floor(d.percent || 0)}%`;
    case 'done': return 'Concluído ✓';
    case 'cancelled': return 'Cancelado';
    case 'error': return d.error || 'Erro no download';
    default: return '';
  }
}

function detailText(d) {
  if (d.status !== 'downloading') return '';
  const parts = [];
  if (d.total) {
    const part = d.kind === 'video' ? `arquivo ${Math.min(d.stream + 1, 2)}/2 · ` : '';
    parts.push(`${part}${formatBytes(d.downloaded)} / ${formatBytes(d.total)}`);
  }
  if (d.speed) parts.push(formatSpeed(d.speed));
  if (d.eta != null) parts.push(`faltam ${formatEta(d.eta)}`);
  return parts.join(' • ');
}

export function ProgressBar({ percent, status }) {
  const isIndeterminate = status === 'processing' || status === 'preparing' || (status === 'downloading' && percent === 0);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(percent)}
      style={{ height: '8px', borderRadius: '4px', backgroundColor: '#1e293b', overflow: 'hidden', position: 'relative' }}
    >
      <div
        style={{
          height: '100%',
          width: isIndeterminate ? '100%' : `${percent}%`,
          backgroundColor: STATUS_COLOR[status] || '#008891',
          borderRadius: '4px',
          transition: 'width 0.25s ease-out, background-color 0.3s',
          opacity: isIndeterminate ? 0.7 : 1,
          ...(isIndeterminate ? {
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
            backgroundSize: '200% 100%',
            animation: 'pulseLoading 1.5s infinite linear'
          } : {})
        }}
      />
    </div>
  );
}

function KindToggle({ value, onChange, small }) {
  const opt = (k, label) => (
    <button
      type="button"
      onClick={() => onChange(k)}
      aria-pressed={value === k}
      style={{
        border: 'none', cursor: 'pointer', padding: small ? '2px 8px' : '5px 12px', fontSize: small ? '11px' : '12px', fontWeight: 600,
        background: value === k ? '#008891' : 'transparent', color: value === k ? '#fff' : '#94a3b8',
      }}
    >
      {label}
    </button>
  );
  return (
    <span style={{ display: 'inline-flex', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
      {opt('audio', 'MP3')}
      {opt('video', 'MP4')}
    </span>
  );
}

function DynamicQualitySelect({ url, value, onChange, small }) {
  const [qualities, setQualities] = useState(["1080p", "720p", "480p", "360p"]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let isMounted = true;
    setLoading(true);
    getAvailableQualities(url)
      .then((res) => {
        if (isMounted && res && res.length > 0) {
          setQualities(res);
        }
      })
      .catch((err) => console.error("Erro ao buscar qualidades para download:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [url]);

  return (
    <select
      value={value ? String(value).replace('p', '') : '1080'}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
      aria-label="Qualidade do vídeo"
      style={{
        background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
        borderRadius: '6px', padding: small ? '2px 6px' : '4px 8px', fontSize: small ? '11px' : '12px', outline: 'none', cursor: 'pointer',
      }}
    >
      {loading ? (
        <option value="1080">Carregando...</option>
      ) : (
        qualities.map((q) => {
          const cleanVal = q.replace('p', '');
          return (
            <option key={cleanVal} value={cleanVal}>
              {q}
            </option>
          );
        })
      )}
    </select>
  );
}

function QualitySelect({ value, onChange, small }) {
  return (
    <select
      value={value || '1080'}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Qualidade do vídeo"
      style={{
        background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
        borderRadius: '6px', padding: small ? '2px 6px' : '4px 8px', fontSize: small ? '11px' : '12px', outline: 'none', cursor: 'pointer',
      }}
    >
      <option value="1080">1080p</option>
      <option value="720">720p</option>
      <option value="480">480p</option>
      <option value="360">360p</option>
    </select>
  );
}

const small = { fontSize: '11px', padding: '6px 10px' };

const toTrack = (d) => d.track || { title: d.title, webpage_url: d.url, thumbnail: d.thumbnail };

export default function DownloadsPanel({ onPreview }) {
  const api = useDownloads();
  const { setQueueAndPlay } = useJukebox();
  const { downloads, settings } = api;
  const [selected, setSelected] = useState(() => new Set());

  const selectedIds = downloads.filter((d) => selected.has(d.id)).map((d) => d.id);
  const allSelected = downloads.length > 0 && selectedIds.length === downloads.length;

  const handleSelectAll = (e) => setSelected(e.target.checked ? new Set(downloads.map((d) => d.id)) : new Set());
  const handleToggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handlePlayAll = () => {
    const list = selectedIds.length > 0 ? downloads.filter((d) => selected.has(d.id)) : downloads;
    if (list.length > 0) setQueueAndPlay(list.map(toTrack), 0);
  };

  const handleListen = (d, idx) => {
    if (onPreview) onPreview(toTrack(d));
    else setQueueAndPlay(downloads.map(toTrack), idx);
  };

  const stagedFree = downloads.filter((d) => d.status === 'staged' && !d.duplicateAt).length;
  const stagedDup = downloads.filter((d) => d.status === 'staged' && d.duplicateAt).length;
  const finished = downloads.filter((d) => ['done', 'error', 'cancelled'].includes(d.status)).length;
  const count = (...s) => downloads.filter((d) => s.includes(d.status)).length;
  const summary = [
    count('preparing', 'downloading', 'processing') && `${count('preparing', 'downloading', 'processing')} baixando`,
    count('queued') && `${count('queued')} na fila`,
    count('paused') && `${count('paused')} pausada${count('paused') > 1 ? 's' : ''}`,
    count('staged') && `${count('staged')} aguardando`,
    count('done') && `${count('done')} concluída${count('done') > 1 ? 's' : ''}`,
    count('error', 'cancelled') && `${count('error', 'cancelled')} com problema`,
  ].filter(Boolean).join(' • ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div className="card card-bordered" style={{ padding: '20px', margin: 0 }}>

        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '14px' }}>
            ⬇ FILA DE DOWNLOAD ({downloads.length} {downloads.length === 1 ? 'FAIXA' : 'FAIXAS'})
          </span>

          {downloads.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" onChange={handleSelectAll} checked={allSelected} />
                Selecionar Todos
              </label>

              <button onClick={handlePlayAll} className="btn btn-teal btn-sm">
                ▶ Tocar Fila (Jukebox)
              </button>

              {finished > 0 && (
                <button onClick={api.clearFinished} className="btn btn-red btn-sm" style={{ fontWeight: 'bold' }}>
                  🗑️ Limpar Concluídos
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #1f2937' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px' }}>
            Formato padrão
            <KindToggle value={settings.defaultKind} onChange={api.setDefaultKind} />
          </span>

          {settings.defaultKind === 'video' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px' }}>
              Qualidade padrão
              <QualitySelect value={settings.defaultQuality} onChange={api.setDefaultQuality} />
            </span>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.autoStart} onChange={(e) => api.setAutoStart(e.target.checked)} />
            Baixar assim que adicionar
          </label>

          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
            {stagedFree > 0 && (
              <button onClick={api.startAllStaged} className="btn btn-teal btn-sm" style={{ fontWeight: 'bold' }}>
                ⬇ Baixar tudo ({stagedFree})
              </button>
            )}
            {stagedDup > 0 && (
              <button onClick={api.removeDuplicates} className="btn btn-dark btn-sm">
                Remover já baixadas ({stagedDup})
              </button>
            )}
          </span>
        </div>

        {downloads.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', lineHeight: 1.7 }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>⬇</div>
            <strong style={{ color: '#e2e8f0' }}>Nenhum download por aqui ainda</strong>
            <div>Clique em <strong>⬇ Baixar</strong> em qualquer faixa. Você escolhe MP3 ou MP4 e a resolução desejada acima.</div>
          </div>
        ) : (
          <>
            {summary && <div style={{ color: '#22d3ee', fontWeight: 'bold', fontSize: '12px', marginBottom: '10px' }}>{summary}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
              {downloads.map((d, idx) => {
                const active = d.status === 'preparing' || d.status === 'downloading' || d.status === 'processing';
                const detail = detailText(d);
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                      backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px',
                    }}
                  >
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => handleToggle(d.id)} />

                    {d.thumbnail ? (
                      <img src={d.thumbnail} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                        🎵
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {idx + 1}. {d.title || d.url}
                        </span>
                        {d.status === 'staged' ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <KindToggle small value={d.kind} onChange={(k) => api.setItemKind(d.id, k)} />
                            {d.kind === 'video' && (
                              <DynamicQualitySelect 
                                small 
                                url={d.url} 
                                value={d.quality} 
                                onChange={(q) => api.setItemQuality(d.id, q)} 
                              />
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
                            {d.kind === 'video' ? `MP4 (${d.quality || '1080'}p)` : 'MP3'}
                          </span>
                        )}
                      </div>

                      {d.status !== 'staged' && <ProgressBar percent={d.percent || 0} status={d.status} />}

                      <span style={{ color: d.status === 'error' ? '#f87171' : '#94a3b8', fontSize: '11px' }}>
                        {statusText(d)}{detail ? ` • ${detail}` : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {d.status === 'staged' && (
                        <button onClick={() => api.startStaged(d.id)} className="btn btn-teal btn-sm" style={{ ...small, fontWeight: 'bold' }}>
                          {d.duplicateAt ? '⬇ Baixar de novo' : '⬇ Baixar'}
                        </button>
                      )}
                      {d.status === 'paused' && (
                        <button onClick={() => api.resumeDownload(d.id)} className="btn btn-teal btn-sm" style={{ ...small, fontWeight: 'bold' }}>
                          ▶ Retomar
                        </button>
                      )}
                      {(d.status === 'downloading' || d.status === 'preparing') && (
                        <button onClick={() => api.pauseDownload(d.id)} className="btn btn-dark btn-sm" style={small} title="Pausar">
                          ⏸ Pausar
                        </button>
                      )}
                      {d.status === 'queued' && (
                        <button onClick={() => api.pauseDownload(d.id)} className="btn btn-dark btn-sm" style={small} title="Tirar da fila">
                          ⏸
                        </button>
                      )}
                      {(d.status === 'error' || d.status === 'cancelled') && (
                        <button onClick={() => api.retryDownload(d.id)} title="Tentar de novo" className="btn btn-yellow btn-sm" style={small}>
                          ↻ Tentar
                        </button>
                      )}
                      {d.status === 'done' && d.path && (
                        <button onClick={() => api.openFolder(d.id)} className="btn btn-dark btn-sm" style={small} title="Mostrar o arquivo na pasta">
                          📂 Abrir pasta
                        </button>
                      )}

                      <button onClick={() => handleListen(d, idx)} className="btn btn-dark btn-sm" style={small} title="Ouvir esta faixa">
                        ▶ Ouvir
                      </button>

                      <button
                        onClick={() => api.cancelDownload(d.id)}
                        className="btn btn-red btn-sm"
                        style={{ fontSize: '11px', padding: '6px 8px' }}
                        title={active ? 'Cancelar' : 'Remover'}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}