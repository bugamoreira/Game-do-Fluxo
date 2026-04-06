interface WaitingScreenProps {
  tName: string;
  rCode: string;
}

export function WaitingScreen({ tName, rCode }: WaitingScreenProps) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:440 }}>
        <div style={{ fontSize:32, fontWeight:900, color:'#FF3B3B', marginBottom:2 }}>SIMULADOR DO PLANTÃO</div>
        <div style={{ fontSize:13, color:'#00d4ff', fontWeight:600, marginBottom:36 }}>ED Leaders × FLAME 2026</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:36, border:'1px solid #1e293b' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#e2e8f0', marginBottom:6 }}>{tName}</div>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:28 }}>
            Sala: <span style={{ color:'#00d4ff', fontWeight:800, letterSpacing:'.12em' }}>{rCode}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:8 }}>
            <div style={{ width:9, height:9, borderRadius:'50%', background:'#22c55e', animation:'pulse 1.5s infinite' }}/>
            <span style={{ color:'#94a3b8', fontSize:13 }}>Conectado. Aguardando o facilitador...</span>
          </div>
          <div style={{ fontSize:11, color:'#475569', marginTop:20, lineHeight:1.6 }}>
            O jogo começará automaticamente quando o facilitador clicar em "Iniciar Rodada".
          </div>
        </div>
      </div>
    </div>
  );
}
