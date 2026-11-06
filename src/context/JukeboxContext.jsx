import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStreamUrl } from '../services/ytdlp';

const JukeboxContext = createContext();

export function JukeboxProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isVideoMode, setIsVideoMode] = useState(false);

  // Resolve a stream via yt-dlp sempre que o índice da fila ou o modo de vídeo mudar
  useEffect(() => {
    async function resolveStream() {
      if (queue.length > 0 && queue[currentIndex]) {
        const track = queue[currentIndex];
        const targetUrl = track.webpage_url || track.url;

        try {
          const directStream = await getStreamUrl(targetUrl, '', isVideoMode);
          setCurrentTrack({ ...track, streamUrl: directStream });
        } catch (err) {
          console.error("Erro ao resolver stream via yt-dlp:", err);
          setCurrentTrack({ ...track, streamUrl: targetUrl });
        }
      } else {
        setCurrentTrack(null);
      }
    }

    resolveStream();
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