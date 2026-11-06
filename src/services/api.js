// src/services/api.js

const API_BASE_URL = import.meta.env.PROD 
  ? 'https://sua-caixa.onrender.com/api' 
  : 'http://localhost:5000/api';

// 📂 Buscar todas as playlists do utilizador através do Backend
export async function getPlaylistsFromBackend(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/playlists/${userId}`);
    const data = await response.json();
    return data.success ? data.playlists : {};
  } catch (err) {
    console.error('Erro ao comunicar com o backend (GET):', err);
    return {};
  }
}

// 💾 Guardar ou atualizar uma playlist no Backend
export async function savePlaylistToBackend(userId, playlistData) {
  try {
    const response = await fetch(`${API_BASE_URL}/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...playlistData })
    });
    const data = await response.json();
    return data.success;
  } catch (err) {
    console.error('Erro ao comunicar com o backend (POST):', err);
    return false;
  }
}

// ❌ Apagar uma playlist no Backend
export async function deletePlaylistFromBackend(userId, playlistName) {
  try {
    const response = await fetch(`${API_BASE_URL}/playlists/${userId}/${encodeURIComponent(playlistName)}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    return data.success;
  } catch (err) {
    console.error('Erro ao comunicar com o backend (DELETE):', err);
    return false;
  }
}

// ==========================================
// 🔐 MÉTODOS DE AUTENTICAÇÃO VIA API
// ==========================================

// 🔐 Fazer Login através do Backend
export async function loginApi(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await response.json();
  } catch (err) {
    console.error('Erro ao comunicar com a API de login:', err);
    return { success: false, error: 'Erro de conexão com o servidor.' };
  }
}

// 📝 Criar Conta através do Backend
export async function registerApi(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await response.json();
  } catch (err) {
    console.error('Erro ao comunicar com a API de registo:', err);
    return { success: false, error: 'Erro de conexão com o servidor.' };
  }
}