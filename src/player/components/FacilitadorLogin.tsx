import { useState } from 'react';
import { CREDENTIALS } from '../../shared/lib/constants';

interface FacilitadorLoginProps {
  onAuth: () => void;
  onBack: () => void;
}

export function FacilitadorLogin({ onAuth, onBack }: FacilitadorLoginProps) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (user.trim() === CREDENTIALS.user && pass === CREDENTIALS.pass) onAuth();
    else setErr('Credenciais inválidas. Tente novamente.');
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:380, width:'100%' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.14em', marginBottom:6, textTransform:'uppercase' }}>Acesso Facilitador</div>
        <div style={{ fontSize:28, fontWeight:900, color:'#FF3B3B', marginBottom:4 }}>SIMULADOR DO PLANTÃO</div>
        <div style={{ fontSize:12, color:'#00d4ff', fontWeight:600, marginBottom:28 }}>ED Leaders × FLAME 2026</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            <input placeholder="Login" value={user} onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoFocus autoComplete="username" />
            <input placeholder="Senha" type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password" />
          </div>
          {err && <div style={{ color:'#f87171', fontSize:11, marginBottom:10 }}>{err}</div>}
          <button onClick={submit} className="btn"
            style={{ background:'linear-gradient(135deg,#0891b2,#0e7490)', padding:'12px 32px', fontSize:14, fontWeight:800, width:'100%', boxShadow:'0 0 24px rgba(0,212,255,.2)' }}>
            Entrar
          </button>
        </div>
        <button onClick={onBack} className="btn"
          style={{ background:'transparent', color:'#475569', marginTop:14, fontSize:12 }}>
          ← Voltar
        </button>
      </div>
    </div>
  );
}
