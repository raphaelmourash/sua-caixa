import React, { useState } from 'react';
import { loginApi, registerApi } from '../services/api';

export default function Auth({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const res = await registerApi(email, password);
      if (res.success) {
        alert('Conta criada com sucesso! Faça login para continuar.');
        setIsSignUp(false);
      } else {
        alert(`Erro ao registar: ${res.error}`);
      }
    } else {
      const res = await loginApi(email, password);
      if (res.success) {
        // Guarda o utilizador autenticado no localStorage para manter a sessão ativa
        localStorage.setItem('nexus_user', JSON.stringify(res.user));
        onLoginSuccess(res.user);
      } else {
        alert(`Erro ao entrar: ${res.error}`);
      }
    }

    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
        <h2 style={{ color: '#06b6d4', marginBottom: '20px', textAlign: 'center', fontSize: '18px' }}>
          {isSignUp ? 'Criar Conta - SuaCaixa' : 'Login - SuaCaixa'}
        </h2>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            placeholder="O seu email..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-text"
            required
          />
          <input
            type="password"
            placeholder="Palavra-passe..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-text"
            required
          />
          <button 
            type="submit" 
            disabled={loading} 
            className="btn btn-teal" 
            style={{ width: '100%', fontWeight: 'bold', marginTop: '10px' }}
          >
            {loading ? 'A processar...' : (isSignUp ? 'Registar Conta' : 'Entrar')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '15px', fontSize: '13px', color: '#94a3b8' }}>
          {isSignUp ? 'Já tem uma conta?' : 'Não tem conta?'} {' '}
          <span 
            onClick={() => setIsSignUp(!isSignUp)} 
            style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isSignUp ? 'Faça login' : 'Registe-se'}
          </span>
        </p>
      </div>
    </div>
  );
}