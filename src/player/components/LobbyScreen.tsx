import { useState } from 'react';

interface LobbyScreenProps {
  onJoin: (name: string, code: string) => Promise<{ error?: string }>;
  onSolo: () => void;
  onBack: () => void;
}

export function LobbyScreen({ onJoin, onSolo, onBack }: LobbyScreenProps) {
  const [tName, setTName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const sanitize = (s: string) => s.replace(/<[^>]*>/g, '').replace(/[^\w\sÀ-ÿ\-.]/g, '').trim().slice(0, 30);

  const submit = async () => {
    const name = sanitize(tName);
    if (!name) { setErr('Digite o nome do seu time.'); return; }
    if (name.length < 2) { setErr('Nome precisa ter pelo menos 2 caracteres.'); return; }
    if (name.length > 30) { setErr('Nome pode ter no máximo 30 caracteres.'); return; }
    if (/^\d+$/.test(name)) { setErr('Nome não pode ser só números.'); return; }
    setLoading(true); setErr('');
    const result = await onJoin(name, 'FLAME');
    if (result?.error) { setErr(result.error); setLoading(false); }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'linear-gradient(180deg, #060a13 0%, #0a1628 50%, #060a13 100%)', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:440, width:'100%' }}>
        <img src="img/edleaders.png" alt="ED Leaders" style={{ height:36, objectFit:'contain', marginBottom:10 }} />
        <div style={{ fontSize:26, fontWeight:900, color:'#FF3B3B', letterSpacing:'.02em', marginBottom:2 }}>Simulador do Plantão</div>
        <div style={{ fontSize:12, color:'#00d4ff', fontWeight:600, marginBottom:28 }}>FLAME 2026 — Curso de Gestão de Fluxo</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:18, letterSpacing:'.08em', textTransform:'uppercase' }}>Entrar na Dinâmica</div>
          <input placeholder="Nome do seu time (ex: Grupo Alpha)" value={tName}
            onChange={e => setTName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} maxLength={30} autoFocus
            style={{ width:'100%', marginBottom:14, fontSize:15, padding:'12px 16px', textAlign:'center', fontWeight:700 }} />
          {err && <div style={{ color:'#f87171', fontSize:11, marginBottom:12 }}>{err}</div>}
          <button onClick={submit} disabled={loading} className="btn"
            style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'14px 32px', fontSize:16, fontWeight:800, width:'100%', boxShadow:'0 4px 24px rgba(255,59,59,.3)', opacity: loading ? 0.6 : 1, borderRadius:10 }}>
            {loading ? 'Conectando...' : 'Entrar'}
          </button>
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onSolo} className="btn"
            style={{ background:'rgba(255,255,255,.04)', border:'1px solid #334155', color:'#64748b', padding:'9px 24px', fontSize:12 }}>
            Jogar Sozinho
          </button>
          <button onClick={onBack} className="btn"
            style={{ background:'transparent', color:'#475569', fontSize:12 }}>
            ← Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
