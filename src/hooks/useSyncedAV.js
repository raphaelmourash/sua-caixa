import { useEffect, useRef, useCallback } from "react";

const DRIFT_HARD = 0.35;
const DRIFT_SOFT = 0.08;

// audioSource: quando o <audio> só aparece depois (faixa carregada), o efeito precisa rodar de novo
// para registrar os listeners no elemento recém-criado.
export function useSyncedAV(isVideoMode, audioSource) {
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  // Sincroniza o tempo e a velocidade do vídeo mudo com o áudio mestre
  const syncVideo = useCallback(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a || !v || v.readyState < 2 || !isVideoMode) return;

    const drift = v.currentTime - a.currentTime;
    const abs = Math.abs(drift);

    if (abs > DRIFT_HARD) {
      v.currentTime = a.currentTime;
      v.playbackRate = a.playbackRate;
    } else if (abs > DRIFT_SOFT) {
      v.playbackRate = a.playbackRate * (drift > 0 ? 0.95 : 1.05);
    } else {
      v.playbackRate = a.playbackRate;
    }

    if (a.paused !== v.paused) {
      a.paused ? v.pause() : v.play().catch(() => {});
    }
  }, [isVideoMode]);

  // Quando o vídeo se torna visível, alinha imediatamente com o áudio atual sem reiniciar
  const handleVideoLoaded = useCallback(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a || !v) return;

    if (Math.abs(v.currentTime - a.currentTime) > 0.1) {
      v.currentTime = a.currentTime;
    }
    v.playbackRate = a.playbackRate;
    if (!a.paused && isVideoMode) {
      v.play().catch(() => {});
    }
  }, [isVideoMode]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => { if (videoRef.current && isVideoMode) videoRef.current.play().catch(() => {}); };
    const onPause = () => { if (videoRef.current) videoRef.current.pause(); };
    const onSeek = () => { 
      if (videoRef.current) videoRef.current.currentTime = a.currentTime; 
    };
    const onRate = () => { if (videoRef.current) videoRef.current.playbackRate = a.playbackRate; };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("seeked", onSeek);
    a.addEventListener("ratechange", onRate);
    a.addEventListener("timeupdate", syncVideo);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("seeked", onSeek);
      a.removeEventListener("ratechange", onRate);
      a.removeEventListener("timeupdate", syncVideo);
    };
  }, [syncVideo, isVideoMode, audioSource]);

  return { audioRef, videoRef, handleVideoLoaded };
}