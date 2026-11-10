import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  startDownload,
  onDownloadProgress,
  cancelDownload as cancelCmd,
  revealInFolder,
} from '../services/ytdlp';

const DownloadContext = createContext();

const MAX_CONCURRENT = 2; // yt-dlp em paralelo: mais que isso costuma gerar bloqueio/lentidão
const ACTIVE = ['preparing', 'downloading', 'processing'];
const BUSY = ['staged', 'queued', 'preparing', 'downloading', 'processing', 'paused'];
const MAX_ITEMS = 200;
const MAX_HISTORY = 500;

const KEY_ITEMS = 'suacaixa:downloads:items';
const KEY_HISTORY = 'suacaixa:downloads:history';
const KEY_SETTINGS = 'suacaixa:downloads:settings';
export const OPEN_TAB_EVENT = 'suacaixa:abrir-aba'; // o SectionTabs escuta este evento

const read = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem storage: tudo bem */ }
};

const trackUrl = (t) => t?.webpage_url || t?.url;

const ID_RE = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/;
/** ID do vídeo do YouTube (a mesma música aparece como watch?v=, youtu.be, &list=...). */
export function getVideoId(track) {
  const m = (trackUrl(track) || '').match(ID_RE);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(track?.id || '') ? track.id : null;
}

// Converte um evento do Rust no novo estado do item.
// Vídeo = 2 arquivos (vídeo + áudio): a barra considera os dois; áudio = 1 arquivo + conversão.
export function applyProgress(d, p) {
  switch (p.phase) {
    case 'preparing':
      return { ...d, status: 'preparing', percent: 0, speed: null, eta: null };
    case 'done': {
      const finalPath = p.path ?? p.filename ?? d.path ?? '';
      return { 
        ...d, 
        status: 'done', 
        percent: 100, 
        speed: null, 
        eta: null, 
        path: finalPath, 
        wantPause: false 
      };
    }
    case 'error':
      return { ...d, status: 'error', error: p.message || 'Erro no download', speed: null, eta: null };
    case 'cancelled':
      return d.wantPause
        ? { ...d, status: 'paused', wantPause: false, speed: null, eta: null }
        : { ...d, status: 'cancelled', speed: null, eta: null };
    case 'processing':
      return { ...d, status: 'processing', percent: Math.max(d.percent || 0, 99), speed: null, eta: null };
    default: {
      let stream = d.stream ?? 0;
      if (p.filename && d.lastFile && p.filename !== d.lastFile) stream += 1; // começou o 2º arquivo
      const streams = d.kind === 'video' ? 2 : 1;
      
      // Utiliza diretamente o percent calculado pelo Rust ou calcula como fallback
      const own = p.percent ?? (p.total ? Math.min(100, (p.downloaded / p.total) * 100) : 0);
      const overall = ((Math.min(stream, streams - 1) + own / 100) / streams) * 100;
      
      return {
        ...d,
        status: d.wantPause ? d.status : 'downloading',
        stream,
        lastFile: p.filename ?? d.lastFile ?? null,
        downloaded: p.downloaded ?? d.downloaded,
        total: p.total ?? d.total,
        // a barra nunca anda para trás; 99% fica reservado para a etapa final
        percent: Math.min(99, Math.max(d.percent || 0, overall)),
        speed: p.speed ?? d.speed,
        eta: p.eta ?? d.eta,
        path: p.path ?? p.filename ?? d.path,
      };
    }
  }
}

// Ao reabrir o app, nada está realmente rodando: o que estava ativo/na fila vira "pausado" (dá para retomar)
export function restoreItems(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.map((d) =>
    ['queued', 'preparing', 'downloading', 'processing'].includes(d.status)
      ? { ...d, status: 'paused', speed: null, eta: null, wantPause: false }
      : d
  );
}

