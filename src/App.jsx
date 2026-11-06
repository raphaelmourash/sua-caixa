import React, { useState, useEffect } from 'react';
import { analyzePlaylist } from './services/ytdlp';
import { JukeboxProvider, useJukebox } from './context/JukeboxContext';
import PlaylistForm from './components/PlaylistForm';
import TrackList from './components/TrackList';
import JukeboxPlayer from './components/JukeboxPlayer';
import Auth from './components/Auth';
import { getPlaylistsFromBackend, deletePlaylistFromBackend } from './services/api';

function Dashboard({ currentUser, onLogout }) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('somoteca');

  const [localPlaylists, setLocalPlaylists] = useState({});
  const [selectedExplorerPlaylist, setSelectedExplorerPlaylist] = useState('');
  const [playlistSearchTerm, setPlaylistSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('default');

  // Controle de estado para expansão individual dos nós (Playlists, Artistas, Álbuns)
  const [expandedPlaylists, setExpandedPlaylists] = useState({});
  const [expandedArtists, setExpandedArtists] = useState({});
  const [expandedAlbums, setExpandedAlbums] = useState({});

  // Edição de metadados
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState('');
  const [editFolderName, setEditFolderName] = useState('');
  const [editAlbumName, setEditAlbumName] = useState('');

  const { setQueueAndPlay, currentTrack, isPlaying } = useJukebox();

  const loadSavedPlaylists = async () => {
    try {
      const userId = currentUser ? currentUser.email : 'anon-user';
      const backendPlaylists = await getPlaylistsFromBackend(userId);
      
      if (backendPlaylists && Object.keys(backendPlaylists).length > 0) {
        setLocalPlaylists(backendPlaylists);
        localStorage.setItem('nexus_local_playlists', JSON.stringify(backendPlaylists));
      } else {
        const saved = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
        setLocalPlaylists(saved);
      }
    } catch (err) {
      console.error("Erro ao carregar playlists do backend:", err);
      const saved = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
      setLocalPlaylists(saved);
    }
  };

  useEffect(() => {
    loadSavedPlaylists();
    window.addEventListener('storage', loadSavedPlaylists);
    return () => window.removeEventListener('storage', loadSavedPlaylists);
  }, [currentUser]);

  const toggleExpand = (setter, key) => {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const playlistNames = Object.keys(localPlaylists);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const result = await analyzePlaylist(url, proxy);
      setTracks(result);
    } catch (err) {
      console.error('Erro na análise:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPlaylist = (playlistTracks) => {
    if (!playlistTracks || playlistTracks.length === 0) return;
    setQueueAndPlay(playlistTracks, 0);
  };

  const handleDeletePlaylist = async (nameToDelete) => {
    if (confirm(`Deseja apagar a playlist "${nameToDelete}"?`)) {
      const updated = { ...localPlaylists };
      delete updated[nameToDelete];
      localStorage.setItem('nexus_local_playlists', JSON.stringify(updated));
      setLocalPlaylists(updated);

      if (selectedExplorerPlaylist === nameToDelete) {
        setSelectedExplorerPlaylist('');
      }

      try {
        const userId = currentUser ? currentUser.email : 'anon-user';
        await deletePlaylistFromBackend(userId, nameToDelete);
      } catch (err) {
        console.error('Erro ao apagar playlist no backend:', err);
      }

      loadSavedPlaylists();
    }
  };

  const handleSaveMetadataEdit = async (playlistName) => {
    const currentObj = localPlaylists[playlistName];
    if (!currentObj) return;

    const updatedPlaylist = {
      ...currentObj,
      folder: editFolderName.trim() || 'Geral',
      album: editAlbumName.trim() || 'Singles / Catálogo'
    };

    const updatedAll = {
      ...localPlaylists,
      [playlistName]: updatedPlaylist
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(updatedAll));
    setLocalPlaylists(updatedAll);
    setIsEditing(false);

    try {
      const userId = currentUser ? currentUser.email : 'anon-user';
      
      await fetch('http://localhost:5000/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: playlistName,
          folder: updatedPlaylist.folder,
          album: updatedPlaylist.album,
          artist: updatedPlaylist.artist || updatedPlaylist.folder,
          coverUrl: updatedPlaylist.coverUrl,
          tracks: updatedPlaylist.tracks
        })
      });
    } catch (err) {
      console.error('Erro ao atualizar metadados no backend:', err);
    }

    alert('Metadados corrigidos com sucesso!');
  };

  const handleRemoveTrack = async (playlistName, trackIdxToRemove) => {
    const currentObj = localPlaylists[playlistName];
    if (!currentObj) return;

    const currentTracks = Array.isArray(currentObj) ? currentObj : (currentObj.tracks || []);
    const updatedTracks = currentTracks.filter((_, idx) => idx !== trackIdxToRemove);
    
    const updatedPlaylists = {
      ...localPlaylists,
      [playlistName]: {
        ...(typeof currentObj === 'object' ? currentObj : {}),
        tracks: updatedTracks
      }
    };

    localStorage.setItem('nexus_local_playlists', JSON.stringify(updatedPlaylists));
    setLocalPlaylists(updatedPlaylists);

    try {
      const userId = currentUser ? currentUser.email : 'anon-user';

      await fetch('http://localhost:5000/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: playlistName,
          folder: currentObj.folder,
          album: currentObj.album,
          artist: currentObj.artist,
          coverUrl: currentObj.coverUrl,
          tracks: updatedTracks
        })
      });
    } catch (err) {
      console.error('Erro ao sincronizar remoção de faixa com o backend:', err);
    }
  };

  return (
    <div className="main-layout">
      <div className="app-container" style={{ paddingBottom: '140px' }}>
        
        {/* Cabeçalho */}
        <div className="app-header">
          <div className="logo-box">SuaCaixa</div>
          <div className="header-user">
            <div className="user-badge">
              <span>{currentUser ? currentUser.email : 'Raphael Moura'}</span>
              <span className="logout-btn" onClick={onLogout} style={{ cursor: 'pointer', marginLeft: '8px', color: '#ef4444' }}>[Sair]</span>
            </div>
            <div className="version-badge">Online v2.3</div>
          </div>
        </div>

        {/* Navegação por Abas */}
        <div className="nav-tabs">
          <button className={`tab-btn ${activeTab === 'somoteca' ? 'active-tab' : ''}`} onClick={() => setActiveTab('somoteca')}>
            Somoteca & Jukebox
          </button>
          <button className="tab-btn" onClick={() => setActiveTab('coletiva')}>Caixa Coletiva</button>
          <button className="tab-btn" onClick={() => setActiveTab('cortar')}>Cortar Vídeo</button>
          <button className="tab-btn" onClick={() => setActiveTab('cursos')}>Cursos Udemy</button>
          <button className="tab-btn tab-admin" onClick={() => setActiveTab('admin')}>⚙ Gestão de Utilizadores</button>
        </div>

        {activeTab === 'somoteca' && (
          <>
            <PlaylistForm 
              url={url} 
              setUrl={setUrl} 
              proxy={proxy} 
              setProxy={setProxy} 
              onAnalyze={handleAnalyze} 
              loading={loading}
              tracks={tracks}
            />

            <TrackList tracks={tracks} setTracks={setTracks} />

            {/* Explorador de Playlists */}
            <div className="card card-bordered" style={{ marginTop: '20px', padding: '20px' }}>
              
              {/* Barra Superior do Explorador com Seleção Destacada à Esquerda */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                
                {/* Lado Esquerdo: Título e Lista Suspensa Destacada */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <span className="card-title card-title-teal" style={{ margin: 0, fontSize: '15px' }}>
                    📂 EXPLORADOR:
                  </span>

                  <select
                    value={selectedExplorerPlaylist}
                    onChange={(e) => setSelectedExplorerPlaylist(e.target.value)}
                    className="select-dropdown"
                    style={{ 
                      padding: '8px 14px', 
                      fontSize: '14px', 
                      fontWeight: 'bold', 
                      minWidth: '240px',
                      color: '#38bdf8',
                      backgroundColor: '#0f172a',
                      border: '2px solid #008891',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="" style={{ color: '#94a3b8' }}>Select Playlist ({playlistNames.length})...</option>
                    {playlistNames.map((name) => (
                      <option key={name} value={name} style={{ color: '#f8fafc', backgroundColor: '#111827' }}>
                        💿 {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lado Direito: Filtro de Faixas e Ordenação */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="🔍 Filtrar faixas..."
                    value={playlistSearchTerm}
                    onChange={(e) => setPlaylistSearchTerm(e.target.value)}
                    className="input-text"
                    style={{ width: '180px', padding: '6px 10px', fontSize: '12px' }}
                  />
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    className="select-dropdown"
                    style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }}
                  >
                    <option value="default">Ordem de Adição</option>
                    <option value="name">Nome (A-Z)</option>
                    <option value="duration">Duração</option>
                  </select>
                </div>
              </div>

              {playlistNames.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '13px', padding: '10px 0' }}>
                  Nenhuma playlist cadastrada ainda.
                </div>
              ) : !selectedExplorerPlaylist ? (
                <div style={{ color: '#94a3b8', fontSize: '13px', padding: '24px', textAlign: 'center', backgroundColor: '#0b0f19', borderRadius: '8px', border: '1px dashed #1f2937' }}>
                  👈 Selecione uma playlist cadastrada na lista acima para expandir as pastas, álbuns e faixas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(() => {
                    const plName = selectedExplorerPlaylist;
                    const plObj = localPlaylists[plName];
                    if (!plObj) return null;

                    const rawList = Array.isArray(plObj) ? plObj : (plObj.tracks || []);
                    const artistName = plObj.artist || plObj.folder || 'Vários Artistas';
                    const albumName = plObj.album || 'Catálogo Geral';

                    const isPlExpanded = !!expandedPlaylists[plName];
                    const artistKey = `${plName}_${artistName}`;
                    const isArtistExpanded = !!expandedArtists[artistKey];
                    const albumKey = `${artistKey}_${albumName}`;
                    const isAlbumExpanded = !!expandedAlbums[albumKey];

                    // Processamento e ordenação de faixas
                    let filteredTracks = rawList.filter((t) =>
                      (t.title || t.id || '').toLowerCase().includes(playlistSearchTerm.toLowerCase())
                    );

                    if (sortBy === 'name') {
                      filteredTracks = [...filteredTracks].sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
                    } else if (sortBy === 'duration') {
                      filteredTracks = [...filteredTracks].sort((a, b) => (a.duration || 0) - (b.duration || 0));
                    }

                    return (
                      <div key={plName} style={{ backgroundColor: '#0b0f19', borderRadius: '8px', border: '1px solid #1f2937', overflow: 'hidden' }}>
                        
                        {/* ────────── NÍVEL 1: NOME DA PLAYLIST ────────── */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#111827' }}>
                          <div 
                            onClick={() => toggleExpand(setExpandedPlaylists, plName)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                          >
                            <button 
                              className="btn btn-dark btn-sm"
                              style={{ width: '26px', height: '26px', padding: 0, fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {isPlExpanded ? '-' : '+'}
                            </button>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>
                              💿 {plName}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#1f2937', padding: '2px 8px', borderRadius: '10px' }}>
                              {rawList.length} faixas
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button 
                              onClick={() => handlePlayPlaylist(rawList)}
                              className="btn btn-teal btn-sm"
                              style={{ fontSize: '11px', fontWeight: 'bold', padding: '6px 12px' }}
                            >
                              ▶ Tocar Tudo
                            </button>
                            <button 
                              onClick={() => handleDeletePlaylist(plName)}
                              className="btn btn-red btn-sm"
                              style={{ fontSize: '11px', padding: '6px 8px' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* ────────── NÍVEL 2: BANDA / ARTISTA ────────── */}
                        {isPlExpanded && (
                          <div style={{ paddingLeft: '24px', paddingTop: '8px', paddingBottom: '8px', paddingRight: '12px', backgroundColor: '#090d16', borderTop: '1px solid #1f2937' }}>
                            
                            <div 
                              onClick={() => toggleExpand(setExpandedArtists, artistKey)}
                              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: '#131c2e', borderRadius: '6px', cursor: 'pointer', border: '1px solid #1e293b' }}
                            >
                              <button 
                                className="btn btn-dark btn-sm"
                                style={{ width: '22px', height: '22px', padding: 0, fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                {isArtistExpanded ? '-' : '+'}
                              </button>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#008891' }}>
                                🎸 Pasta / Artista: {artistName}
                              </span>
                            </div>

                            {/* ────────── NÍVEL 3: ÁLBUM ────────── */}
                            {isArtistExpanded && (
                              <div style={{ paddingLeft: '24px', paddingTop: '8px', paddingBottom: '6px' }}>
                                
                                <div 
                                  onClick={() => toggleExpand(setExpandedAlbums, albumKey)}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#0f172a', borderRadius: '6px', cursor: 'pointer', border: '1px solid #1e293b' }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button 
                                      className="btn btn-dark btn-sm"
                                      style={{ width: '22px', height: '22px', padding: 0, fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      {isAlbumExpanded ? '-' : '+'}
                                    </button>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f59e0b' }}>
                                      📀 Álbum: {albumName}
                                    </span>
                                  </div>

                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPlaylistName(plName);
                                      setEditFolderName(plObj.folder || '');
                                      setEditAlbumName(plObj.album || '');
                                      setIsEditing(!isEditing);
                                    }}
                                    className="btn btn-dark btn-sm"
                                    style={{ fontSize: '10px', padding: '2px 6px' }}
                                  >
                                    ✏️ Corrigir
                                  </button>
                                </div>

                                {/* Form de Edição Rápida de Metadados */}
                                {isEditing && selectedPlaylistName === plName && (
                                  <div style={{ backgroundColor: '#111827', padding: '8px', borderRadius: '6px', marginTop: '6px', border: '1px solid #008891', display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      placeholder="Nova Pasta/Banda..."
                                      value={editFolderName}
                                      onChange={(e) => setEditFolderName(e.target.value)}
                                      className="input-text"
                                      style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Novo Álbum..."
                                      value={editAlbumName}
                                      onChange={(e) => setEditAlbumName(e.target.value)}
                                      className="input-text"
                                      style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                                    />
                                    <button onClick={() => handleSaveMetadataEdit(plName)} className="btn btn-yellow btn-sm" style={{ fontSize: '11px' }}>
                                      Salvar
                                    </button>
                                  </div>
                                )}

                                {/* ────────── NÍVEL 4: MÚSICAS DO ÁLBUM ────────── */}
                                {isAlbumExpanded && (
                                  <div style={{ paddingLeft: '16px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    
                                    <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '4px' }}>
                                      {filteredTracks.map((track, idx) => {
                                        const isTrackPlaying = isPlaying && currentTrack && (currentTrack.title === track.title || currentTrack.id === track.id);
                                        
                                        // 🛡️ Formatação limpa do título (evita mostrar o ID em bruto)
                                        const displayTitle = (track.title && track.title.trim() !== '' && track.title !== track.id)
                                          ? track.title
                                          : `Música ${idx + 1} (${track.id || 'Desconhecida'})`;

                                        return (
                                          <div 
                                            key={idx} 
                                            style={{ 
                                              display: 'flex', 
                                              justifyContent: 'space-between', 
                                              alignItems: 'center', 
                                              padding: '8px 12px', 
                                              backgroundColor: isTrackPlaying ? '#00889122' : '#111827',
                                              border: isTrackPlaying ? '1px solid #008891' : '1px solid #1f2937',
                                              borderRadius: '6px'
                                            }}
                                          >
                                            <div 
                                              onClick={() => setQueueAndPlay(filteredTracks, idx)}
                                              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, overflow: 'hidden' }}
                                            >
                                              <span style={{ fontSize: '12px', color: isTrackPlaying ? '#008891' : '#64748b', fontWeight: 'bold' }}>
                                                {isTrackPlaying ? '🎵' : `${idx + 1}.`}
                                              </span>
                                              <span style={{ fontSize: '13px', color: isTrackPlaying ? '#38bdf8' : '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {displayTitle}
                                              </span>
                                            </div>
                                            
                                            <button 
                                              onClick={() => handleRemoveTrack(plName, idx)}
                                              className="btn btn-red btn-sm"
                                              style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '10px' }}
                                              title="Remover música"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>

                                  </div>
                                )}

                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          </>
        )}

        <JukeboxPlayer />
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('nexus_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('nexus_user');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('nexus_user');
    setCurrentUser(null);
  };

  if (!currentUser) {
    return (
      <div className="main-layout">
        <Auth onLoginSuccess={(user) => setCurrentUser(user)} />
      </div>
    );
  }

  return (
    <JukeboxProvider>
      <Dashboard currentUser={currentUser} onLogout={handleLogout} />
    </JukeboxProvider>
  );
}