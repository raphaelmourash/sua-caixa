import { getVideoId } from '../context/DownloadContext';

/** Mesmo formato que o TrackList já grava: { [nome]: { folder, album, artist, coverUrl, tracks } } (aceita o formato antigo: array) */
export const STORAGE_KEY = 'nexus_local_playlists';

export const trackKey = (t) => getVideoId(t) || t?.webpage_url || t?.url || t?.id || null;

export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).map(([name, v]) => {
    const isArr = Array.isArray(v);
    const o = isArr ? {} : v || {};
    return {
      name,
      folder: o.folder || '',
      album: o.album || '',
      artist: o.artist || '',
      coverUrl: o.coverUrl || '',
      tracks: Array.isArray(isArr ? v : o.tracks) ? (isArr ? v : o.tracks) : [],
    };
  });
}

export function toObject(list) {
  const out = {};
  for (const p of list) {
    out[p.name] = { folder: p.folder, album: p.album, artist: p.artist, coverUrl: p.coverUrl, tracks: p.tracks };
  }
  return out;
}

export function loadPlaylists() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return [];
  }
}

/** Devolve { ok } ou { ok:false, error }. Avisa as outras telas com o evento 'storage' (como o TrackList faz). */
export function savePlaylists(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toObject(list)));
  } catch (error) {
    return { ok: false, error };
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'));
  } catch { /* sem window: ignora */ }
  return { ok: true };
}

export function uniqueName(list, base) {
  const names = new Set(list.map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

/** Remove repetidas pelo ID do vídeo. Devolve { tracks, removed }. */
export function dedupeTracks(tracks) {
  const seen = new Set();
  const out = [];
  for (const t of tracks) {
    const k = trackKey(t);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(t);
  }
  return { tracks: out, removed: tracks.length - out.length };
}

/** Acrescenta ao destino só o que ainda não existe. Devolve { tracks, added, skipped }. */
export function appendUnique(target, incoming) {
  const keys = new Set(target.map(trackKey));
  const fresh = incoming.filter((t) => {
    const k = trackKey(t);
    if (k && keys.has(k)) return false;
    if (k) keys.add(k);
    return true;
  });
  return { tracks: [...target, ...fresh], added: fresh.length, skipped: incoming.length - fresh.length };
}

export function reorder(tracks, from, to) {
  if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return tracks;
  const next = [...tracks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Duplicadas = faixas cuja chave já apareceu antes na lista (conjunto de índices). */
export function duplicateIndexes(tracks) {
  const seen = new Set();
  const dups = new Set();
  tracks.forEach((t, i) => {
    const k = trackKey(t);
    if (!k) return;
    if (seen.has(k)) dups.add(i); else seen.add(k);
  });
  return dups;
}

// ---------- Backup ----------
export function exportBackup(list) {
  return JSON.stringify({ app: 'suacaixa', version: 1, exportedAt: new Date().toISOString(), playlists: toObject(list) }, null, 2);
}

export function parseBackup(text) {
  try {
    const data = JSON.parse(text);
    const raw = data?.playlists ?? data; // aceita também o objeto "puro" do localStorage
    const list = normalize(raw);
    if (list.length === 0) return { ok: false, error: 'O arquivo não tem playlists.' };
    return { ok: true, playlists: list };
  } catch {
    return { ok: false, error: 'Arquivo inválido (não é um backup JSON).' };
  }
}

/** Junta as playlists importadas às atuais sem sobrescrever nada: nomes repetidos ganham " (2)". */
export function mergeImported(current, imported) {
  let list = [...current];
  let renamed = 0;
  for (const p of imported) {
    const name = uniqueName(list, p.name);
    if (name !== p.name) renamed += 1;
    list = [...list, { ...p, name }];
  }
  return { list, added: imported.length, renamed };
}