/** Cria os itens novos (função pura). Faixa já baixada antes entra "aguardando decisão" (staged). */
export function buildItems(prev, tracks, kind, autoStart, history, force = false, quality = '1080') {
  const items = [...prev];
  const summary = { added: 0, duplicates: 0, ignored: 0 };
  for (const track of tracks) {
    const url = trackUrl(track);
    if (!url) { summary.ignored += 1; continue; }
    const key = getVideoId(track) || url;
    if (items.some((d) => d.key === key && d.kind === kind && BUSY.includes(d.status))) {
      summary.ignored += 1; // já está na lista
      continue;
    }
    const past = force ? null : history.find((h) => h.key === key && h.kind === kind);
    // eslint-disable-next-line no-unused-vars
    const { streamUrl, ...clean } = track; // não guardar URLs assinadas (expiram)
    items.push({
      id: crypto.randomUUID(),
      key,
      url,
      kind,
      quality, // altura máxima do vídeo (só vale para MP4)
      track: clean,
      title: track.title || url,
      thumbnail: track.thumbnail || track.thumbnails?.[0]?.url || null,
      status: past || !autoStart ? 'staged' : 'queued',
      duplicateAt: past ? past.at : null,
      percent: 0,
      stream: 0,
      lastFile: null,
      downloaded: null,
      total: null,
      speed: null,
      eta: null,
      error: null,
      path: null,
      wantPause: false,
      addedAt: Date.now(),
    });
    if (past) summary.duplicates += 1; else summary.added += 1;
  }
  return { items, summary };
}

function DownloadToast({ notice, onOpen, onClose }) {
  if (!notice) return null;
  const btn = { border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' };
  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 400,
        display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '90vw', padding: '10px 14px',
        backgroundColor: '#0b1020', border: '1px solid #008891', borderRadius: '10px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)', color: '#e2e8f0', fontSize: '13px',
      }}
    >
      <span>{notice.text}</span>
      {notice.action && (
        <button type="button" onClick={onOpen} style={{ ...btn, background: '#008891', borderColor: '#008891', color: '#fff', fontWeight: 600 }}>
          Abrir Central
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Fechar aviso" style={btn}>✕</button>
    </div>
  );
}

