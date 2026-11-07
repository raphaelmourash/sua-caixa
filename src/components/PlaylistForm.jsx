import React from 'react';

export default function PlaylistForm({ url, setUrl, proxy, setProxy, onAnalyze, loading }) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: '12px' }}>🔍 Configuração Flexível de Playlist</div>
      
      <form onSubmit={onAnalyze}>
        <div style={{ display: 'flex', gap: '10px' }}>
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
    </div>
  );
}
