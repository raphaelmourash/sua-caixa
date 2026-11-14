// src/services/ytdlp.js
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** 🔍 Nova função: Busca vídeos e playlists por palavras-chave ou URL de forma inteligente */
export async function searchYoutube(query, limit = 30, sort = 'relevance', proxy = '') {
  try {
    const results = await invoke('search_youtube', {
      id: 'global-youtube-search',
      query,
      limit,
      sort,
      proxy
    });
    return results;
  } catch (error) {
    if (error === 'cancelled') return [];
    console.error('Erro na busca do YouTube:', error);
    throw error;
  }
}

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

/** 🔍 Obtém as resoluções reais disponíveis no YouTube para o vídeo */
export async function getAvailableQualities(videoUrl, proxy = '') {
  try {
    const heights = await invoke('get_available_qualities', { url: videoUrl, proxy });
    if (!heights || heights.length === 0) return ["1080p", "720p", "480p", "360p"];
    return heights.map(h => `${h}p`);
  } catch (error) {
    console.error('Erro ao obter qualidades disponíveis:', error);
    return ["1080p", "720p", "480p", "360p"];
  }
}

export async function getStreamUrl(videoUrl, proxy = '', videoMode = false, quality = '1080') {
  try {
    const streamUrl = await invoke('get_stream_url', {
      url: videoUrl,
      proxy,
      videoMode,
      quality: String(quality).replace('p', '')
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

export async function startDownload({ id, url, kind = 'audio', quality = '1080', outDir = '', proxy = '' }) {
  return invoke('download_with_progress', { 
    id, 
    url, 
    kind, 
    quality: String(quality).replace('p', ''), 
    outDir, 
    proxy 
  });
}

export function onDownloadProgress(callback) {
  return listen('download-progress', (event) => callback(event.payload));
}

export async function cancelDownload(id, removePartial = true) {
  return invoke('cancel_download', { id, removePartial });
}

export async function revealInFolder(path) {
  return invoke('reveal_in_folder', { path });
}