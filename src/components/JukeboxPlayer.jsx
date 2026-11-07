import React, { useRef, useEffect, useState } from 'react';
import { useJukebox } from '../context/JukeboxContext';
import { runYtdlp } from '../services/ytdlp';
import QueueDrawer from './QueueDrawer';
import { useSyncedAV } from '../hooks/useSyncedAV';

// Curva de volume: 1 = linear; 2 = mais precisão nos volumes baixos (o ouvido percebe em escala logarítmica).
// O número exibido continua de 0 a 100%.
const VOLUME_CURVE = 2;

// Mantém o volume em passos de 1% (evita lixo de ponto flutuante como 0.30000000000000004)
const clampVolume = (v) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));

export default function JukeboxPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    togglePlayPause, 
    playNext, 
    playPrevious, 
    queue, 
    currentIndex,
    isVideoMode,
    isResolving,
    toggleVideoMode
  } = useJukebox();

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [volumeBadge, setVolumeBadge] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Drag & Drop do Player Flutuante
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 190 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const containerRef = useRef(null);
  const videoContainerRef = useRef(null);
  const volumeBoxRef = useRef(null);
  const badgeTimerRef = useRef(null);

  // Mostra o "65%" por ~1,2s sempre que o volume é mexido
  const flashVolumeBadge = () => {
    setVolumeBadge(true);
    clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = setTimeout(() => setVolumeBadge(false), 1200);
  };

  const changeVolume = (delta) => {
    setVolume((prev) => clampVolume(prev + delta));
    flashVolumeBadge();
  };

  useEffect(() => () => clearTimeout(badgeTimerRef.current), []);

  const audioSource = currentTrack?.streamUrl?.audio || currentTrack?.streamUrl;
  const videoSource = currentTrack?.streamUrl?.video;

  const { audioRef, videoRef, handleVideoLoaded } = useSyncedAV(isVideoMode, audioSource);

  // 🎯 Salva e restaura o currentTime exato ao alternar entre Vídeo e Áudio para evitar reset/delay
  const savedCurrentTimeRef = useRef(0);

  // Antes de mudar o modo, guarda a posição atual
  const handleToggleVideoModeWithPreservation = () => {
    const activeTime = audioRef.current?.currentTime || videoRef.current?.currentTime || progress || 0;
    savedCurrentTimeRef.current = activeTime;
    
    // Alterna o modo de visualização
    toggleVideoMode();
  };

  // O ÁUDIO É O RELÓGIO MESTRE: ao alternar o modo, só o vídeo é ajustado.
  // Nunca escrevemos no audio.currentTime aqui (isso causava seek/reset desnecessário).
  useEffect(() => {
    const targetTime = savedCurrentTimeRef.current;
    if (targetTime > 0 && videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  }, [isVideoMode]);

  // 🛟 Rede de segurança: se o <audio> recarregar a MESMA faixa (ex.: URL nova ao alternar
  // o modo), retoma de onde estava em vez de voltar ao início.
  const lastTimeRef = useRef(0);
  const lastTrackIdRef = useRef(null);
  const trackId = currentTrack?.id ?? currentTrack?.webpage_url ?? currentTrack?.url ?? null;

  const handleAudioLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (lastTrackIdRef.current === trackId && lastTimeRef.current > 1) {
      audio.currentTime = lastTimeRef.current;
      if (isPlaying) audio.play().catch(() => {});
    } else {
      lastTrackIdRef.current = trackId;
      lastTimeRef.current = 0;
    }
  };

  const handleAudioEnded = () => {
    lastTimeRef.current = 0;
    playNext();
  };

  useEffect(() => {
    if (currentTrack || queue.length > 0) {
      setIsVisible(true);
    }
  }, [currentTrack, queue, currentIndex]);

  useEffect(() => {
    if (!audioRef.current || !audioSource) return;

    if (isPlaying) {
      audioRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') console.error("Erro ao reproduzir áudio:", err);
      });
      setIsCompact(true);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, audioSource]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.pow(volume, VOLUME_CURVE);
  }, [volume]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        playNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        playPrevious();
      } else if (e.key === 'm' || e.key === 'M') {
        setVolume((prev) => (prev === 0 ? 1 : 0));
        flashVolumeBadge();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, playNext, playPrevious]);

  const handleMouseDown = (e) => {
    if (['BUTTON', 'INPUT', 'VIDEO'].includes(e.target.tagName)) return;

    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Roda do mouse: 2% por "clique" do mouse, 1% em touchpad (eventos pequenos).
  // Listener nativo com passive:false, porque o onWheel do React é passivo e ignora preventDefault().
  const hasMedia = !!currentTrack || queue.length > 0;
  useEffect(() => {
    const el = volumeBoxRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const step = Math.abs(e.deltaY) >= 50 ? 0.02 : 0.01;
      changeVolume(e.deltaY < 0 ? step : -step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isVisible, hasMedia]);

  const handleVideoClick = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      }
    }
  };

  const handleDownloadCurrent = async () => {
    if (!currentTrack) return;
    const targetUrl = currentTrack.webpage_url || currentTrack.url;
    if (!targetUrl) return;

    setIsDownloading(true);
    try {
      alert(`A iniciar download de: ${currentTrack.title || currentTrack.id}`);
      await runYtdlp(targetUrl);
      alert('Download concluído com sucesso!');
    } catch (err) {
      console.error('Erro no download:', err);
      alert('Erro ao descarregar a faixa.');
    } finally {
      setIsDownloading(false);
    }
  };

  if ((!currentTrack && queue.length === 0) || !isVisible) return null;

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    // readyState >= 1 evita gravar o "0" que o navegador dispara ao trocar o src
    if (audio.readyState >= 1 && audio.currentTime > 0) {
      lastTimeRef.current = audio.currentTime;
    }
    setProgress(audio.currentTime);
    setDuration(audio.duration || 0);
  };

  const handleSeek = (e) => {
    const seekTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setProgress(seekTime);
      if (videoRef.current) videoRef.current.currentTime = seekTime;
    }
  };

  return (
    <>
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (isCompact) setIsCompact(false);
        }}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          backgroundColor: '#0f172a',
          border: '1px solid #008891',
          borderRadius: '12px',
          padding: '10px 16px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          cursor: isDragging ? 'grabbing' : isCompact ? 'pointer' : 'grab',
          transition: isDragging ? 'none' : 'all 0.3s ease',
          maxWidth: isCompact ? '350px' : '760px',
          width: isCompact ? '350px' : '760px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#008891', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎵 Jukebox Player
          </span>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsCompact(!isCompact);
              }}
              className="btn btn-dark btn-sm"
              title={isCompact ? "Expandir Player" : "Minimizar Player"}
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >
              {isCompact ? '🗖 Expandir' : '🗕 Minimizar'}
            </button>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.pause();
                setIsVisible(false);
              }}
              className="btn btn-red btn-sm"
              title="Fechar Player"
              style={{ fontSize: '10px', padding: '2px 7px', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        </div>

        {audioSource && (
          <audio
            ref={audioRef}
            src={audioSource}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleAudioLoadedMetadata}
            onLoadStart={() => console.debug('[Jukebox] <audio> (re)carregou:', String(audioSource).slice(0, 80))} // DIAGNÓSTICO: remova depois
            onEnded={handleAudioEnded}
            style={{ display: 'none' }}
          />
        )}

        {audioSource && videoSource && !isCompact && (
          <div 
            ref={videoContainerRef}
            onClick={handleVideoClick}
            title="Clique para ecrã inteiro (Fullscreen)"
            style={{
              display: 'block',
              visibility: isVideoMode ? 'visible' : 'hidden',
              opacity: isVideoMode ? 1 : 0,
              height: isVideoMode ? 'auto' : '0px',
              overflow: 'hidden',
              marginBottom: isVideoMode ? '10px' : '0px',
              borderRadius: '8px',
              backgroundColor: '#000',
              maxHeight: '220px',
              textAlign: 'center',
              transition: 'opacity 0.2s ease',
              cursor: 'pointer'
            }}
          >
            <video
              ref={videoRef}
              src={videoSource}
              muted
              playsInline
              preload="auto"
              onLoadedData={handleVideoLoaded}
              style={{ width: '100%', maxHeight: '220px', objectFit: 'contain' }}
            />
          </div>
        )}

        {!isCompact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', width: '35px', textAlign: 'right' }}>
              {formatTime(progress)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
              style={{ flex: 1, height: '4px', accentColor: '#06b6d4', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', width: '35px' }}>
              {formatTime(duration)}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            {currentTrack?.thumbnail && (
              <img
                src={currentTrack.thumbnail}
                alt="Capa"
                style={{ 
                  width: isCompact ? '32px' : '42px', 
                  height: isCompact ? '32px' : '42px', 
                  borderRadius: isCompact ? '50%' : '6px', 
                  objectFit: 'cover' 
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '10px', color: '#06b6d4', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {isResolving ? '⏳ Carregando…' : isPlaying ? '▶ Tocando' : '⏸ Pausado'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isCompact ? '90px' : '240px' }}>
                {currentTrack ? currentTrack.title || currentTrack.id : 'Nenhuma mídia'}
              </span>
            </div>
          </div>

          {/* Controlos com stopPropagation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                playPrevious();
              }} 
              disabled={currentIndex === 0} 
              className="btn btn-dark btn-sm" 
              style={{ borderRadius: '50%', width: isCompact ? '28px' : '30px', height: isCompact ? '28px' : '30px', padding: 0, fontSize: '11px' }}
              title="Retroceder"
            >
              ⏮
            </button>
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                togglePlayPause();
              }} 
              className="btn btn-yellow" 
              style={{ width: isCompact ? '34px' : '38px', height: isCompact ? '34px' : '38px', borderRadius: '50%', padding: 0, fontSize: '14px' }}
              title={isPlaying ? "Pausar" : "Tocar"}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                playNext();
              }} 
              disabled={currentIndex + 1 >= queue.length} 
              className="btn btn-dark btn-sm" 
              style={{ borderRadius: '50%', width: isCompact ? '28px' : '30px', height: isCompact ? '28px' : '30px', padding: 0, fontSize: '11px' }}
              title="Avançar"
            >
              ⏭
            </button>
          </div>

          {/* Controlo de Volume com stopPropagation */}
          <div
            ref={volumeBoxRef}
            onClick={(e) => e.stopPropagation()}
            title="Roda do mouse: ±2% (touchpad: ±1%) • Arraste para ajustar"
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'ns-resize' }}
          >
            {/* Badge flutuante (modo compacto, onde não há espaço para o texto fixo) */}
            {isCompact && volumeBadge && (
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: '6px',
                backgroundColor: '#008891', color: '#fff', fontSize: '11px', fontWeight: 'bold',
                padding: '2px 6px', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {Math.round(volume * 100)}%
              </div>
            )}

            <span style={{ fontSize: '12px' }}>
              {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              aria-label="Volume"
              aria-valuetext={`${Math.round(volume * 100)}%`}
              onChange={(e) => {
                setVolume(clampVolume(parseFloat(e.target.value)));
                flashVolumeBadge();
              }}
              style={{ width: isCompact ? '52px' : '90px', accentColor: '#008891', cursor: 'pointer' }}
            />
            {!isCompact && (
              <span style={{ fontSize: '11px', color: '#94a3b8', width: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(volume * 100)}%
              </span>
            )}
          </div>

          {!isCompact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={handleDownloadCurrent} disabled={isDownloading} className="btn btn-dark btn-sm" style={{ backgroundColor: '#0284c7', color: '#fff', fontSize: '11px' }}>
                {isDownloading ? '⬇ ...' : '⬇ Baixar'}
              </button>
              
              <button onClick={() => setIsQueueOpen(true)} className="btn btn-dark btn-sm" style={{ fontSize: '11px', backgroundColor: '#1e293b' }}>
                🎵 Fila ({queue.length})
              </button>

              <button 
                onClick={handleToggleVideoModeWithPreservation} 
                className={`btn btn-sm ${isVideoMode ? 'btn-teal' : 'btn-dark'}`} 
                style={{ fontSize: '11px', fontWeight: 'bold' }}
              >
                {isVideoMode ? '🎬 Vídeo' : '🎵 Áudio'}
              </button>
            </div>
          )}
        </div>
      </div>

      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </>
  );
}