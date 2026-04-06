interface MenuScreenProps {
  onStart: (round: 1 | 2) => void;
  onBack: () => void;
}

export function MenuScreen({ onStart, onBack }: MenuScreenProps) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:620 }}>
        <div style={{ fontSize:30, fontWeight:900, color:'#FF3B3B', marginBottom:4 }}>SIMULADOR DO PLANTÃO</div>
        <div style={{ fontSize:13, color:'#00d4ff', fontWeight:600, marginBottom:24 }}>Curso de Gestão de Fluxo Hospitalar — ED Leaders</div>
        <div style={{ textAlign:'left', background:'#0f172a', borderRadius:12, padding:20, border:'1px solid #1e293b', marginBottom:22 }}>
          <p style={{ color:'#94a3b8', lineHeight:1.7, marginBottom:10 }}>
            Você é o <strong style={{ color:'#00d4ff' }}>coordenador de fluxo</strong> de um hospital com 100 leitos.
            Clique num paciente [OK] para selecionar, depois clique no setor destino para mover.
          </p>
          <p style={{ color:'#94a3b8', lineHeight:1.7 }}>
            O gargalo está na <strong style={{ color:'#FF3B3B' }}>saída</strong>, não na entrada.
            Acima de 85% de ocupação: colapso exponencial.
          </p>
        </div>
        <div style={{ display:'flex', gap:18, justifyContent:'center', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:220 }}>
            <button onClick={() => onStart(1)} className="btn"
              style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'14px 32px', fontSize:16, fontWeight:800, width:'100%', boxShadow:'0 0 30px rgba(255,59,59,.3)', marginBottom:8 }}>
              PLANTÃO TRAVADO
            </button>
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>Rodada 1 — sem ferramentas. O sistema congela.</div>
          </div>
          <div style={{ flex:1, minWidth:220 }}>
            <button onClick={() => onStart(2)} className="btn"
              style={{ background:'linear-gradient(135deg,#00d4ff,#0891b2)', padding:'14px 32px', fontSize:16, fontWeight:800, width:'100%', boxShadow:'0 0 30px rgba(0,212,255,.3)', marginBottom:8 }}>
              PLANTÃO LEAN
            </button>
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>Rodada 2 — ferramentas Lean ativas. Mesma demanda, resultado oposto.</div>
          </div>
        </div>
        <button onClick={onBack} className="btn"
          style={{ background:'rgba(255,255,255,.06)', border:'1px solid #334155', color:'#94a3b8', marginTop:20, padding:'10px 28px', fontSize:13 }}>
          ← Voltar
        </button>
      </div>
    </div>
  );
}
