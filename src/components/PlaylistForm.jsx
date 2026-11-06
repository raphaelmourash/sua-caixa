import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { savePlaylistToBackend } from '../services/api';

export default function PlaylistForm({ url, setUrl, proxy, setProxy, onAnalyze, loading, tracks }) {
  const [playlistName, setPlaylistName] = useState('');
  const [folder, setFolder] = useState('Favoritos');
  const [artist, setArtist] = useState('Vários Artistas');
  const [album, setAlbum] = useState('Mix');
  const [coverUrl, setCoverUrl] = useState('');
  const [selectedExistingPlaylist, setSelectedExistingPlaylist] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 🧠 Inteligência Adaptativa: Deteta o Artista/Pasta sem sobrescrever o nome da playlist escolhido por si
  useEffect(() => {
    if (tracks && Array.isArray(tracks) && tracks.length > 0) {
      const artistsInTracks = tracks.map(t => {
        const title = t.title || '';
        if (title.includes('-')) {
          let raw = title.split('-')[0].trim();
          return raw.replace(/VEVO/gi, '').replace(/\s*\(.*?\)/g, '').trim();
        }
        return 'Desconhecido';
      });

      const uniqueArtists = [...new Set(artistsInTracks.filter(a => a !== 'Desconhecido'))];

      if (uniqueArtists.length === 1) {
        const singleArtist = uniqueArtists[0];
        const formatted = singleArtist.charAt(0).toUpperCase() + singleArtist.slice(1);
        setArtist(formatted);
        setFolder(formatted);
        // Nota: Removido o preenchimento automático de `playlistName` para preservar o seu nome personalizado ("Rock")
        if (!album) setAlbum('Catálogo');
      } else {
        setArtist('Vários Artistas');
        setFolder('Favoritos & Mix');
        if (!album) setAlbum('Diversos');
      }
    }
  }, [tracks]);

  const getExistingPlaylists = () => {
    try {
      const data = localStorage.getItem('nexus_local_playlists');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  };

  const existingPlaylists = getExistingPlaylists();
  const playlistNames = Object.keys(existingPlaylists);

  const mergeUniqueTracks = (existingTracks = [], newTracks = []) => {
    const map = new Map();
    existingTracks.forEach((t) => {
      const key = t.id || t.url || t.title;
      if (key) map.set(key, t);
    });
    newTracks.forEach((t) => {
      const key = t.id || t.url || t.title;
      if (key && !map.has(key)) {
        map.set(key, t);
      }
    });
    return Array.from(map.values());
  };

  const handleSaveNewPlaylist = async (e) => {
    e.preventDefault();
    const finalName = playlistName.trim();
    if (!finalName) {
      alert('Por favor, introduza um nome para a playlist.');
      return;
    }
    if (!tracks || tracks.length === 0) {
      alert('Não existem faixas detetadas para guardar.');
      return;
    }

    const targetFolder = folder.trim() || 'Favoritos';
    const finalAlbum = album.trim() || 'Mix';
    const finalArtist = artist.trim() || 'Vários Artistas';

    let existingTracks = [];
    let existingCover = coverUrl.trim() || null;

    if (existingPlaylists[finalName]) {
      const currentObj = existingPlaylists[finalName];
      existingTracks = Array.isArray(currentObj) ? currentObj : (currentObj.tracks || []);
      if (!existingCover && currentObj.coverUrl) existingCover = currentObj.coverUrl;
    }

    const combinedTracks = mergeUniqueTracks(existingTracks, tracks);

    const playlistObject = {
      name: finalName,
      folder: targetFolder,
      artist: finalArtist,
      album: finalAlbum,
      coverUrl: existingCover,
      tracks: combinedTracks,
      createdAt: new Date().toISOString()
    };

    await saveAndSync(finalName, playlistObject);
    alert(`Playlist "${finalName}" guardada com sucesso!`);
    
    setPlaylistName('');
    setFolder('Favoritos');
    setArtist('Vários Artistas');
    setAlbum('Mix');
    setCoverUrl('');
  };

  const handleAddToExisting = async () => {
    if (!selectedExistingPlaylist || !tracks || tracks.length === 0) return;
    const currentObj = existingPlaylists[selectedExistingPlaylist] || {};
    const currentTracks = Array.isArray(currentObj) ? currentObj : (currentObj.tracks || []);
    const combinedTracks = mergeUniqueTracks(currentTracks, tracks);

    const updatedObject = {
      ...(typeof currentObj === 'object' && !Array.isArray(currentObj) ? currentObj : {}),
      tracks: combinedTracks
    };

    await saveAndSync(selectedExistingPlaylist, updatedObject);
    alert(`Faixas adicionadas com sucesso à playlist "${selectedExistingPlaylist}"!`);
  };

  const saveAndSync = async (name, playlistData) => {
    setIsSaving(true);
    try {
      const currentPlaylists = getExistingPlaylists();
      currentPlaylists[name] = playlistData;
      localStorage.setItem('nexus_local_playlists', JSON.stringify(currentPlaylists));
      window.dispatchEvent(new Event('storage'));

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user ? user.id : 'anon-user';

      await savePlaylistToBackend(userId, {
        name,
        folder: playlistData.folder,
        album: playlistData.album,
        artist: playlistData.artist,
        coverUrl: playlistData.coverUrl,
        tracks: playlistData.tracks
      });
    } catch (err) {
      console.error('Erro ao guardar:', err);
      alert('Erro ao persistir os dados.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: '12px' }}>🔍 Configuração Flexível de Playlist</div>
      
      <form onSubmit={onAnalyze}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Cole o link do YouTube (Música avulsa, Álbum ou Playlist mista)..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input-text"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading} className="btn btn-yellow" style={{ minWidth: '160px', fontWeight: 'bold' }}>
            {loading ? 'A analisar...' : 'Analisar URL'}
          </button>
        </div>
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', borderTop: '1px solid #1f2937', paddingTop: '16px', marginTop: '10px' }}>
        
        {/* Criar Nova Playlist */}
        <div style={{ backgroundColor: '#0b0f19', padding: '14px', borderRadius: '8px', border: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#008891' }}>
              📁 Guardar em Pasta / Banda ou Mix
            </span>
            {tracks && tracks.length > 0 && (
              <span style={{ fontSize: '10px', color: '#10b981', backgroundColor: '#064e3b', padding: '2px 6px', borderRadius: '4px' }}>
                {tracks.length} faixas
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Nome da playlist (ex: Rock)..."
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="input-text"
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Banda / Artista (ex: Oasis)..."
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="input-text"
                style={{ flex: 1 }}
              />
              <input
                type="text"
                placeholder="Álbum..."
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="input-text"
                style={{ flex: 1 }}
              />
            </div>
            <input
              type="text"
              placeholder="URL da Capa (Opcional)..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="input-text"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveNewPlaylist}
            disabled={isSaving || !tracks || tracks.length === 0}
            className="btn btn-yellow"
            style={{ width: '100%', fontWeight: 'bold', fontSize: '12px' }}
          >
            Guardar Playlist
          </button>
        </div>

        {/* Adicionar a Existente */}
        <div style={{ backgroundColor: '#0b0f19', padding: '14px', borderRadius: '8px', border: '1px solid #1f2937' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f59e0b', display: 'block', marginBottom: '8px' }}>
            ➕ Adicionar a Playlist Existente
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '58px' }}>
            <select
              className="select-dropdown"
              value={selectedExistingPlaylist}
              onChange={(e) => setSelectedExistingPlaylist(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Selecione uma playlist...</option>
              {playlistNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddToExisting}
            disabled={isSaving || !tracks || tracks.length === 0 || !selectedExistingPlaylist}
            className="btn btn-teal"
            style={{ width: '100%', fontWeight: 'bold', fontSize: '12px' }}
          >
            Adicionar a Esta Playlist
          </button>
        </div>

      </div>
    </div>
  );
}