export function DownloadProvider({ children }) {
  const [downloads, setDownloads] = useState(() => restoreItems(read(KEY_ITEMS, [])));
  const downloadsRef = useRef(downloads);
  const [history, setHistory] = useState(() => read(KEY_HISTORY, []));
  const historyRef = useRef(history);
  const [settings, setSettings] = useState(() => ({ defaultKind: 'audio', defaultQuality: '1080', autoStart: false, ...read(KEY_SETTINGS, {}) }));
  const settingsRef = useRef(settings);
  const [notice, setNotice] = useState(null); // { text, action }
  const noticeTimer = useRef(null);

  // Toda alteração da lista passa por aqui: o ref é a "fonte da verdade" síncrona (sem perder atualizações)
  const commit = useCallback((fn) => {
    const next = fn(downloadsRef.current);
    downloadsRef.current = next;
    setDownloads(next);
  }, []);

  const flash = useCallback((text, action = false) => {
    setNotice({ text, action });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 7000);
  }, []);
  const closeNotice = useCallback(() => setNotice(null), []);
  const openCentral = useCallback(() => {
    setNotice(null);
    window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: 'downloads' }));
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const addHistory = useCallback((entry) => {
    const next = [entry, ...historyRef.current.filter((h) => !(h.key === entry.key && h.kind === entry.kind))].slice(0, MAX_HISTORY);
    historyRef.current = next;
    setHistory(next);
  }, []);

  // Persistência (o progresso muda várias vezes por segundo: grava com atraso)
  useEffect(() => {
    const t = setTimeout(() => write(KEY_ITEMS, downloads.slice(-MAX_ITEMS)), 400);
    return () => clearTimeout(t);
  }, [downloads]);
  useEffect(() => write(KEY_HISTORY, history), [history]);
  useEffect(() => write(KEY_SETTINGS, settings), [settings]);

  // Um único listener para todos os downloads
  useEffect(() => {
    let unlisten = null;
    let disposed = false;
    onDownloadProgress((p) => {
      const item = downloadsRef.current.find((d) => d.id === p.id);
      if (!item) return;
      commit((items) => items.map((d) => (d.id === p.id ? applyProgress(d, p) : d)));
      if (p.phase === 'done') {
        addHistory({ key: item.key, kind: item.kind, title: item.title, path: p.path ?? p.filename ?? null, at: Date.now() });
      }
    })
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch((err) => console.error('Falha ao escutar o progresso:', err));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [commit, addHistory]);

  // Fila: mantém no máximo MAX_CONCURRENT downloads ativos e inicia os pendentes
  useEffect(() => {
    const cur = downloadsRef.current;
    const free = MAX_CONCURRENT - cur.filter((d) => ACTIVE.includes(d.status)).length;
    if (free <= 0) return;
    const toStart = cur.filter((d) => d.status === 'queued').slice(0, free);
    if (toStart.length === 0) return;

    commit((items) =>
      items.map((d) => (toStart.some((s) => s.id === d.id) ? { ...d, status: 'preparing', error: null, speed: null, eta: null } : d))
    );
    toStart.forEach((d) => {
      startDownload({ id: d.id, url: d.url, kind: d.kind, quality: d.quality }).catch((err) => {
        // o evento "error" normalmente já chegou; isto cobre falhas antes de o yt-dlp iniciar
        commit((items) =>
          items.map((x) => (x.id === d.id && x.status !== 'error' ? { ...x, status: 'error', error: String(err?.message || err) } : x))
        );
      });
    });
  }, [downloads, commit]);

  // ---------- Configurações ----------
  const updateSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
  }, []);

  // ---------- Adicionar ----------
  /** kind: 'audio' (mp3) ou 'video' (mp4); sem kind usa o formato padrão. Devolve { added, duplicates, ignored }. */
  const enqueueMany = useCallback((tracks, kind, opts = {}) => {
    const k = kind || settingsRef.current.defaultKind;
    const { items, summary } = buildItems(downloadsRef.current, tracks, k, settingsRef.current.autoStart, historyRef.current, !!opts.force, settingsRef.current.defaultQuality);
    if (summary.added + summary.duplicates > 0) commit(() => items);

    // Aviso global: o usuário vê para onde a faixa foi, mesmo estando em outra aba
    const parts = [];
    const n = summary.added;
    if (n) {
      const single = n === 1 && tracks.length === 1;
      const subject = single ? `“${tracks[0].title || 'Faixa'}”` : `${n} faixas`;
      const verb = single ? 'foi' : 'foram';
      parts.push(
        settingsRef.current.autoStart
          ? `${subject} ${verb} para a Central de Downloads.`
          : `${subject} ${verb} para a Central de Downloads — aguardando você baixar.`
      );
    }
    if (summary.duplicates) {
      const d = summary.duplicates;
      parts.push(`${d} já ${d === 1 ? 'foi baixada' : 'foram baixadas'} antes — aguardando sua decisão na Central.`);
    }
    if (summary.ignored) parts.push(`${summary.ignored} já ${summary.ignored === 1 ? 'está' : 'estão'} na Central.`);
    if (parts.length) flash(parts.join(' • '), true);
    return summary;
  }, [commit, flash]);

  /** opts.force = true: baixa de novo mesmo que já esteja no histórico (o usuário já confirmou). */
  const enqueueDownload = useCallback((track, kind, opts) => enqueueMany([track], kind, opts), [enqueueMany]);

  // ---------- Controle ----------
  const startStaged = useCallback((id) => {
    commit((items) => items.map((d) => (d.id === id && d.status === 'staged' ? { ...d, status: 'queued' } : d)));
  }, [commit]);

  const startAllStaged = useCallback(() => {
    commit((items) => items.map((d) => (d.status === 'staged' && !d.duplicateAt ? { ...d, status: 'queued' } : d)));
  }, [commit]);

  const setItemKind = useCallback((id, kind) => {
    commit((items) => items.map((d) => (d.id === id && d.status === 'staged' ? { ...d, kind } : d)));
  }, [commit]);

  const setItemQuality = useCallback((id, quality) => {
    commit((items) => items.map((d) => (d.id === id && d.status === 'staged' ? { ...d, quality } : d)));
  }, [commit]);

  const callCancel = useCallback(async (id, removePartial, retried = false) => {
    try {
      const ok = await cancelCmd(id, removePartial);
      // se o processo acabou de nascer, ainda não está registrado: tenta mais uma vez
      if (!ok && !retried) setTimeout(() => callCancel(id, removePartial, true), 500);
    } catch (err) {
      console.error('Falha ao cancelar/pausar:', err);
    }
  }, []);

  const pauseDownload = useCallback((id) => {
    const d = downloadsRef.current.find((x) => x.id === id);
    if (!d) return;
    if (d.status === 'queued') {
      commit((items) => items.map((x) => (x.id === id ? { ...x, status: 'staged' } : x)));
    } else if (ACTIVE.includes(d.status)) {
      commit((items) => items.map((x) => (x.id === id ? { ...x, wantPause: true } : x)));
      callCancel(id, false); // mantém o parcial para retomar
    }
  }, [commit, callCancel]);

  const resumeDownload = useCallback((id) => {
    commit((items) => items.map((d) => (d.id === id && d.status === 'paused' ? { ...d, status: 'queued', error: null } : d)));
  }, [commit]);

  const retryDownload = useCallback((id) => {
    commit((items) =>
      items.map((d) =>
        d.id === id && (d.status === 'error' || d.status === 'cancelled')
          ? { ...d, status: 'queued', percent: 0, stream: 0, lastFile: null, downloaded: null, total: null, error: null }
          : d
      )
    );
  }, [commit]);

  const removeDownload = useCallback((id) => {
    commit((items) => items.filter((d) => d.id !== id));
  }, [commit]);

  /** Em andamento: cancela e apaga os parciais. Nos demais estados: só remove da lista. */
  const cancelDownload = useCallback((id) => {
    const d = downloadsRef.current.find((x) => x.id === id);
    if (!d) return;
    if (ACTIVE.includes(d.status)) {
      commit((items) => items.map((x) => (x.id === id ? { ...x, wantPause: false } : x)));
      callCancel(id, true);
    } else {
      removeDownload(id);
    }
  }, [commit, callCancel, removeDownload]);

  const clearFinished = useCallback(() => {
    commit((items) => items.filter((d) => !['done', 'error', 'cancelled'].includes(d.status)));
  }, [commit]);

  const removeDuplicates = useCallback(() => {
    commit((items) => items.filter((d) => !(d.status === 'staged' && d.duplicateAt)));
  }, [commit]);

  const openFolder = useCallback((id) => {
    const d = downloadsRef.current.find((x) => x.id === id);
    if (!d?.path) { 
      flash('Caminho do arquivo indisponível.'); 
      return; 
    }
    revealInFolder(d.path).catch(() => flash('Não foi possível abrir a pasta.'));
  }, [flash]);

  // ---------- Consultas ----------
  const isDownloadingTrack = useCallback(
    (track) => {
      const key = getVideoId(track) || trackUrl(track);
      return downloads.some((d) => d.key === key && ['queued', ...ACTIVE].includes(d.status));
    },
    [downloads]
  );

  /** A faixa já foi baixada alguma vez (útil para mostrar um selo nas listas). */
  const isDownloaded = useCallback(
    (track, kind) => {
      const key = getVideoId(track) || trackUrl(track);
      return history.some((h) => h.key === key && (!kind || h.kind === kind));
    },
    [history]
  );

  /** 'busy' (na fila/baixando) | 'waiting' (aguardando você / pausada) | 'downloaded' | null */
  const getTrackState = useCallback(
    (track) => {
      const key = getVideoId(track) || trackUrl(track);
      const item = downloads.find((d) => d.key === key && BUSY.includes(d.status));
      if (item) return ['queued', ...ACTIVE].includes(item.status) ? 'busy' : 'waiting';
      return history.some((h) => h.key === key) ? 'downloaded' : null;
    },
    [downloads, history]
  );

  const pendingCount = downloads.filter((d) => BUSY.includes(d.status)).length;
  const activeCount = downloads.filter((d) => ACTIVE.includes(d.status)).length;

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        settings,
        notice,
        pendingCount,
        activeCount,
        setDefaultKind: (defaultKind) => updateSettings({ defaultKind }),
        setDefaultQuality: (defaultQuality) => updateSettings({ defaultQuality }),
        setAutoStart: (autoStart) => updateSettings({ autoStart }),
        enqueueDownload,
        enqueueMany,
        startStaged,
        startAllStaged,
        setItemKind,
        setItemQuality,
        pauseDownload,
        resumeDownload,
        retryDownload,
        cancelDownload,
        removeDownload,
        clearFinished,
        removeDuplicates,
        openFolder,
        isDownloadingTrack,
        isDownloaded,
        getTrackState,
      }}
    >
      {children}
      <DownloadToast notice={notice} onOpen={openCentral} onClose={closeNotice} />
    </DownloadContext.Provider>
  );
}

export const useDownloads = () => useContext(DownloadContext);
// alias no singular (já usado em partes do projeto)
export const useDownload = useDownloads;