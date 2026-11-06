// backend/server.js
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// 🚀 Porta dinâmica para o Render (ou 5000 por omissão localmente)
const PORT = process.env.PORT || 5000;

// Configuração do Supabase
const SUPABASE_URL = 'https://sapgbneukbkfegicgomc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ro8NvmbsyqytdjN7AOb5Gw_AQYMzLk4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// Caminho para o ficheiro de fallback local (mantido por segurança)
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'local_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], playlists: {} }, null, 2));
}

function readLocalDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { users: [], playlists: {} };
  }
}

function writeLocalDb(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ==========================================
// 🔐 ROTAS DE AUTENTICAÇÃO COM FALLBACK
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (err) {
    console.warn('⚠️ Supabase indisponível no Registo. Usando base local...', err.message);
    const db = readLocalDb();
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ success: false, error: 'O utilizador já existe.' });
    }
    const newUser = { id: email, email };
    db.users.push({ ...newUser, password });
    writeLocalDb(db);
    res.json({ success: true, user: newUser });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (err) {
    console.warn('⚠️ Supabase indisponível no Login. Usando base local...', err.message);
    const db = readLocalDb();
    const user = db.users.find(u => u.email === email && u.password === password);
    if (!user) {
      return res.status(400).json({ success: false, error: 'Email ou palavra-passe inválidos.' });
    }
    res.json({ success: true, user: { id: user.id, email: user.email } });
  }
});

// ==========================================
// 📂 ROTAS DE PLAYLISTS COM FALLBACK
// ==========================================

app.get('/api/playlists/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const playlistsObj = {};
    data.forEach(row => {
      playlistsObj[row.name] = {
        folder: row.folder,
        album: row.album,
        artist: row.artist,
        coverUrl: row.cover_url,
        tracks: row.tracks
      };
    });
    res.json({ success: true, playlists: playlistsObj });
  } catch (err) {
    console.warn('⚠️ Supabase indisponível no GET Playlists. Usando base local...');
    const db = readLocalDb();
    res.json({ success: true, playlists: db.playlists[userId] || {} });
  }
});

app.post('/api/playlists', async (req, res) => {
  const { userId, name, folder, album, artist, coverUrl, tracks } = req.body;
  try {
    const { error } = await supabase
      .from('playlists')
      .upsert({
        user_id: userId,
        name,
        folder,
        album,
        artist,
        cover_url: coverUrl,
        tracks,
        updated_at: new Date()
      }, { onConflict: 'user_id,name' });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.warn('⚠️ Supabase indisponível no POST Playlists. Salvando localmente...');
    const db = readLocalDb();
    if (!db.playlists[userId]) db.playlists[userId] = {};
    db.playlists[userId][name] = { folder, album, artist, coverUrl, tracks };
    writeLocalDb(db);
    res.json({ success: true });
  }
});

app.delete('/api/playlists/:userId/:playlistName', async (req, res) => {
  const { userId, playlistName } = req.params;
  const decodedName = decodeURIComponent(playlistName);
  try {
    const { error } = await supabase
      .from('playlists')
      .delete()
      .match({ user_id: userId, name: decodedName });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.warn('⚠️ Supabase indisponível no DELETE. Apagando localmente...');
    const db = readLocalDb();
    if (db.playlists[userId]) {
      delete db.playlists[userId][decodedName];
      writeLocalDb(db);
    }
    res.json({ success: true });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend a correr na porta ${PORT} (com modo de resiliência local ativo)`);
});