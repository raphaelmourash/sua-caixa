import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export async function analyzePlaylist(url, proxy = '') {
  try {
    const response = await invoke('analyze_playlist', { url, proxy });
    const tracks = response
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return tracks;
  } catch (error) {
    console.error('Erro ao analisar playlist:', error);
    throw error;
  }
}

export async function getStreamUrl(videoUrl, proxy = '', videoMode = false) {
  try {
    const streamUrl = await invoke('get_stream_url', {
      url: videoUrl,
      proxy,
      videoMode
    });
    return streamUrl;
  } catch (error) {
    console.error('Erro ao obter stream via yt-dlp:', error);
    throw error;
  }
}

export async function runYtdlp(url, proxy = '') {
  try {
    const response = await invoke('run_ytdlp', { url, proxy });
    return response;
  } catch (error) {
    console.error('Erro no download:', error);
    throw error;
  }
}

// ---------- Download com progresso em tempo real ----------

/** Inicia um download. O progresso chega pelo evento "download-progress" (veja onDownloadProgress). */
export async function startDownload({ id, url, kind = 'audio', outDir = '', proxy = '' }) {
  return invoke('download_with_progress', { id, url, kind, outDir, proxy });
}

/** Escuta o progresso de todos os downloads. Devolve (via Promise) a função para cancelar a escuta. */
export function onDownloadProgress(callback) {
  return listen('download-progress', (event) => callback(event.payload));
}
