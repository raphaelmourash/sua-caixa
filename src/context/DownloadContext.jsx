import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { startDownload, onDownloadProgress } from '../services/ytdlp';

const DownloadContext = createContext();

const MAX_CONCURRENT = 2; // yt-dlp em paralelo: mais que isso costuma gerar bloqueio/lentidão
const ACTIVE = ['downloading', 'processing'];

const trackUrl = (t) => t?.webpage_url || t?.url;

// Converte um evento do Rust no novo estado do item.
// Vídeo = 2 arquivos (vídeo + áudio): a barra considera os dois; áudio = 1 arquivo + conversão.
export function applyProgress(d, p) {
  switch (p.phase) {
    case 'done':
      return { ...d, status: 'done', percent: 100, speed: null, eta: null };
    case 'error':
      return { ...d, status: 'error', error: p.message || 'Erro no download', speed: null, eta: null };
    case 'processing':
      return { ...d, status: 'processing', percent: Math.max(d.percent, 99), speed: null, eta: null };
    default: {
      let stream = d.stream ?? 0;
      if (p.filename && d.lastFile && p.filename !== d.lastFile) stream += 1; // começou o 2º arquivo
      const streams = d.kind === 'video' ? 2 : 1;
      const own = p.total ? Math.min(100, (p.downloaded / p.total) * 100) : 0;
      const overall = ((Math.min(stream, streams - 1) + own / 100) / streams) * 100;
      return {
        ...d,
        status: 'downloading',
        stream,
        lastFile: p.filename ?? d.lastFile ?? null,
        // a barra nunca anda para trás; 99% fica reservado para a etapa final
        percent: Math.min(99, Math.max(d.percent, overall)),
        speed: p.speed ?? d.speed,
        eta: p.eta ?? d.eta,
      };
    }
  }
}

export function DownloadProvider({ children }) {
  const [downloads, setDownloads] = useState([]);
  const startedRef = useRef(new Set());

  // Um único listener para todos os downloads
  useEffect(() => {
    let unlisten = null;
    let disposed = false;
    onDownloadProgress((p) => {
      setDownloads((prev) => prev.map((d) => (d.id === p.id ? applyProgress(d, p) : d)));
    })
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch((err) => console.error('Falha ao escutar o progresso:', err));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Fila: mantém no máximo MAX_CONCURRENT downloads ativos e inicia os pendentes
  useEffect(() => {
    const active = downloads.filter((d) => ACTIVE.includes(d.status)).length;
    const free = MAX_CONCURRENT - active;
    if (free <= 0) return;

    const toStart = downloads
      .filter((d) => d.status === 'queued' && !startedRef.current.has(d.id))
      .slice(0, free);
    if (toStart.length === 0) return;

    toStart.forEach((d) => startedRef.current.add(d.id));
    setDownloads((prev) =>
      prev.map((d) => (toStart.some((s) => s.id === d.id) ? { ...d, status: 'downloading' } : d))
    );

    toStart.forEach((d) => {
      startDownload({ id: d.id, url: d.url, kind: d.kind }).catch((err) => {
        // o evento "error" normalmente já chegou; isto cobre falhas antes de o yt-dlp iniciar
        setDownloads((prev) =>
          prev.map((x) =>
            x.id === d.id && x.status !== 'error'
              ? { ...x, status: 'error', error: String(err?.message || err) }
              : x
          )
        );
      });
    });
  }, [downloads]);

  const isBusy = (d) => d.status === 'queued' || ACTIVE.includes(d.status);

  /** Adiciona à fila. kind: 'audio' (mp3) ou 'video' (mp4). Ignora se a faixa já está em andamento. */
  const enqueueDownload = useCallback((track, kind = 'audio') => {
    const url = trackUrl(track);
    if (!url) return null;
    const id = crypto.randomUUID();
    setDownloads((prev) => {
      if (prev.some((d) => d.url === url && d.kind === kind && isBusy(d))) return prev;
      return [
        ...prev,
        {
          id,
          url,
          kind,
          title: track.title || url,
          thumbnail: track.thumbnail || track.thumbnails?.[0]?.url || null,
          status: 'queued',
          percent: 0,
          stream: 0,
          lastFile: null,
          speed: null,
          eta: null,
          error: null,
        },
      ];
    });
    return id;
  }, []);

  const enqueueMany = useCallback((tracks, kind = 'audio') => {
    tracks.forEach((t) => enqueueDownload(t, kind));
  }, [enqueueDownload]);

  const retryDownload = useCallback((id) => {
    startedRef.current.delete(id);
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: 'queued', percent: 0, stream: 0, lastFile: null, error: null } : d
      )
    );
  }, []);

  const removeDownload = useCallback((id) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'done' && d.status !== 'error'));
  }, []);

  const isDownloadingTrack = useCallback(
    (track) => downloads.some((d) => d.url === trackUrl(track) && isBusy(d)),
    [downloads]
  );

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        enqueueDownload,
        enqueueMany,
        retryDownload,
        removeDownload,
        clearFinished,
        isDownloadingTrack,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

// Exporta tanto com o nome no singular quanto no plural para evitar divergências de importação
export const useDownload = () => useContext(DownloadContext);
export const useDownloads = () => useContext(DownloadContext);