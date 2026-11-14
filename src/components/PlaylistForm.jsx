import React, { useState } from 'react';
import { analyzePlaylist, searchYoutube } from '../services/ytdlp';

export default function PlaylistForm({ url, setUrl, proxy, setProxy, onAnalyze, loading, setTracks }) {
  const [localLoading, setLocalLoading] = useState(false);

  // Deteta automaticamente se o texto introduzido é um link do YouTube ou URL geral
  const isUrl = url.includes('youtube.com/') || url.includes('youtu.be/') || url.startsWith('http://') || url.startsWith('https://');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setLocalLoading(true);
    try {
      if (isUrl) {
        // 🔗 É UM LINK: Executa a análise normal da playlist ou vídeo
        const results = await analyzePlaylist(trimmed, proxy);
        if (setTracks) setTracks(results);
      } else {
        // 🔍 É UMA PALAVRA-CHAVE: Executa a busca inteligente no YouTube via Rust
        const results = await searchYoutube(trimmed, 30, 'relevance', proxy);
        if (setTracks) setTracks(results);
      }
    } catch (err) {
      console.error("Erro na busca/análise inteligente:", err);
      alert(typeof err === 'string' ? err : 'Ocorreu um erro ao processar a solicitação.');
      if (setTracks) setTracks([]);
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <span className="card-title" style={{ margin: 0, fontSize: '14px' }}>
          🔍 Configuração Flexível (Busca ou Link)
        </span>
        {url.trim() && (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: isUrl ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)', color: isUrl ? '#34d399' : '#38bdf8', border: `1px solid ${isUrl ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}` }}>
            {isUrl ? '🔗 Modo Link Detectado' : '🔍 Modo Busca Inteligente'}
          </span>
        )}
      </div>
      
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            id="search-input"
            name="query"
            autoComplete="off"
            placeholder="Cole o link do YouTube ou digite uma palavra-chave (ex: capital inicial)..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input-text"
            style={{ flex: 1 }}
          />
          <button 
            type="submit" 
            disabled={loading || localLoading} 
            className="btn btn-yellow" 
            style={{ minWidth: '160px', fontWeight: 'bold' }}
          >
            {loading || localLoading ? 'A processar...' : isUrl ? 'Analisar URL' : 'Pesquisar'}
          </button>
        </div>
      </form>
    </div>
  );
}