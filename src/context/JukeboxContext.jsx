import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getStreamUrl } from '../services/ytdlp';

const JukeboxContext = createContext();

// URLs assinadas do YouTube expiram em ~6h; renovamos antes disso
const STREAM_TTL_MS = 5 * 60 * 60 * 1000;

// getStreamUrl pode devolver string (só áudio) ou { audio, video }
const toStreams = (r) =>
  typeof r === 'string'
    ? { audio: r, video: null }
    : { audio: r?.audio ?? null, video: r?.video ?? null };

export function JukeboxProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isVideoMode, setIsVideoMode] = useState(false);

  // Cache das URLs resolvidas por faixa: a URL do ÁUDIO nunca muda enquanto a faixa toca,
  // senão o <audio> recarrega e a música reinicia do começo.
  const streamCache = useRef(new Map());

  // Resolve a stream via yt-dlp (com cache por faixa)
  useEffect(() => {
    const track = queue[currentIndex];
    if (!track) {
      setCurrentTrack(null);
      return;
    }

    const targetUrl = track.webpage_url || track.url;
    let cancelled = false;

    async function resolveStream() {
      try {
        const cache = streamCache.current;
        let entry = cache.get(targetUrl);
        if (entry && Date.now() - entry.at > STREAM_TTL_MS) entry = null;

        if (!entry) {
          // Primeira resolução da faixa (ou URL expirada)
          const res = toStreams(await getStreamUrl(targetUrl, '', isVideoMode));
          if (!res.audio) throw new Error('Stream sem áudio');
          entry = { ...res, at: Date.now() };
        } else if (isVideoMode && !entry.video) {
          // Já temos o áudio: busca só o vídeo e MANTÉM a URL do áudio (não reinicia a música)
          const res = toStreams(await getStreamUrl(targetUrl, '', true));
          entry = { ...entry, video: res.video };
        }

        cache.set(targetUrl, entry);
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        if (cancelled) return;

        setCurrentTrack({
          ...track,
          streamUrl: { audio: entry.audio, video: isVideoMode ? entry.video : null },
        });
      } catch (err) {
        console.error("Erro ao resolver stream via yt-dlp:", err);
        if (!cancelled) setCurrentTrack({ ...track, streamUrl: targetUrl });
      }
    }

    resolveStream();
    return () => {
      cancelled = true; // descarta respostas antigas (troca rápida de faixa/modo)
    };
  }, [currentIndex, queue, isVideoMode]);

  // Adiciona faixas à fila existente
  const addToQueue = (tracks) => {
    setQueue((prev) => {
      const newQueue = [...prev, ...tracks];
      if (!isPlaying && !currentTrack && newQueue.length > 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
      }
      return newQueue;
    });
  };

  // Define uma nova lista de reprodução e começa imediatamente na posição indicada
  const setQueueAndPlay = (tracks, startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    setQueue(tracks);
    setCurrentIndex(startIndex);
    setIsPlaying(true);
  };

  const removeFromQueue = (indexToRemove) => {
    setQueue((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (indexToRemove === currentIndex) {
        if (updated.length > 0) {
          setCurrentIndex(Math.min(indexToRemove, updated.length - 1));
        } else {
          setCurrentIndex(0);
          setIsPlaying(false);
        }
      } else if (indexToRemove < currentIndex) {
        setCurrentIndex((prevIdx) => prevIdx - 1);
      }
      return updated;
    });
  };

  // 🔄 REORDENAÇÃO DRAG & DROP DA FILA
  const reorderQueue = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    setQueue((prevQueue) => {
      const updated = [...prevQueue];
      const [movedItem] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedItem);
      return updated;
    });

    // Ajusta o índice ativo para que a música a tocar continue a ser a correta
    if (currentIndex === fromIndex) {
      setCurrentIndex(toIndex);
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      setCurrentIndex((prev) => prev - 1);
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const toggleVideoMode = () => {
    setIsVideoMode((prev) => !prev);
  };

  const playIndex = (index) => {
    if (index >= 0 && index < queue.length) {
      setCurrentIndex(index);
      setIsPlaying(true);
    }
  };

  // Avança para a próxima música na ordem da lista
  const playNext = () => {
    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((prev) => prev + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  // Volta para a música anterior na ordem da lista
  const playPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    if (!currentTrack && queue.length > 0) {
      setCurrentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <JukeboxContext.Provider
      value={{
        queue,
        currentTrack,
        isPlaying,
        currentIndex,
        isVideoMode,
        addToQueue,
        setQueueAndPlay,
        removeFromQueue,
        reorderQueue, // <--- Função adicionada ao contexto
        playIndex,
        playNext,
        playPrevious,
        togglePlayPause,
        toggleVideoMode,
      }}
    >
      {children}
    </JukeboxContext.Provider>
  );
}

export const useJukebox = () => useContext(JukeboxContext);