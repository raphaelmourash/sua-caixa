import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function YouTubeSearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchId = "tab-youtube-search-instance";
  const isUrl = query.includes('youtube.com/') || query.includes('youtu.be/');

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        const data = await invoke('search_youtube', {
          id: searchId,
          query: query,
          limit: 50,
          sort: 'relevance',
          proxy: ''
        });
        setResults(data);
      } catch (err) {
        if (err !== 'cancelled') {
          setError(typeof err === 'string' ? err : 'Ocorreu um erro ao processar a requisição.');
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      invoke('cancel_search', { id: searchId }).catch(() => {});
    };
  }, [query]);

  const handleQueueDownload = (url, title) => {
    console.log("Enviando para download:", { url, title });
    // Aqui você pode chamar a função que adiciona à sua fila de downloads existente
  };

  return (
    <div className="flex flex-col h-full p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-white">Explorador & Playlist YouTube</h2>
          {isUrl && (
            <span className="px-2.5 py-0.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 text-xs font-semibold rounded-full">
              Modo Link / Playlist Detectado
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Digite uma palavra-chave para buscar ou cole o link de um vídeo/playlist para carregar os itens instantaneamente.
        </p>
      </div>

      {/* Input de Busca / Link */}
      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquise por termo ou cole o link do YouTube (vídeo ou playlist)..."
          className="w-full px-4 py-3 pl-11 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
        />
        <svg className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {loading && (
          <div className="absolute right-3.5 top-3.5">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Erros */}
      {error && (
        <div className="p-4 mb-4 bg-red-950/50 border border-red-900/50 text-red-200 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Grid de Resultados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
        {results.map((video, index) => (
          <div 
            key={`${video.id}-${index}`} 
            className="flex flex-col justify-between bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all group shadow-sm hover:shadow-md"
          >
            <div>
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
                <img 
                  src={video.thumbnail} 
                  alt={video.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                />
                {video.duration && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/80 text-white text-xs font-medium rounded">
                    {Math.floor(video.duration / 60)}:{Math.floor(video.duration % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug" title={video.title}>
                  {video.title}
                </h3>
                <p className="text-xs text-slate-400 mt-2 font-medium">{video.channel}</p>
              </div>
            </div>

            <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-slate-800/60">
              <span className="text-[11px] text-slate-500">
                {video.viewCount ? `${video.viewCount.toLocaleString()} views` : ''}
              </span>
              <button
                onClick={() => handleQueueDownload(video.url, video.title)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Baixar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Estados Vazios */}
      {!loading && results.length === 0 && query.trim() !== '' && !error && (
        <div className="text-center py-16 text-slate-500">
          <p>Nenhum item encontrado para esta consulta ou link.</p>
        </div>
      )}

      {!loading && results.length === 0 && query.trim() === '' && (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-600 py-16">
          <svg className="w-16 h-16 mb-4 stroke-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm font-medium text-slate-500">Digite uma busca ou cole uma URL/Playlist do YouTube.</p>
        </div>
      )}
    </div>
  );
}