import { useState } from 'react';

interface RoleSelectorProps {
  onJogador: () => void;
  onFacilitador: () => void;
}

export function RoleSelector({ onJogador, onFacilitador }: RoleSelectorProps) {
  const [showRules, setShowRules] = useState(false);

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'linear-gradient(180deg, #060a13 0%, #0a1628 50%, #060a13 100%)', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:540, width:'100%' }}>
        <div style={{ marginBottom:16 }}>
          <img src="img/edleaders.png" alt="ED Leaders" style={{ height:120, width:120, objectFit:'cover', borderRadius:'50%', marginBottom:16 }}/>
        </div>
        <div style={{ fontSize:42, fontWeight:900, letterSpacing:'.02em', marginBottom:2,
          background:'linear-gradient(135deg, #FF3B3B, #f97316, #eab308)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          FLAME 2026
        </div>
        <div style={{ fontSize:15, color:'#94a3b8', fontWeight:500, marginBottom:4 }}>2° Congresso Latino-americano de Medicina de Emergência</div>
        <div style={{ width:80, height:2, background:'linear-gradient(90deg, transparent, #00d4ff, transparent)', margin:'0 auto', marginTop:10, marginBottom:24 }}/>
        <div style={{ fontSize:22, fontWeight:800, color:'#e2e8f0', marginBottom:6 }}>Simulador do Plantão</div>
        <div style={{ fontSize:12, color:'#64748b', marginBottom:28 }}>Experimente na pele o impacto da gestão (ou da falta dela) no fluxo hospitalar</div>

        <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap', marginBottom:20 }}>
          <button onClick={onJogador} className="btn"
            style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'18px 44px', fontSize:17, fontWeight:800, borderRadius:12, boxShadow:'0 4px 30px rgba(255,59,59,.3)', minWidth:200, letterSpacing:'.02em' }}>
            Sou Jogador
          </button>
          <button onClick={onFacilitador} className="btn"
            style={{ background:'linear-gradient(135deg,#0891b2,#0e7490)', padding:'18px 44px', fontSize:17, fontWeight:800, borderRadius:12, boxShadow:'0 4px 30px rgba(0,212,255,.25)', minWidth:200, letterSpacing:'.02em' }}>
            Sou Facilitador
          </button>
        </div>

        <div style={{ display:'flex', justifyContent:'center' }}>
          <button onClick={() => setShowRules(true)} className="btn"
            style={{ background:'rgba(255,255,255,.1)', border:'1px solid #475569', color:'#e2e8f0', padding:'11px 28px', fontSize:13, borderRadius:10, letterSpacing:'.03em', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:18, height:18, borderRadius:'50%', background:'rgba(0,212,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#00d4ff' }}>?</span>
            Como Jogar
          </button>
        </div>

        <div style={{ marginTop:32, display:'flex', alignItems:'center', justifyContent:'center', gap:20 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#475569', letterSpacing:'.1em', marginBottom:4 }}>REALIZAÇÃO</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#FF3B3B', letterSpacing:'.06em' }}>ED<span style={{ color:'#c8b8a8' }}>LEADERS</span></div>
          </div>
          <div style={{ width:1, height:24, background:'#1e293b' }}/>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#475569', letterSpacing:'.1em', marginBottom:4 }}>APOIO</div>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ fontSize:11, fontWeight:800, color:'#1a4d8f', background:'linear-gradient(135deg,#eab308,#f59e0b)', padding:'2px 8px', borderRadius:4 }}>FLAME</div>
              <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', padding:'2px 8px', background:'rgba(26,77,143,.2)', borderRadius:4, border:'1px solid rgba(26,77,143,.3)' }}>ABRAMEDE</div>
            </div>
          </div>
        </div>
      </div>

      {showRules && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}
          onClick={() => setShowRules(false)}>
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:16, padding:'32px 28px', maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto',
            boxShadow:'0 20px 60px rgba(0,0,0,.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.14em', marginBottom:6, textTransform:'uppercase' }}>Orientações</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#e2e8f0', marginBottom:20 }}>Como Jogar</div>

            <div style={{ padding:'14px 16px', background:'rgba(0,212,255,.05)', border:'1px solid rgba(0,212,255,.15)', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#00d4ff', marginBottom:6, letterSpacing:'.06em' }}>SUA MISSÃO</div>
              <div style={{ fontSize:13, color:'#e2e8f0', lineHeight:1.7 }}>
                Você é o <strong>gestor de fluxo</strong> do hospital. Controla todas as movimentações — entradas, internações e altas. Um NIR com superpoderes.
              </div>
            </div>

            <div style={{ padding:'14px 16px', background:'rgba(255,255,255,.02)', border:'1px solid #1e293b', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:6, letterSpacing:'.06em' }}>COMO MOVER PACIENTES</div>
              <div style={{ fontSize:13, color:'#cbd5e1', lineHeight:1.7 }}>
                1. Clique no paciente com badge <span style={{ color:'#22c55e', fontWeight:800 }}>OK</span><br/>
                2. Clique no setor destino para movê-lo<br/>
                3. Pacientes sem [OK] ainda estão em avaliação
              </div>
            </div>

            <div style={{ padding:'14px 16px', background:'rgba(255,255,255,.02)', border:'1px solid #1e293b', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:8, letterSpacing:'.06em' }}>GRAVIDADE DOS PACIENTES</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { c:'#22c55e', l:'Verde', d:'Baixa complexidade' },
                  { c:'#eab308', l:'Amarelo', d:'Média complexidade' },
                  { c:'#f97316', l:'Laranja', d:'Alta complexidade' },
                  { c:'#ef4444', l:'Vermelho', d:'Crítico / UTI' },
                ].map(({c,l,d}) => (
                  <div key={c} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:12, height:12, borderRadius:'50%', background:c, flexShrink:0 }}/>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:c }}>{l}</div>
                      <div style={{ fontSize:11, color:'#64748b' }}>{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding:'14px 16px', background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#ef4444', marginBottom:6, letterSpacing:'.06em' }}>ATENÇÃO: BOARDING</div>
              <div style={{ fontSize:13, color:'#f87171', lineHeight:1.7 }}>
                Paciente pronto para internar mas <strong>sem leito</strong> fica em boarding no DE.
                Após <strong>3 horas</strong> ele deteriora. Após <strong>6 horas</strong>, óbito evitável.
              </div>
            </div>

            <div style={{ padding:'14px 16px', background:'rgba(255,255,255,.02)', border:'1px solid #1e293b', borderRadius:10, marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:6, letterSpacing:'.06em' }}>TEMPO</div>
              <div style={{ fontSize:13, color:'#cbd5e1', lineHeight:1.7 }}>
                <strong>1 segundo real = 1 minuto</strong> no hospital.<br/>
                O plantão vai das <strong>7h às 19h</strong> — dura <strong>12 minutos</strong> reais.
              </div>
            </div>

            <div style={{ textAlign:'center', padding:'12px 16px', background:'linear-gradient(135deg, rgba(34,197,94,.08), rgba(0,212,255,.08))', borderRadius:10, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0' }}>
                Maximize altas. Minimize boarding. Evite óbitos.
              </div>
            </div>

            <button onClick={() => setShowRules(false)} className="btn"
              style={{ background:'#374151', padding:'10px 0', width:'100%', fontSize:14, borderRadius:10 }}>
              Entendi!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
