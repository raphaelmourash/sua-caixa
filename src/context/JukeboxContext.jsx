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
  const pendingRef = useRef(new Map());   // resoluções em andamento (evita chamar o yt-dlp 2x pela mesma faixa)
  const shownKeyRef = useRef(null);       // faixa atualmente exibida
  const [isResolving, setIsResolving] = useState(false);

  // Lê do cache de forma síncrona (sem await = sem delay). Devolve null se faltar algo.
  const getCached = (url, wantVideo) => {
    const entry = streamCache.current.get(url);
    if (!entry || Date.now() - entry.at > STREAM_TTL_MS) return null;
    if (wantVideo && !entry.video) return null;
    return entry;
  };

  // Resolve via yt-dlp, juntando chamadas iguais e guardando no cache.
  // A URL do áudio de uma faixa já em cache nunca é trocada (só o vídeo é acrescentado).
  const resolveEntry = (url, wantVideo) => {
    const cached = getCached(url, wantVideo);
    if (cached) return Promise.resolve(cached);

    const pkey = `${url}|${wantVideo ? 'v' : 'a'}`;
    let promise = pendingRef.current.get(pkey);
    if (!promise) {
      promise = (async () => {
        const res = toStreams(await getStreamUrl(url, '', wantVideo));
        const cache = streamCache.current;
        const cur = cache.get(url);
        let next;
        if (cur && Date.now() - cur.at <= STREAM_TTL_MS) {
          next = { ...cur, video: res.video ?? cur.video };
        } else {
          if (!res.audio) throw new Error('Stream sem áudio');
          next = { ...res, at: Date.now() };
        }
        cache.set(url, next);
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        return next;
      })().finally(() => pendingRef.current.delete(pkey));
      pendingRef.current.set(pkey, promise);
    }
    return promise;
  };

  // Mostra a faixa atual. Com cache = instantâneo; sem cache = mostra título/capa na hora
  // e toca assim que o stream resolver.
  useEffect(() => {
    const track = queue[currentIndex];
    if (!track) {
      shownKeyRef.current = null;
      setCurrentTrack(null);
      setIsResolving(false);
      return;
    }

    const url = track.webpage_url || track.url;
    let cancelled = false;

    const apply = (entry) => {
      shownKeyRef.current = url;
      setCurrentTrack({
        ...track,
        streamUrl: { audio: entry.audio, video: isVideoMode ? entry.video : null },
      });
    };

    const cached = getCached(url, isVideoMode);
    if (cached) {
      apply(cached);
      setIsResolving(false);
      return;
    }

    const isNewTrack = shownKeyRef.current !== url;
    if (isNewTrack) {
      // feedback imediato: troca título/capa e para o áudio antigo enquanto carrega
      shownKeyRef.current = url;
      setCurrentTrack({ ...track, streamUrl: null });
      setIsResolving(true);
    }

    resolveEntry(url, isVideoMode)
      .then((entry) => {
        if (cancelled) return;
        apply(entry);
        setIsResolving(false);
      })
      .catch((err) => {
        console.error("Erro ao resolver stream via yt-dlp:", err);
        if (cancelled) return;
        setCurrentTrack({ ...track, streamUrl: url });
        setIsResolving(false);
      });

    return () => {
      cancelled = true; // descarta respostas antigas (cliques rápidos em avançar/voltar)
    };
  }, [currentIndex, queue, isVideoMode]);

  // 🚀 Pré-carrega a próxima e a anterior em segundo plano: avançar/voltar fica instantâneo
  useEffect(() => {
    if (!currentTrack?.streamUrl) return; // só depois que a faixa atual já resolveu
    let cancelled = false;
    const neighbours = [queue[currentIndex + 1], queue[currentIndex - 1]].filter(Boolean);

    (async () => {
      for (const t of neighbours) {
        if (cancelled) return;
        try {
          await resolveEntry(t.webpage_url || t.url, isVideoMode);
        } catch {
          /* pré-carga é só otimização: falhas são ignoradas */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTrack, queue, currentIndex, isVideoMode]);

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
        isResolving,
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