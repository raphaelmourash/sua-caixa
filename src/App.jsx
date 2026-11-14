import React, { useState, useEffect } from 'react';
import { analyzePlaylist } from './services/ytdlp';
import { JukeboxProvider } from './context/JukeboxContext';
import { DownloadProvider, useDownload } from './context/DownloadContext';
import PlaylistForm from './components/PlaylistForm';
import TrackList from './components/TrackList';
import PlaylistsLibrary from './components/PlaylistsLibrary';
import JukeboxPlayer from './components/JukeboxPlayer';
import SectionTabs from './components/SectionTabs';
import DownloadsPanel from './components/DownloadsPanel';
import Auth from './components/Auth';
import { getPlaylistsFromBackend } from './services/api';

function Dashboard({ currentUser, onLogout }) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playlistCount, setPlaylistCount] = useState(0);

  const { downloads } = useDownload();
  const ativos = downloads.filter(d => ['queued', 'downloading', 'processing'].includes(d.status)).length;

  const loadPlaylistCount = async () => {
    try {
      const userId = currentUser ? currentUser.email : 'anon-user';
      const backendPlaylists = await getPlaylistsFromBackend(userId);
      if (backendPlaylists && Object.keys(backendPlaylists).length > 0) {
        setPlaylistCount(Object.keys(backendPlaylists).length);
      } else {
        const saved = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
        setPlaylistCount(Object.keys(saved).length);
      }
    } catch {
      const saved = JSON.parse(localStorage.getItem('nexus_local_playlists') || '{}');
      setPlaylistCount(Object.keys(saved).length);
    }
  };

  useEffect(() => {
    loadPlaylistCount();
    window.addEventListener('storage', loadPlaylistCount);
    return () => window.removeEventListener('storage', loadPlaylistCount);
  }, [currentUser]);

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

  return (
    <div className="main-layout">
      <div className="app-container" style={{ paddingBottom: '140px' }}>
        
        <div className="app-header">
          <div className="logo-box">SuaCaixa</div>
          <div className="header-user">
            <div className="user-badge">
              <span>{currentUser ? currentUser.email : 'Raphael Moura'}</span>
              <span className="logout-btn" onClick={onLogout} style={{ cursor: 'pointer', marginLeft: '8px', color: '#ef4444' }}>[Sair]</span>
            </div>
            <div className="version-badge">Online v2.4</div>
          </div>
        </div>

        <SectionTabs sections={[
          {
            id: 'importar',
            icon: '🔍',
            title: 'Importar & Analisar',
            description: 'Cole um link do YouTube, ouça prévias e escolha o que adicionar.',
            content: (
              <div>
                <PlaylistForm 
                  url={url} 
                  setUrl={setUrl} 
                  proxy={proxy} 
                  setProxy={setProxy} 
                  onAnalyze={handleAnalyze} 
                  loading={loading}
                  tracks={tracks}
                  setTracks={setTracks}
                />
                <TrackList tracks={tracks} setTracks={setTracks} />
              </div>
            )
          },
          {
            id: 'playlists',
            icon: '🎵',
            title: 'Minhas Playlists',
            description: 'Ouça, edite e organize sua biblioteca.',
            badge: playlistCount,
            content: <PlaylistsLibrary />
          },
          {
            id: 'downloads',
            icon: '⬇',
            title: 'Central de Downloads',
            description: 'Baixe músicas ou playlists e acompanhe o progresso de cada uma.',
            badge: ativos,
            content: <DownloadsPanel />
          }
        ]} />

        {/* Instância única do JukeboxPlayer */}
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
      } catch {
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
      <DownloadProvider>
        <Dashboard currentUser={currentUser} onLogout={handleLogout} />
      </DownloadProvider>
    </JukeboxProvider>
  );
}