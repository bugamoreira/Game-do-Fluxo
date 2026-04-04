// ============================================================
// PLANTÃO TRAVADO / PLANTÃO LEAN — UI + Multiplayer
// ED Leaders × FLAME 2026
// ============================================================
const { useState, useEffect, useRef, useCallback } = React;

// ── SVG person icon ───────────────────────────────────────────
function PSvg({ color, sz = 18, dead, det, style = {} }) {
  return (
    <svg viewBox="0 0 24 34" width={sz} height={sz * 1.4}
      style={{ filter: det ? 'drop-shadow(0 0 4px #ef4444)' : 'none', opacity: dead ? .25 : 1, ...style }}>
      <circle cx="12" cy="6" r="5" fill={dead ? '#555' : color}/>
      <path d="M12 12C6 12 3 17 3 23h18c0-6-3-11-9-11z" fill={dead ? '#444' : color}/>
      <rect x="5"  y="23" width="5" height="8" rx="2" fill={dead ? '#3a3a3a' : color} opacity=".8"/>
      <rect x="14" y="23" width="5" height="8" rx="2" fill={dead ? '#3a3a3a' : color} opacity=".8"/>
    </svg>
  );
}

// ── Regular chip (DE / RPA / UTI) ────────────────────────────
function Chip({ p, sel, onClick }) {
  const s   = SEV[p.sev];
  const isR = p.ready || (p.dischReady && p.prep <= 0 && !p.social);
  const minsTodet = p.ready && (p.dest === 'enf' || p.dest === 'uti') && !p.det && !p.dead && p.bMin > 0
    ? Math.max(0, BOARD_DET_MIN - p.bMin) : null;

  return (
    <div className={`chip${sel ? ' selected' : ''}`}
      onClick={e => { e.stopPropagation(); onClick(p); }}
      title={`${p.name} (${s.l})${p.bMin > 0 ? ` | Board: ${Math.floor(p.bMin/60)}h${String(p.bMin%60).padStart(2,'0')}` : ''}`}
      style={{
        background: sel ? undefined : 'rgba(255,255,255,.02)',
        border: sel ? undefined : p.dead ? '1px solid #555' : p.det ? '1px solid #ef4444'
          : isR ? `1px solid ${s.c}` : '1px dashed #333',
      }}>
      <PSvg color={s.c} sz={16} dead={p.dead} det={p.det}/>
      {p.dead && <span className="badge badge-tr" style={{ color:'#ef4444' }}>X</span>}
      {p.det && !p.dead && <span className="badge badge-tr" style={{ color:'#f97316', animation:'pulse 1s infinite' }}>!</span>}
      {isR && !p.dead && !p.det && <span className="badge badge-tr" style={{ color:'#22c55e', animation:'bounce 1.5s infinite', marginTop:4 }}>OK</span>}
      {p.offSvc && <span className="badge badge-bl" style={{ color:'#f97316', fontSize:7 }}>OFF</span>}
      {(p.social || p.blocked) && <span className="badge badge-br" style={{ color:'#eab308', fontSize:7 }}>BL</span>}
      {p.obsProlong && <span className="badge badge-bl" style={{ color:'#a855f7', fontSize:7 }}>OBS</span>}
      {p.labDelay && <span className="badge badge-bl" style={{ color:'#06b6d4', fontSize:7 }}>LAB</span>}
      {p.bMin > 0 && !p.dead && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, borderRadius:'0 0 5px 5px',
          background: p.bMin >= BOARD_DEAD_MIN ? '#ef4444' : p.bMin >= BOARD_DET_MIN ? '#f97316' : '#eab308' }}/>
      )}
      {minsTodet !== null && minsTodet < 60 && (
        <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
          fontSize:7, fontWeight:800, color:'#ef4444', whiteSpace:'nowrap', animation:'pulse 1s infinite' }}>
          {minsTodet}m!
        </div>
      )}
    </div>
  );
}

// ── Mini chip for ENF bed grid ────────────────────────────────
function MiniChip({ p, sel, onClick }) {
  const s      = SEV[p.sev];
  const ready  = p.dischReady && p.prep <= 0 && !p.social && !p.blocked;
  const selected = sel?.id === p.id;
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(p); }}
      title={`${p.name} (${s.l})${ready ? ' — PRONTO ALTA' : ''}${p.blocked ? ' — BLOQUEADO' : ''}${p.social ? ' — SOCIAL' : ''}${p.det ? ' — DETERIOROU' : ''}`}
      style={{
        width:26, height:34, borderRadius:5, cursor:'pointer', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background: selected ? 'rgba(0,212,255,.22)' : ready ? `${s.c}35`
          : p.det ? 'rgba(239,68,68,.25)' : p.blocked ? 'rgba(234,179,8,.12)' : p.social ? 'rgba(168,85,247,.12)'
          : `${s.c}12`,
        border: selected ? '2px solid #00d4ff' : ready ? `1px solid ${s.c}99`
          : p.blocked ? '1px solid #eab30888' : p.social ? '1px solid #a855f788'
          : p.det ? '1px solid #ef444499' : `1px solid ${s.c}33`,
        transition:'all .15s', position:'relative',
      }}>
      <PSvg color={s.c} sz={11} dead={p.dead} det={p.det}/>
      {ready && <div style={{ position:'absolute', top:1, right:1, width:5, height:5, borderRadius:'50%', background:s.c }}/>}
      {p.det  && <div style={{ position:'absolute', top:0, left:1, fontSize:7, color:'#ef4444', fontWeight:900, lineHeight:1 }}>!</div>}
      {p.social && <div style={{ position:'absolute', bottom:0, right:1, fontSize:5, color:'#a855f7', fontWeight:900 }}>S</div>}
    </div>
  );
}

// ── Surgery panel ─────────────────────────────────────────────
function SxPan({ surgeries, sm }) {
  return (
    <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:10, padding:8, flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:5, letterSpacing:'.08em', flexShrink:0 }}>CC — 4 SALAS | {surgeries.length} Cx</div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {surgeries.map(s => {
          const stM = s.stH*60, enM = stM+s.dur*60;
          const inP = sm>=stM && sm<enM && s.st==='scheduled';
          const done = sm>=enM && s.st!=='cancelled';
          const cn   = s.st==='cancelled';
          const prog = inP ? Math.round((sm-stM)/(enM-stM)*100) : 0;
          const col  = cn ? '#ef4444' : inP ? '#eab308' : done ? '#22c55e' : '#94a3b8';
          return (
            <div key={s.id} style={{ fontSize:11, padding:'4px 6px', borderRadius:5, marginBottom:2,
              background: cn ? 'rgba(239,68,68,.06)' : inP ? 'rgba(234,179,8,.08)' : done ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.02)',
              border:`1px solid ${col}22`, opacity:cn?.5:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:col, fontWeight:600 }}>{s.label}</span>
                <span style={{ fontSize:11, color:'#64748b', fontFamily:'monospace' }}>
                  {cn ? 'CANCEL' : inP ? `${prog}%` : done ? `>${s.dest==='uti'?'UTI':'ENF'}` : fmt(s.stH*60)}
                </span>
              </div>
              {inP && <div style={{ height:2, background:'#1e293b', borderRadius:1, marginTop:2 }}>
                <div style={{ width:`${prog}%`, height:'100%', background:'#eab308', borderRadius:1, transition:'width 1s' }}/>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Role Selector (entry point único) ─────────────────────────
function RoleSelector({ onJogador, onFacilitador }) {
  const [showRules, setShowRules] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'linear-gradient(180deg, #060a13 0%, #0a1628 50%, #060a13 100%)', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:540, width:'100%' }}>
        {/* Logo ED Leaders */}
        <div style={{ marginBottom:16 }}>
          <img src="img/edleaders.png" alt="ED Leaders" style={{ height:120, width:120, objectFit:'cover', borderRadius:'50%', marginBottom:16 }}/>
        </div>

        {/* Título */}
        <div style={{ fontSize:42, fontWeight:900, letterSpacing:'.02em', marginBottom:2,
          background:'linear-gradient(135deg, #FF3B3B, #f97316, #eab308)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          FLAME 2026
        </div>
        <div style={{ fontSize:15, color:'#94a3b8', fontWeight:500, marginBottom:4 }}>2° Congresso Latino-americano de Medicina de Emergência</div>
        <div style={{ width:80, height:2, background:'linear-gradient(90deg, transparent, #00d4ff, transparent)', margin:'0 auto', marginTop:10, marginBottom:24 }}/>

        <div style={{ fontSize:22, fontWeight:800, color:'#e2e8f0', marginBottom:6 }}>Simulador do Plantão</div>
        <div style={{ fontSize:12, color:'#64748b', marginBottom:28 }}>Experimente na pele o impacto da gestão (ou da falta dela) no fluxo hospitalar</div>

        {/* Buttons */}
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
          <button onClick={()=>setShowRules(true)} className="btn"
            style={{ background:'rgba(255,255,255,.1)', border:'1px solid #475569', color:'#e2e8f0', padding:'11px 28px', fontSize:13, borderRadius:10, letterSpacing:'.03em', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:18, height:18, borderRadius:'50%', background:'rgba(0,212,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#00d4ff' }}>?</span>
            Como Jogar
          </button>
        </div>

        {/* Apoio institucional */}
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

      {/* Modal: Como Jogar */}
      {showRules && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}
          onClick={()=>setShowRules(false)}>
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:16, padding:'32px 28px', maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto',
            boxShadow:'0 20px 60px rgba(0,0,0,.6)' }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.14em', marginBottom:6, textTransform:'uppercase' }}>Orientações</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#e2e8f0', marginBottom:20 }}>Como Jogar</div>

            {/* Missão */}
            <div style={{ padding:'14px 16px', background:'rgba(0,212,255,.05)', border:'1px solid rgba(0,212,255,.15)', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#00d4ff', marginBottom:6, letterSpacing:'.06em' }}>SUA MISSÃO</div>
              <div style={{ fontSize:13, color:'#e2e8f0', lineHeight:1.7 }}>
                Você é o <strong>gestor de fluxo</strong> do hospital. Controla todas as movimentações — entradas, internações e altas. Um NIR com superpoderes.
              </div>
            </div>

            {/* Mecânica */}
            <div style={{ padding:'14px 16px', background:'rgba(255,255,255,.02)', border:'1px solid #1e293b', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:6, letterSpacing:'.06em' }}>COMO MOVER PACIENTES</div>
              <div style={{ fontSize:13, color:'#cbd5e1', lineHeight:1.7 }}>
                1. Clique no paciente com badge <span style={{ color:'#22c55e', fontWeight:800 }}>OK</span><br/>
                2. Clique no setor destino para movê-lo<br/>
                3. Pacientes sem [OK] ainda estão em avaliação
              </div>
            </div>

            {/* Cores */}
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

            {/* Boarding */}
            <div style={{ padding:'14px 16px', background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', borderRadius:10, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#ef4444', marginBottom:6, letterSpacing:'.06em' }}>ATENÇÃO: BOARDING</div>
              <div style={{ fontSize:13, color:'#f87171', lineHeight:1.7 }}>
                Paciente pronto para internar mas <strong>sem leito</strong> fica em boarding no DE.
                Após <strong>3 horas</strong> ele deteriora. Após <strong>6 horas</strong>, óbito evitável.
              </div>
            </div>

            {/* Tempo */}
            <div style={{ padding:'14px 16px', background:'rgba(255,255,255,.02)', border:'1px solid #1e293b', borderRadius:10, marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:6, letterSpacing:'.06em' }}>TEMPO</div>
              <div style={{ fontSize:13, color:'#cbd5e1', lineHeight:1.7 }}>
                <strong>1 segundo real = 1 minuto</strong> no hospital.<br/>
                O plantão vai das <strong>7h às 19h</strong> — dura <strong>12 minutos</strong> reais.
              </div>
            </div>

            {/* Objetivo */}
            <div style={{ textAlign:'center', padding:'12px 16px', background:'linear-gradient(135deg, rgba(34,197,94,.08), rgba(0,212,255,.08))', borderRadius:10, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0' }}>
                Maximize altas. Minimize boarding. Evite óbitos.
              </div>
            </div>

            <button onClick={()=>setShowRules(false)} className="btn"
              style={{ background:'#374151', padding:'10px 0', width:'100%', fontSize:14, borderRadius:10 }}>
              Entendi!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Facilitator Login ─────────────────────────────────────────
function FacilitadorLogin({ onAuth, onBack }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err,  setErr]  = useState('');
  const submit = () => {
    if (user.trim() === 'ed.leaders' && pass === 'flame2026') onAuth();
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
              onKeyDown={e => e.key==='Enter'&&submit()} autoFocus autoComplete="username"/>
            <input placeholder="Senha" type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key==='Enter'&&submit()} autoComplete="current-password"/>
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

// ── Lobby (Jogador) — sala fixa FLAME ────────────────────────
function LobbyScreen({ onJoin, onSolo, onBack }) {
  const [tName,   setTName]   = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!tName.trim()) { setErr('Digite o nome do seu time.'); return; }
    if (tName.trim().length < 2) { setErr('Nome precisa ter pelo menos 2 caracteres.'); return; }
    setLoading(true); setErr('');
    const result = await onJoin(tName.trim(), 'FLAME');
    if (result?.error) { setErr(result.error); setLoading(false); }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'linear-gradient(180deg, #060a13 0%, #0a1628 50%, #060a13 100%)', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:440, width:'100%' }}>
        <img src="img/edleaders.png" alt="ED Leaders" style={{ height:36, objectFit:'contain', marginBottom:10 }}/>
        <div style={{ fontSize:26, fontWeight:900, color:'#FF3B3B', letterSpacing:'.02em', marginBottom:2 }}>Simulador do Plantão</div>
        <div style={{ fontSize:12, color:'#00d4ff', fontWeight:600, marginBottom:28 }}>FLAME 2026 — Curso de Gestão de Fluxo</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:18, letterSpacing:'.08em', textTransform:'uppercase' }}>Entrar na Dinâmica</div>
          <input placeholder="Nome do seu time (ex: Grupo Alpha)" value={tName}
            onChange={e => setTName(e.target.value)} onKeyDown={e => e.key==='Enter'&&submit()} maxLength={30} autoFocus
            style={{ width:'100%', marginBottom:14, fontSize:15, padding:'12px 16px', textAlign:'center', fontWeight:700 }}/>
          {err && <div style={{ color:'#f87171', fontSize:11, marginBottom:12 }}>{err}</div>}
          <button onClick={submit} disabled={loading} className="btn"
            style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'14px 32px', fontSize:16, fontWeight:800, width:'100%', boxShadow:'0 4px 24px rgba(255,59,59,.3)', opacity:loading?.6:1, borderRadius:10 }}>
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

// ── Waiting ───────────────────────────────────────────────────
function WaitingScreen({ tName, rCode }) {
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

// ── Solo menu ─────────────────────────────────────────────────
function MenuScreen({ onStart }) {
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
      </div>
    </div>
  );
}

// ── Game over modal ───────────────────────────────────────────
function GameOverModal({ isR2, score, st, pts, moves, r1Results, onRestart, onMenu }) {
  const boarding = pts.filter(p => p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
  const corredor = pts.filter(p => p.sector==='corredor');
  const maxB     = pts.reduce((a, p) => Math.max(a, p.bMin), 0);
  const msg = isR2
    ? (st.deaths===0&&st.cxCan===0
        ? 'As ferramentas Lean transformaram o fluxo. Mesma demanda, resultado oposto. O problema nunca foi falta de leito — era falta de gestão.'
        : st.deaths===0 ? 'As ferramentas reduziram o impacto, mas ainda houve gargalos. Compare com a Rodada 1.'
        : 'Mesmo com ferramentas, o sistema sofreu. Reflita sobre quais ferramentas poderiam ter sido melhor utilizadas.')
    : (st.deaths>0
        ? 'O congelamento da saída causou óbitos evitáveis. O gargalo não está na porta de entrada — está na porta de saída.'
        : st.cxCan>0 ? 'Cirurgias canceladas criaram efeito cascata: menos altas, mais boarding, mais congelamento.'
        : st.dets>0  ? 'Pacientes deterioraram esperando leito. Boarding prolongado tem consequências clínicas reais.'
        : 'Bom gerenciamento! Na Rodada 2 (Plantão Lean), ferramentas Lean melhoram ainda mais.');

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#111827', border:'1px solid #1e293b', borderRadius:16, padding:32, maxWidth:560, width:'92%', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:4, display:'inline-block', marginBottom:8,
          background:isR2?'rgba(0,212,255,.12)':'rgba(255,59,59,.12)', color:isR2?'#00d4ff':'#FF3B3B' }}>
          {isR2 ? 'SIMULADOR DO PLANTÃO LEAN' : 'SIMULADOR DO PLANTÃO TRAVADO'}
        </div>
        <div style={{ fontSize:20, fontWeight:900, color:isR2?'#00d4ff':'#FF3B3B', marginBottom:8 }}>PLANTÃO ENCERRADO</div>
        <div style={{ fontSize:48, fontWeight:900, fontFamily:'monospace', marginBottom:16,
          color: score>700?'#22c55e':score>400?'#eab308':'#ef4444' }}>
          {score}<span style={{ fontSize:16, color:'#64748b' }}>/1000</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16, textAlign:'left' }}>
          {[
            { l:'Altas',        v:st.disc,         c:'#22c55e' },
            { l:'Board. máx',   v:`${Math.floor(maxB/60)}h${String(maxB%60).padStart(2,'0')}`, c:'#eab308' },
            { l:'Deteriorações',v:st.dets,          c:st.dets>0?'#f97316':'#22c55e' },
            { l:'Óbitos',       v:st.deaths,        c:st.deaths>0?'#ef4444':'#22c55e' },
            { l:'Cx canceladas',v:st.cxCan,         c:st.cxCan>0?'#ef4444':'#22c55e' },
            { l:'LWBS',         v:st.lwbs,          c:st.lwbs>0?'#ef4444':'#22c55e' },
            { l:'Off-service',  v:st.offS,          c:st.offS>0?'#f97316':'#22c55e' },
            { l:'Em boarding',  v:boarding.length,  c:boarding.length>0?'#ef4444':'#22c55e' },
            { l:'Corredor',     v:corredor.length,  c:corredor.length>0?'#ef4444':'#22c55e' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background:'rgba(255,255,255,.03)', padding:'6px 10px', borderRadius:6 }}>
              <div style={{ fontSize:11, color:'#64748b' }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:800, color:c, fontFamily:'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderRadius:10, padding:12, marginBottom:16, border:`1px solid ${isR2?'rgba(0,212,255,.15)':'rgba(255,59,59,.15)'}`,
          background:isR2?'rgba(0,212,255,.05)':'rgba(255,59,59,.06)' }}>
          <p style={{ color:isR2?'#7dd3fc':'#f87171', fontSize:12, lineHeight:1.6 }}>{msg}</p>
        </div>
        {/* Comparativo R1 vs R2 */}
        {isR2 && r1Results && (
          <div style={{ background:'rgba(0,212,255,.05)', border:'1px solid rgba(0,212,255,.15)', borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#00d4ff', marginBottom:10, letterSpacing:'.08em' }}>COMPARATIVO: PLANTÃO TRAVADO vs PLANTÃO LEAN</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 60px', gap:4, fontSize:11 }}>
              <div style={{ color:'#64748b', fontWeight:700 }}>Métrica</div>
              <div style={{ color:'#FF3B3B', fontWeight:700, textAlign:'right' }}>R1</div>
              <div style={{ color:'#00d4ff', fontWeight:700, textAlign:'right' }}>R2</div>
              <div style={{ color:'#22c55e', fontWeight:700, textAlign:'right' }}>Delta</div>
              {[
                { l:'Score', r1:r1Results.score, r2:score, inv:false },
                { l:'Óbitos', r1:r1Results.deaths, r2:st.deaths, inv:true },
                { l:'Deteriorações', r1:r1Results.dets, r2:st.dets, inv:true },
                { l:'Cx canceladas', r1:r1Results.cxCan, r2:st.cxCan, inv:true },
                { l:'LWBS', r1:r1Results.lwbs, r2:st.lwbs, inv:true },
                { l:'Altas', r1:r1Results.disc, r2:st.disc, inv:false },
              ].map(({l,r1,r2,inv}) => {
                const d = r2-r1;
                const good = inv ? d<0 : d>0;
                return [
                  <div key={l+'l'} style={{ color:'#94a3b8' }}>{l}</div>,
                  <div key={l+'r1'} style={{ textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#FF3B3B' }}>{r1}</div>,
                  <div key={l+'r2'} style={{ textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#00d4ff' }}>{r2}</div>,
                  <div key={l+'d'} style={{ textAlign:'right', fontFamily:'monospace', fontWeight:800, color: d===0?'#64748b':good?'#22c55e':'#ef4444' }}>
                    {d>0?'+':''}{d!==0?d:'—'}
                  </div>,
                ];
              })}
            </div>
          </div>
        )}

        {/* Painel de decisões */}
        {moves && moves.total > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
            <div style={{ background:'rgba(255,255,255,.03)', padding:'6px 10px', borderRadius:6, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Movimentos</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#00d4ff', fontFamily:'monospace' }}>{moves.total}</div>
            </div>
            <div style={{ background:'rgba(34,197,94,.05)', padding:'6px 10px', borderRadius:6, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Produtivos</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#22c55e', fontFamily:'monospace' }}>{moves.produtivo}</div>
            </div>
            <div style={{ background:'rgba(239,68,68,.05)', padding:'6px 10px', borderRadius:6, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Reativos</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#ef4444', fontFamily:'monospace' }}>{moves.reativo}</div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => onRestart(1)} className="btn" style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'10px 22px', fontSize:13, fontWeight:800 }}>Plantão Travado</button>
          <button onClick={() => onRestart(2)} className="btn" style={{ background:'linear-gradient(135deg,#00d4ff,#0891b2)', padding:'10px 22px', fontSize:13, fontWeight:800 }}>Plantão Lean</button>
          <button onClick={onMenu} className="btn" style={{ background:'#374151', padding:'10px 22px', fontSize:13 }}>Menu</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Game ─────────────────────────────────────────────────
// ── Session persistence helpers ──────────────────────────────
const SESSION_KEY = 'flame_session';
function saveSession(data) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch(e){} }
function loadSession() { try { const s=localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch(e){ return null; } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch(e){} }

function Game() {
  // Tentar restaurar sessão do localStorage
  const saved = useRef(loadSession());
  const s0 = saved.current;
  // Só restaura sessão play se foi salva nos últimos 5 minutos (evita sessão morta)
  const sessionFresh = s0?.savedAt && (Date.now() - s0.savedAt < 5 * 60 * 1000);
  const initPh = (s0?.ph === 'play' && sessionFresh) ? 'play' : 'role';
  // Se sessão é velha, limpa
  if (s0 && !sessionFresh) clearSession();

  const [ph,        setPh]       = useState(initPh);
  const [pts,       setPts]      = useState(s0?.pts || []);
  const [sx,        setSx]       = useState(s0?.sx || []);
  const [sm,        setSm]       = useState(s0?.sm ?? SH*60);
  const [run,       setRun]      = useState(s0?.ph === 'play' ? true : false);
  const [sel,       setSel]      = useState(null);
  const [fl,        setFl]       = useState(null);
  const [log,       setLog]      = useState(s0?.log || []);
  const [st,        setSt]       = useState(s0?.st || { disc:0, altaHosp:0, libDE:0, dets:0, deaths:0, cxCan:0, lwbs:0, offS:0, socB:0, boardHrs:0 });
  const [evts,      setEvts]     = useState(s0?.evts || { pcr:false, tomo:false, surto:false, social:false, lab:false, famDelay:false, pcrEnd:0, tomoEnd:0, labEnd:0 });
  const [cascade,   setCascade]  = useState(null);
  const [rpaW,      setRpaW]     = useState(null);
  const [rnd2,      setRnd2]     = useState(s0?.rnd2 || 1);
  const [nirUses,   setNirUses]  = useState(s0?.nirUses || 0);
  const [nirCd,     setNirCd]    = useState(s0?.nirCd || 0);
  const [deathFlash,setDeathFlash] = useState(false);
  // Contadores de decisão para painel pós-rodada
  const [moves, setMoves] = useState({ total:0, produtivo:0, reativo:0 });
  const [r1Results, setR1Results] = useState(s0?.r1Results || null); // salva resultado R1 para comparativo
  const [ccBlocked, setCcBlocked]  = useState(s0?.ccBlocked || false);
  const [showCcModal, setShowCcModal] = useState(null);
  const [fcUses,    setFcUses]     = useState(s0?.fcUses || 0);
  const [fcApproved,setFcApproved] = useState(false);

  // Multiplayer
  const [tName,  setTName]  = useState(s0?.tName || '');
  const [rCode,  setRCode]  = useState(s0?.rCode || '');
  const [roomId, setRoomId] = useState(s0?.roomId || null);
  const [teamId, setTeamId] = useState(s0?.teamId || null);

  const isR2 = rnd2 === 2;
  const ref  = useRef({ pts:s0?.pts||[], st:s0?.st||{}, sm:s0?.sm||0, nx:s0?.nx||SH*60+rnd(5,12), rd:s0?.rd||{}, evts:s0?.evts||{}, rnd2:s0?.rnd2||1, ccBlocked:s0?.ccBlocked||false });
  const doStartRRef = useRef(null); // ref estável para subscriptions Supabase
  const subChannelRef = useRef(null); // ref para cleanup de subscriptions

  // Salvar sessão a cada 3s durante o jogo
  useEffect(() => {
    if (ph !== 'play' && ph !== 'over' && ph !== 'waiting') return;
    const iv = setInterval(() => {
      saveSession({
        ph, pts:ref.current.pts, sx, sm:ref.current.sm, st:ref.current.st,
        evts:ref.current.evts, rnd2:ref.current.rnd2, log:log.slice(0,20),
        nirUses, nirCd, ccBlocked, tName, rCode, roomId, teamId,
        nx:ref.current.nx, rd:ref.current.rd, r1Results, savedAt:Date.now(),
      });
    }, 3000);
    return () => clearInterval(iv);
  }, [ph, sx, log, nirUses, nirCd, ccBlocked, tName, rCode, roomId, teamId]);

  // Restaurar subscriptions multiplayer se estava em jogo
  useEffect(() => {
    if (s0?.roomId && s0?.teamId && (s0?.ph === 'play' || s0?.ph === 'waiting')) {
      sb.channel(`rm-${s0.roomId}`)
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${s0.roomId}` }, p => {
          const cur = ref.current.rnd2;
          if (p.new.status==='round1' && cur !== 1) triggerStart(1);
          else if (p.new.status==='round2' && cur !== 2) triggerStart(2);
        })
        .subscribe();
    }
    saved.current = null;
  }, []);

  useEffect(() => { ref.current.pts  = pts  }, [pts]);
  useEffect(() => { ref.current.st   = st   }, [st]);
  useEffect(() => { ref.current.sm   = sm   }, [sm]);
  useEffect(() => { ref.current.evts = evts }, [evts]);
  useEffect(() => { ref.current.rnd2 = rnd2 }, [rnd2]);
  useEffect(() => { ref.current.ccBlocked = ccBlocked }, [ccBlocked]);

  const addL = useCallback((msg, type='info') => {
    setLog(prev => [{ msg, type, t:ref.current.sm }, ...prev].slice(0, 60));
  }, []);

  // Derived
  const byS      = s => pts.filter(p => p.sector===s);
  const deOcc    = byS('de').length;
  const enfOcc   = byS('enf').length;
  const utiOcc   = byS('uti').length;
  const rpaOcc   = byS('rpa').length;
  const boarding = pts.filter(p => p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
  const avgB     = boarding.length>0 ? Math.round(boarding.reduce((a,p)=>a+p.bMin,0)/boarding.length) : 0;
  const score    = calcScore({...st, isR2});
  const prevScoreRef = useRef(score);
  const [scorePulse, setScorePulse] = useState(null); // 'up' | 'down' | null
  useEffect(() => {
    if (score !== prevScoreRef.current && run) {
      setScorePulse(score > prevScoreRef.current ? 'up' : 'down');
      setTimeout(() => setScorePulse(null), 400);
      prevScoreRef.current = score;
    }
  }, [score, run]);
  const prog     = ((sm-SH*60)/((EH-SH)*60))*100;
  const deEval   = byS('de').filter(p=>!p.ready&&!p.obsProlong);
  const deBoard  = byS('de').filter(p=>p.ready&&(p.dest==='enf'||p.dest==='uti'));
  const deAlta   = byS('de').filter(p=>p.ready&&p.dest==='alta_de');
  const deObs    = byS('de').filter(p=>p.obsProlong);
  const enfReady = byS('enf').filter(p=>p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
  const utiReady = byS('uti').filter(p=>p.dischReady&&p.prep<=0);
  const dePct    = pctOf(deOcc, CAP.de);
  const hospPct  = hospOcc(enfOcc, utiOcc);  // (ENF+UTI)/100 leitos

  // ── Music update ──────────────────────────────────────────
  useEffect(() => {
    if (ph === 'play') {
      SimsMusic.update({ deOcc, boarding: boarding.length, deaths: st.deaths, isR2, run });
    }
  }, [deOcc, boarding.length, st.deaths, isR2, run, ph]);

  // ── Start round ───────────────────────────────────────────
  // Multiplayer: inicia direto (sem modal CC — facilitador já decidiu)
  // Solo: mostra modal de bloqueio CC
  const startR = useCallback((roundNum) => {
    if (roomId) {
      triggerStart(roundNum);
    } else {
      // Solo → mostrar modal CC
      setShowCcModal(roundNum);
    }
  }, [roomId]);

  const doStartR = useCallback((roundNum, blocked) => {
    // Som apenas no projetor — jogador não inicializa música
    _id = 0;
    setShowCcModal(null);
    setRnd2(roundNum);
    setCcBlocked(blocked);
    ref.current.ccBlocked = blocked;
    setPts(mkInit());

    // Cirurgias — em R1, atraso da primeira cirurgia na sala 1
    const sxList = roundNum===2 ? mkSxR2() : mkSx();
    if (roundNum===1) {
      const delay = rnd(30,60)/60; // 0.5-1h de atraso
      sxList.forEach(s => { if (s.sala === 1) s.stH += delay; });
    }
    // Se bloqueou sala 4 para emergências, remove cirurgias da sala 4 ou realocar
    if (blocked) {
      sxList.forEach(s => { if (s.sala === 4) s.sala = 3; }); // reagrupa na sala 3
    }
    setSx(sxList);

    setSm(SH*60);
    setRun(true);
    setPh('play');
    setSel(null);
    setNirUses(0); setFcUses(0); setFcApproved(false);
    setMoves({ total:0, produtivo:0, reativo:0 });
    setNirCd(0);
    setDeathFlash(false);
    const title = roundNum===2 ? 'PLANTÃO LEAN' : 'PLANTÃO TRAVADO';
    const ccMsg = blocked ? ' Sala 4 reservada para emergências.' : ' Todas as 4 salas em uso eletivo.';
    const r2Msg = roundNum===2 ? ' FERRAMENTAS LEAN ATIVAS: Alta precoce, Fast Track, Discharge Lounge, Surgical Smoothing, Fluxista, NIR, Full Capacity, Alta Segura.' : '';
    const initLogs = [{ msg:`${title} iniciado! DE 8/15, Enf 71/85, UTI 13/15. Ocupação hospitalar: 84%.${ccMsg}${r2Msg}`, type:'info', t:SH*60 }];
    if (roundNum===1) {
      const delayMin = Math.round((sxList.find(s=>s.sala===1)?.stH - 7.5) * 60);
      if (delayMin > 0) initLogs.push({ msg:`ATRASO: Primeira cirurgia atrasou ${delayMin}min. Efeito cascata na Sala 1.`, type:'warning', t:SH*60 });
    }
    if (roundNum===2) initLogs.push({ msg:'BED HUDDLE 7h: Previsão ~40 pacientes. 7 cirurgias redistribuídas. Pico 11h-14h.', type:'info', t:SH*60 });
    setLog(initLogs);
    setSt({ disc:0, altaHosp:0, libDE:0, dets:0, deaths:0, cxCan:0, lwbs:0, offS:0, socB:0, boardHrs:0 });
    setEvts({ pcr:false, tomo:false, surto:false, social:false, lab:false, famDelay:false, pcrEnd:0, tomoEnd:0, labEnd:0 });
    setCascade(null);
    setRpaW(null);
    ref.current.nx   = SH*60+rnd(5,12);
    ref.current.rd   = {};
    ref.current.rnd2 = roundNum;
  }, []);

  // Manter ref atualizado para subscriptions (evita stale closure)
  doStartRRef.current = doStartR;

  // Função wrapper estável — SEMPRE usa a versão mais recente via ref
  const triggerStart = useCallback((roundNum) => {
    if (doStartRRef.current) doStartRRef.current(roundNum, false);
  }, []);

  // ── Multiplayer: join room ────────────────────────────────
  const joinRoom = async (name, code) => {
    let room = null;
    // Tentar até 30s (10 tentativas) — permite jogador entrar antes do facilitador
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data } = await sb.from('rooms').select('id,code,status,allow_late_join').eq('code', code).maybeSingle();
      if (data) { room = data; break; }
      if (attempt < 9) await new Promise(r => setTimeout(r, 3000));
    }
    if (!room) return { error:`Sala não encontrada após 30s. Verifique se o facilitador iniciou a dinâmica.` };
    if (room.status === 'finished') return { error:`A dinâmica já foi encerrada.` };
    // Verificar nome duplicado
    const { data: existing } = await sb.from('teams').select('id').eq('room_id', room.id).eq('name', name).maybeSingle();
    if (existing) return { error:`Já existe um time chamado "${name}". Escolha outro nome.` };
    const cols = ['#FF3B3B','#00d4ff','#22c55e','#eab308','#f97316','#a855f7','#ec4899','#14b8a6'];
    const col  = cols[Math.floor(Math.random()*cols.length)];
    const { data:team, error } = await sb.from('teams').insert({ room_id:room.id, name, color:col }).select('id').single();
    if (error) {
      if (error.code === '23505') return { error:`Já existe um time chamado "${name}". Escolha outro nome.` };
      return { error:'Erro ao registrar time. Tente novamente.' };
    }
    if (!team) return { error:'Erro ao registrar time. Tente novamente.' };
    setTName(name); setRCode(code); setRoomId(room.id); setTeamId(team.id);
    // Re-fetch status atualizado (protege contra race condition facilitador/jogador)
    const { data: freshRoom } = await sb.from('rooms').select('status').eq('id', room.id).single();
    const st2 = freshRoom?.status || room.status;
    if (st2==='round1'||st2==='round2') {
      triggerStart(st2==='round1' ? 1 : 2);
    } else {
      setPh('waiting');
    }
    // Cleanup subscription anterior se existir
    if (subChannelRef.current) { sb.removeChannel(subChannelRef.current); }
    const ch = sb.channel(`rm-${room.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${room.id}` }, p => {
        if (p.new.status==='round1') triggerStart(1);
        else if (p.new.status==='round2') triggerStart(2);
      })
      .subscribe();
    subChannelRef.current = ch;
    return {};
  };

  // ── Multiplayer: sync score every 10s ────────────────────
  useEffect(() => {
    if (!teamId||!roomId) return;
    const iv = setInterval(() => {
      const P=ref.current.pts, S=ref.current.st, m=ref.current.sm, r=ref.current.rnd2;
      const brd = P.filter(p=>p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
      const avgBrd = brd.length>0 ? Math.round(brd.reduce((a,p)=>a+p.bMin,0)/brd.length) : 0;
      sb.from('game_state').upsert({
        team_id:teamId, room_id:roomId, round:r, sim_minute:m, score:calcScore({...S, isR2:r===2}),
        metrics:{
          dis:S.disc, det:S.dets, dth:S.deaths, cxC:S.cxCan, lw:S.lwbs, off:S.offS, soc:S.socB, bH:S.boardHrs,
          deOcc:P.filter(p=>p.sector==='de').length, enfOcc:P.filter(p=>p.sector==='enf').length,
          utiOcc:P.filter(p=>p.sector==='uti').length, rpaOcc:P.filter(p=>p.sector==='rpa').length,
          boarding:brd.length, avgB:avgBrd, corredor:P.filter(p=>p.sector==='corredor').length,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict:'team_id,round' });
    }, 2000);
    return () => clearInterval(iv);
  }, [teamId, roomId]);

  // ── Game tick ─────────────────────────────────────────────
  const tick = useCallback(() => {
    setSm(prev => {
      const nm = prev+1;
      if (nm>=EH*60) {
        setRun(false); setPh('over'); addL('Plantão encerrado!','success');
        const S = ref.current.st;
        const r = ref.current.rnd2;
        if (r === 1) setR1Results({ score: calcScore({...S,isR2:false}), ...S });
        // Salvar log no Supabase
        if (teamId && roomId) {
          sb.from('game_logs').insert({
            team_id:teamId, room_id:roomId, round:r,
            events: (log||[]).slice(0,50),
            final_score: calcScore({...S,isR2:r===2}),
            final_stats: S,
          });
        }
        return EH*60;
      }
      return nm;
    });
    setPts(prev => {
      let P = prev.map(p=>({...p}));
      const cm=ref.current.sm+1, ch=Math.floor(cm/60);
      let S={...ref.current.st};
      const R=ref.current.rd, E={...ref.current.evts};
      const isR2local = ref.current.rnd2===2;

      // ── Random events ────────────────────────────────────

      // Parada cardíaca — mais frequente em R1
      if (ch>=9&&ch<16&&!E.pcr&&Math.random()<(isR2local?.004:.008)) {
        E.pcr=true; E.pcrEnd=cm+60;
        addL('PARADA CARDÍACA no DE! 1 maca bloqueada por 1h.','danger');
      }
      if (E.pcr&&cm>=E.pcrEnd) { E.pcr=false; addL('Parada resolvida. Maca liberada.','success'); }

      // Tomógrafo quebrado
      if (ch>=8&&ch<14&&!E.tomo&&Math.random()<.005) {
        const tomoDur = isR2local ? 60 : 120;
        E.tomo=true; E.tomoEnd=cm+tomoDur;
        if (isR2local) addL('TOMÓGRAFO: manutenção preventiva, retorno em 1h.','warning');
        else addL('TOMÓGRAFO QUEBROU! Decisão +120min para todos no DE.','danger');
      }
      if (E.tomo&&cm>=E.tomoEnd) { E.tomo=false; addL('Tomógrafo reparado.','success'); }

      // Exames com atraso (NOVO — Teoria das Restrições)
      if (ch>=9&&ch<16&&!E.lab&&Math.random()<(isR2local?.002:.006)) {
        E.lab=true; E.labEnd=cm+(isR2local?45:90);
        const affected=P.filter(p=>p.sector==='de'&&!p.ready&&!p.obsProlong).slice(0,rnd(2,4));
        affected.forEach(p => { p.deNeed+=isR2local?30:60; p.labDelay=true; });
        addL(`ATRASO NO LABORATÓRIO! ${affected.length} pacientes aguardando resultados (+${isR2local?30:60}min).`,'warning');
      }
      if (E.lab&&cm>=E.labEnd) { E.lab=false; P.forEach(p => { if(p.labDelay) p.labDelay=false; }); addL('Laboratório normalizado.','success'); }

      // Surto: GARANTIDO às 12h na R1, aleatório na R2
      const surtoForced = !isR2local && cm===12*60 && !E.surto;
      const surtoRandom = ch>=12&&ch<15&&!E.surto&&Math.random()<.006;
      if (surtoForced||surtoRandom) {
        E.surto=true;
        for (let i=0;i<3;i++) {
          const d = i<2 ? rollDest(isR2local) : { dest:'uti', sev:'red', de:rnd(90,150) };
          const np=mkPt('triagem',d.dest,d.sev,false,d.de); np.arrMin=cm; P.push(np);
        }
        addL('SURTO! 3 pacientes simultâneos chegando!','danger');
        SimsMusic.sfx('cascade');
      }

      // Paciente social (atraso de familiares)
      if (ch>=10&&ch<17&&!E.social&&Math.random()<.005) {
        E.social=true;
        const ef=P.find(p=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
        if (ef) {
          ef.social=true; ef.socialDelay=isR2local?60:rnd(180,300); S.socB++;
          addL(`ATRASO DE FAMILIARES: ${ef.name} — leito bloqueado ~${Math.round(ef.socialDelay/60)}h.${isR2local?' Alta segura acionada: reduzido a 1h.':''}`, isR2local?'info':'warning');
        }
      }

      // Segundo caso social em R1 (agrava o problema)
      if (!isR2local&&ch>=13&&ch<16&&!E.famDelay&&Math.random()<.004) {
        E.famDelay=true;
        const ef=P.find(p=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
        if (ef) {
          ef.social=true; ef.socialDelay=rnd(120,240); S.socB++;
          addL(`BLOQUEIO SOCIAL: ${ef.name} — sem responsável, leito preso ~${Math.round(ef.socialDelay/60)}h!`,'warning');
        }
      }

      // Cirurgia de emergência do DE
      if (ch>=9&&ch<16&&Math.random()<(isR2local?.003:.005)) {
        const emgCandidate = P.find(p=>p.sector==='de'&&p.sev==='red'&&!p.dead&&!p.postOp);
        if (emgCandidate) {
          const rpaCount = P.filter(p=>p.sector==='rpa').length;
          const blocked = ref.current.ccBlocked;
          // Simplificado: se RPA tem vaga, pode operar
          if (rpaCount < CAP.rpa) {
            emgCandidate.sector='rpa'; emgCandidate.postOp=true; emgCandidate.ready=true; emgCandidate.dest='uti';
            emgCandidate.name=`EMG-${emgCandidate.name.split(' ')[0]}`;
            addL(`EMERGÊNCIA CIRÚRGICA: ${emgCandidate.name} → CC${blocked?' (sala reservada)':''} → RPA.`,'danger');
            SimsMusic.sfx('cascade');
          } else if (!blocked) {
            // RPA lotada e sem sala reservada → óbito
            emgCandidate.dead=true; S.deaths++;
            addL(`SEM SALA CIRÚRGICA! ${emgCandidate.name} — óbito evitável. RPA lotada, sem sala reservada.`,'danger');
            SimsMusic.sfx('death');
            setDeathFlash(true); setTimeout(()=>setDeathFlash(false),600);
          } else {
            // Bloqueou sala mas RPA lotada — opera na sala reservada, paciente fica em espera
            emgCandidate.blocked = true;
            emgCandidate.ready = false;
            addL(`EMERGÊNCIA: ${emgCandidate.name} operado na sala reservada. Aguardando vaga na RPA.`,'warning');
          }
        }
      }

      // Observação prolongada
      if (ch>=9&&ch<15&&Math.random()<.004) {
        const pp=P.find(p=>p.sector==='de'&&!p.ready&&!p.obsProlong);
        if (pp) { pp.obsProlong=true; pp.obsEnd=cm+rnd(300,480); pp.deNeed=99999; addL(`OBS PROLONGADA: ${pp.name} — maca presa por ${Math.round((pp.obsEnd-cm)/60)}h.`,'warning'); }
      }
      P.forEach(p => { if (p.obsProlong&&cm>=p.obsEnd) { p.obsProlong=false; p.ready=true; p.dest='alta_de'; addL(`${p.name} (obs) liberado.`,'success'); }});
      setEvts(E);

      // ── Arrivals ─────────────────────────────────────────
      if (cm>=ref.current.nx) {
        const d=rollDest(isR2local);
        const np=mkPt('triagem',d.dest,d.sev,false,d.de);
        np.arrMin=cm; if (E.tomo) np.deNeed+=120;
        if (E.lab) { np.deNeed+=30; np.labDelay=true; }
        const pcrB=E.pcr?1:0;
        if (P.filter(x=>x.sector==='de').length<CAP.de-pcrB) np.sector='de';
        P.push(np);
        const rate=arrRate(ch, isR2local);
        ref.current.nx=cm+Math.max(3,Math.round(60/rate)+rnd(-4,4));
      }

      // Auto-move triagem → DE
      const porta=P.filter(p=>p.sector==='triagem').sort((a,b)=>a.arrMin-b.arrMin);
      const pcrB=E.pcr?1:0;
      const space=CAP.de-pcrB-P.filter(p=>p.sector==='de').length;
      for (let i=0;i<Math.min(space,porta.length);i++) porta[i].sector='de';

      // DE processing with hospital congestion multiplier
      const eN=P.filter(p=>p.sector==='enf').length, uN=P.filter(p=>p.sector==='uti').length;
      const mult=hospMult(eN, uN, isR2local);
      P.forEach(p => { if (p.sector==='de'&&!p.ready&&!p.obsProlong) { p.deSpent+=mult; if (p.deSpent>=p.deNeed) { p.ready=true; if(p.labDelay) p.labDelay=false; }}});

      // R2: Fluxista auto-discharge alta_de every 20 sim-min
      if (isR2local&&cm%20===0) {
        const fluxPts=P.filter(p=>p.sector==='de'&&p.ready&&p.dest==='alta_de');
        fluxPts.forEach(p => { p.sector='alta'; S.disc++; addL(`Fluxista: ${p.name} — alta automática.`,'success'); });
        if (fluxPts.length>0) SimsMusic.sfx('fluxista');
      }

      // R2: Fast Track — green patients process 40% faster
      if (isR2local) {
        P.forEach(p => { if (p.sector==='de'&&!p.ready&&!p.obsProlong&&p.sev==='green') p.deSpent+=0.4; });
      }

      // R2: Fluxo puxado — DE lotado ACELERA decisões (pull system)
      const deCount = P.filter(p=>p.sector==='de').length;
      if (isR2local && deCount >= Math.round(CAP.de*0.8)) {
        P.forEach(p => { if (p.sector==='de'&&!p.ready&&!p.obsProlong) p.deSpent+=1.0; });
        if (!R.pullLog) { R.pullLog=true; addL('PROTOCOLO DE FLUXO RÁPIDO ATIVO — decisões aceleradas no DE.','success'); }
      }

      // NIR cooldown
      if (nirCd>0) setNirCd(prev=>Math.max(0,prev-1));

      // ── Boarding consequences ─────────────────────────────
      P.forEach(p => {
        if (p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')) {
          if (!p.bStart) p.bStart=cm;
          p.bMin=cm-p.bStart;
          S.boardHrs+=(1/60);
          if (p.bMin>=BOARD_DET_MIN&&!p.det) {
            p.det=true; S.dets++;
            addL(`DETERIORAÇÃO: ${p.name} — ${Math.floor(p.bMin/60)}h em boarding!`,'warning');
            SimsMusic.sfx('det');
          }
          if (p.bMin>=BOARD_DEAD_MIN&&!p.dead) {
            p.dead=true; S.deaths++;
            addL(`ÓBITO EVITÁVEL: ${p.name} — ${Math.floor(p.bMin/60)}h em boarding.`,'danger');
            SimsMusic.sfx('death');
            setDeathFlash(true); setTimeout(()=>setDeathFlash(false),600);
          }
        }
      });

      // Off-service deterioration
      P.forEach(p => {
        if (p.offSvc&&p.sector==='enf'&&!p.dead&&!p.det&&Math.random()<OFFSVC_DET_PROB) {
          p.det=true; p.sev='red'; S.dets++;
          // Fluxo reverso: deteriorou fora do perfil + UTI lotada → volta ao DE
          const utiCount = P.filter(x=>x.sector==='uti').length;
          if (utiCount >= CAP.uti) {
            p.sector='de'; p.offSvc=false;
            addL(`RETORNO AO DE: ${p.name} — deteriorou na ENF, sem vaga UTI. Damage control.`,'danger');
          } else {
            addL(`${p.name} deteriorou FORA DO PERFIL!`,'warning');
          }
          SimsMusic.sfx('det');
        }
      });

      // Dados reais — overlay educativo (1x cada)
      if (S.boardHrs>=2 && !R.factBoard) { R.factBoard=true; addL('Dados reais: boarding >2h aumenta risco de eventos adversos em 20%.','fact'); }
      if (S.dets>=1 && !R.factDet) { R.factDet=true; addL('Estudos mostram: cada hora de boarding >4h aumenta mortalidade em 2%.','fact'); }
      if (S.deaths>=1 && !R.factDeath) { R.factDeath=true; addL('Em hospitais com ocupação >95%, mortalidade cresce 8% por cada 10% de boarding adicional.','fact'); }
      if (S.cxCan>=1 && !R.factCx) { R.factCx=true; addL('Cirurgias canceladas por falta de leito custam em média R$15.000 por caso.','fact'); }

      // Corridor overflow — LWBS dispara mais cedo em R1 (corredor > 2)
      if (P.filter(p=>p.sector==='de').length>=CAP.de-pcrB&&P.filter(p=>p.sector==='triagem').length>2) {
        const tc=P.find(p=>p.sector==='triagem');
        if (tc&&Math.random()<.4) { tc.sector='corredor'; addL(`${tc.name} → CORREDOR — sem macas disponíveis!`,'warning'); }
      }
      const corredorLimit = isR2local ? 3 : 2;
      if (P.filter(p=>p.sector==='corredor').length>corredorLimit) {
        const lw=P.find(p=>p.sector==='corredor'&&p.dest==='alta_de'&&!p.dead);
        if (lw&&Math.random()<.3) { lw.sector='alta'; S.lwbs++; addL(`${lw.name} SAIU SEM ATENDIMENTO! (LWBS)`,'danger'); }
      }

      // Social delay countdown
      P.forEach(p => { if (p.social&&p.socialDelay>0) { p.socialDelay--; if (p.socialDelay<=0) { p.social=false; addL(`${p.name} (social) liberado.`,'success'); }}});

      // ENF rounds — R2 Bed Huddle antecipa para 8h (alta precoce)
      // R1: round médico às 11h (atraso!), preparo 120-180min (burocracia)
      const enfRoundH=isR2local?8:11;
      if (ch>=enfRoundH&&!R.e1) {
        R.e1=true;
        const c=P.filter(p=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(6,8),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:rnd(120,180); }
        if (isR2local) addL(`BED HUDDLE ${enfRoundH}h: ${n} altas prescritas. Discharge Lounge: leitos liberam IMEDIATO.`,'success');
        else addL(`ROUND MÉDICO ${enfRoundH}h: ${n} altas prescritas. Preparo estimado: 2-3h. TARDE DEMAIS!`,'warning');
      }
      if (ch>=14&&!R.e2) {
        R.e2=true;
        const c=P.filter(p=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(3,4),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:rnd(90,120); }
        addL(`ROUND 14h: ${n} altas.${isR2local?' Liberação imediata.':' Preparo ~1.5-2h.'}`,'success');
      }
      if (ch>=17&&!R.e3) {
        R.e3=true;
        const c=P.filter(p=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(1,2),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:60; }
        if (n>0) addL(`ROUND 17h: ${n} alta(s) esporádica(s).`,'info');
      }

      // UTI step-downs
      if (ch>=11&&!R.u1) { R.u1=true; const c=P.filter(p=>p.sector==='uti'&&!p.dischReady); for (let i=0;i<Math.min(2,c.length);i++) { c[i].dischReady=true; c[i].dest='enf'; c[i].prep=isR2local?0:60; addL(`Alta UTI: ${c[i].name} step-down → ENF.`,'info'); }}
      if (ch>=15&&!R.u2) { R.u2=true; const c=P.find(p=>p.sector==='uti'&&!p.dischReady); if (c) { c.dischReady=true; c.dest='enf'; c.prep=isR2local?0:60; addL(`Alta UTI: ${c.name} step-down → ENF.`,'info'); }}

      P.forEach(p => { if (p.prep>0) p.prep--; });

      // ── Surgery processing ────────────────────────────────
      setSx(prevSx => {
        const sx2=prevSx.map(s=>({...s}));
        sx2.forEach(s => {
          if (s.st!=='scheduled') return;
          const enM=s.stH*60+s.dur*60;
          if (cm>=enM) {
            const rC=P.filter(p=>p.sector==='rpa').length;
            if (rC>=CAP.rpa) {
              s.st='cancelled'; S.cxCan++;
              const disch=P.find(p=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.blocked&&!p.social);
              if (disch) { disch.dischReady=false; disch.blocked=true; addL(`${s.label} CANCELADA! ${disch.name} perde alta. EFEITO CASCATA.`,'danger'); setCascade(`${s.label} cancelada → ${disch.name} perde alta → leito não gira`); setTimeout(()=>setCascade(null),8000); }
              else { addL(`${s.label} CANCELADA — RPA lotada!`,'danger'); setCascade('Cirurgia cancelada → menos giro → mais boarding'); setTimeout(()=>setCascade(null),6000); }
              SimsMusic.sfx('cascade');
            } else {
              s.st='done';
              const np=mkPt('rpa',s.dest,s.dest==='uti'?'red':'orange',true);
              np.postOp=true; np.name=`PO-${s.label.replace('Cx ','')}`;
              P.push(np); addL(`${np.name} → RPA, precisa de ${s.dest==='uti'?'UTI':'ENF'}.`,'info');
            }
          }
        });
        const rC=P.filter(p=>p.sector==='rpa').length;
        const nxt=sx2.find(s=>s.st==='scheduled'&&cm<s.stH*60+s.dur*60);
        if (nxt&&rC>=2) { const mL=Math.round(nxt.stH*60+nxt.dur*60-cm); if (mL>0&&mL<=45) setRpaW(`RPA ${rC}/${CAP.rpa} — ${nxt.label} termina em ${mL} min`); else setRpaW(null); } else setRpaW(null);
        return sx2;
      });

      setSt(prev => ({...prev, ...S})); return P;
    });
  }, [addL, nirCd]);

  useEffect(() => { let iv; if (run) iv=setInterval(tick,TICK); return ()=>clearInterval(iv); }, [run, tick]);

  // ── Move logic ────────────────────────────────────────────
  const getT = p => {
    if (!p) return [];
    const t=[];
    if (p.sector==='triagem'||p.sector==='corredor') t.push('de');
    if (p.sector==='de'&&p.ready) {
      if (p.dest==='alta_de') t.push('alta');
      if (p.dest==='enf')     t.push('enf');
      if (p.dest==='uti')     { t.push('uti'); t.push('enf'); }
    }
    if (p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social) t.push('alta');
    if (p.sector==='uti'&&p.dischReady&&p.prep<=0) { if (p.dest==='enf') t.push('enf'); else t.push('alta'); }
    if (p.sector==='rpa'&&p.ready) { if (p.dest==='enf') t.push('enf'); if (p.dest==='uti') { t.push('uti'); t.push('enf'); }}
    return t;
  };
  const tgts = getT(sel);

  const [offServiceConfirm, setOffServiceConfirm] = useState(null); // {sel, sid} quando pendente

  const doMove = sid => {
    if (!run||!sel) return;
    if (!tgts.includes(sid)) { setFl(sid); setTimeout(()=>setFl(null),500); return; }
    const cap2=sid==='enf'?CAP.enf:sid==='uti'?CAP.uti:sid==='de'?CAP.de-(evts.pcr?1:0):999;
    const cnt=pts.filter(p=>p.sector===sid).length;
    if (sid!=='alta'&&cnt>=cap2) { setFl(sid); addL(`${sid.toUpperCase()} LOTADO!`,'danger'); setTimeout(()=>setFl(null),600); return; }
    const isOff=sel.dest==='uti'&&sid==='enf'&&sel.sector!=='uti';
    // Confirmação off-service: popup antes de mover
    if (isOff) { setOffServiceConfirm({sel:{...sel}, sid}); return; }
    const isProd = sid==='alta'||(sid==='enf'&&!isOff)||(sid==='uti'&&sel.dest==='uti');
    setPts(prev=>prev.map(p=>{
      if (p.id!==sel.id) return p;
      if (sid==='alta') {
        const isHospDisc = p.sector==='enf'; // Alta hospitalar = só ENF
        setSt(s=>({...s, disc:s.disc+1, altaHosp:(s.altaHosp||0)+(isHospDisc?1:0), libDE:(s.libDE||0)+(p.sector==='de'?1:0) }));
        addL(`${p.name} — ${isHospDisc?'alta hospitalar':'liberação DE'}.`,'success');
        SimsMusic.sfx('disc');
      }
      else if (isOff)   { setSt(s=>({...s,offS:s.offS+1})); addL(`FORA DO PERFIL: ${p.name} UTI→ENF. Risco elevado!`,'warning'); }
      else addL(`${p.name} → ${sid.toUpperCase()}`,'info');
      // Evolução clínica: cor muda ao mudar de setor
      let newSev = p.sev;
      if (p.sector==='uti'&&sid==='enf'&&p.dischReady) newSev = 'green'; // step-down UTI→ENF = melhorou
      return {...p,sector:sid,sev:newSev,ready:false,dischReady:false,bStart:null,bMin:0,offSvc:isOff,obsProlong:false};
    }));
    setMoves(m => ({ total:m.total+1, produtivo:m.produtivo+(isProd?1:0), reativo:m.reativo+(isProd?0:1) }));
    setSel(null);
  };

  const confirmOffService = () => {
    if (!offServiceConfirm) return;
    const { sel: s, sid } = offServiceConfirm;
    setPts(prev=>prev.map(p=>{
      if (p.id!==s.id) return p;
      setSt(st2=>({...st2,offS:st2.offS+1}));
      addL(`FORA DO PERFIL: ${p.name} UTI→ENF. Risco elevado!`,'warning');
      return {...p,sector:sid,ready:false,dischReady:false,bStart:null,bMin:0,offSvc:true};
    }));
    setMoves(m => ({ total:m.total+1, produtivo:m.produtivo, reativo:m.reativo+1 }));
    setOffServiceConfirm(null); setSel(null);
  };

  const doNIR = () => {
    if (!isR2||nirUses>=3||nirCd>0||!sel) return;
    if (sel.sector!=='de'||!sel.ready) return;
    setPts(prev=>prev.filter(pt=>pt.id!==sel.id));
    setNirUses(n=>n+1); setNirCd(60); setSel(null);
    addL(`NIR: ${sel.name} transferido para outra unidade. (${nirUses+1}/3 usos)`,'success');
    SimsMusic.sfx('disc');
  };

  const doFullCap = () => {
    if (!isR2||!sel) return;
    if (!fcApproved) { addL('FULL CAPACITY negado — aguardando autorização da Diretoria.','warning'); return; }
    if (fcUses >= 2) { addL('FULL CAPACITY esgotado — limite de 2 pacientes atingido.','warning'); return; }
    if (sel.sector!=='de'||!sel.ready||sel.sev!=='green'||sel.dest==='alta_de') { addL('FULL CAPACITY apenas para pacientes VERDES com indicação de internação no DE.','warning'); return; }
    setPts(prev=>prev.map(pt=>pt.id!==sel.id?pt:{...pt,sector:'corredor',bStart:null,bMin:0}));
    setFcUses(n=>n+1); setSel(null);
    addL(`FULL CAPACITY: ${sel.name} ao corredor da enfermaria. Maca liberada. (${fcUses+1}/2 usos)`,'success');
  };

  // Polling para autorização Full Capacity do facilitador
  useEffect(() => {
    if (!isR2 || !roomId) return;
    const iv = setInterval(async () => {
      const { data } = await sb.from('rooms').select('full_cap_approved').eq('id', roomId).single();
      if (data?.full_cap_approved && !fcApproved) {
        setFcApproved(true);
        addL('DIRETORIA AUTORIZOU Full Capacity! 2 pacientes verdes podem ir ao corredor.','success');
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [isR2, roomId, fcApproved]);

  const clk = p => run && setSel(s=>s?.id===p.id?null:p);

  // Color helpers
  const logC   = { danger:'#f87171', warning:'#fde047', success:'#86efac', info:'#94a3b8', fact:'#c4b5fd' };
  const logBg  = { danger:'rgba(239,68,68,.06)', warning:'rgba(234,179,8,.05)', success:'rgba(34,197,94,.05)', info:'rgba(255,255,255,.02)', fact:'rgba(167,139,250,.08)' };
  const logBrd = { danger:'#ef4444', warning:'#eab308', success:'#22c55e', info:'#1e293b', fact:'#a78bfa' };
  const secN   = { de:'DE', enf:'ENF', uti:'UTI', rpa:'RPA', alta:'ALTA' };

  // Phase routing
  if (ph==='role')       return <RoleSelector onJogador={()=>setPh('lobby')} onFacilitador={()=>setPh('facilLogin')}/>;
  if (ph==='facilLogin') return <FacilitadorLogin onAuth={()=>{ window.location.href='instrutor.html'; }} onBack={()=>setPh('role')}/>;
  if (ph==='lobby')      return <LobbyScreen onJoin={joinRoom} onSolo={()=>setPh('menu')} onBack={()=>setPh('role')}/>;
  if (ph==='waiting')    return <WaitingScreen tName={tName} rCode={rCode}/>;
  if (ph==='menu')       return <MenuScreen onStart={startR}/>;

  // CC Block modal (aparece antes do jogo começar)
  if (showCcModal !== null) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:480, width:'100%' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.14em', marginBottom:6, textTransform:'uppercase' }}>
          {showCcModal===2 ? 'Plantão Lean (R2)' : 'Plantão Travado (R1)'}
        </div>
        <div style={{ fontSize:28, fontWeight:900, color:showCcModal===2?'#00d4ff':'#FF3B3B', marginBottom:20 }}>CENTRO CIRÚRGICO</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b' }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0', marginBottom:8 }}>
            O hospital tem 4 salas cirúrgicas.
          </div>
          <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.7, marginBottom:20 }}>
            Emergências cirúrgicas podem chegar a qualquer momento.<br/>
            Sem sala disponível = <strong style={{ color:'#ef4444' }}>óbito evitável</strong>.
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#e2e8f0', marginBottom:20 }}>
            Bloquear 1 sala para emergências?
          </div>
          <div style={{ display:'flex', gap:12, marginBottom:12 }}>
            <button onClick={()=>doStartR(showCcModal, true)} className="btn"
              style={{ flex:1, background:'linear-gradient(135deg,#22c55e,#16a34a)', padding:'14px 0', fontSize:14, fontWeight:800, borderRadius:10 }}>
              Sim, reservar sala 4
              <div style={{ fontSize:11, fontWeight:400, opacity:.8, marginTop:2 }}>3 eletivas + 1 emergência</div>
            </button>
            <button onClick={()=>doStartR(showCcModal, false)} className="btn"
              style={{ flex:1, background:'linear-gradient(135deg,#ef4444,#dc2626)', padding:'14px 0', fontSize:14, fontWeight:800, borderRadius:10 }}>
              Não, usar todas
              <div style={{ fontSize:11, fontWeight:400, opacity:.8, marginTop:2 }}>4 eletivas (risco!)</div>
            </button>
          </div>
          {showCcModal===2 && (
            <div style={{ fontSize:11, color:'#00d4ff', padding:'8px 12px', background:'rgba(0,212,255,.06)', borderRadius:8, border:'1px solid rgba(0,212,255,.15)' }}>
              Bed Huddle recomenda: reservar 1 sala para emergências.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Game UI ───────────────────────────────────────────────
  const allEnf = byS('enf');
  const allUti = byS('uti');
  const hospDanger = hospPct >= 85;
  const hospColapso = hospPct >= 95;

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', background:'#060a13' }}>

      {/* Death flash overlay */}
      {deathFlash && <div style={{ position:'fixed', inset:0, background:'rgba(239,68,68,.3)', zIndex:300, pointerEvents:'none', animation:'fadeIn .1s' }}/>}

      {/* Off-service confirmation modal */}
      {offServiceConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:'#0f172a', border:'1px solid #f97316', borderRadius:14, padding:24, maxWidth:360, textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#f97316', marginBottom:8 }}>FORA DO PERFIL</div>
            <div style={{ fontSize:13, color:'#e2e8f0', marginBottom:6 }}>
              <strong>{offServiceConfirm.sel.name}</strong> precisa de UTI.
            </div>
            <div style={{ fontSize:12, color:'#f87171', marginBottom:16 }}>
              Enviar para ENF fora do perfil? Risco de deterioração. (-25 pts)
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={confirmOffService} className="btn"
                style={{ flex:1, background:'#f97316', padding:'10px 0', fontSize:13 }}>
                Sim, enviar
              </button>
              <button onClick={()=>{setOffServiceConfirm(null);}} className="btn"
                style={{ flex:1, background:'#374151', padding:'10px 0', fontSize:13 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background:'#0a0f1a', borderBottom:`1px solid ${hospColapso?'#ef4444':'#1e293b'}`, padding:'5px 14px', flexShrink:0,
        boxShadow: hospColapso ? '0 2px 20px rgba(239,68,68,.3)' : 'none', transition:'box-shadow .5s' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:14, fontWeight:900, color:isR2?'#00d4ff':'#FF3B3B' }}>
              {isR2?'PLANTÃO LEAN':'PLANTÃO TRAVADO'}
            </span>
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4,
              background:isR2?'rgba(0,212,255,.15)':'rgba(255,59,59,.15)', color:isR2?'#00d4ff':'#FF3B3B' }}>R{rnd2}</span>
            <div style={{ fontFamily:'monospace', fontSize:28, fontWeight:800, color:'#00d4ff' }}>{fmt(sm)}</div>
          </div>
          <div style={{ flex:1, maxWidth:200, margin:'0 10px' }}>
            <div style={{ height:5, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
              <div style={{ width:`${prog}%`, height:'100%', borderRadius:3, transition:'width 1s linear',
                background:prog>75?'#ef4444':prog>40?'#eab308':'#00d4ff' }}/>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {hospDanger && !isR2 && (
              <div style={{ fontSize:11, fontWeight:800, color:'#ef4444', animation:'pulse 1s infinite',
                padding:'2px 8px', background:'rgba(239,68,68,.12)', borderRadius:4, border:'1px solid #ef444433' }}>
                {hospColapso ? `INTERNAÇÃO ${hospPct}% — COLAPSADO` : `INTERNAÇÃO ${hospPct}% — CRÍTICO`}
              </div>
            )}
            <div style={{ background:'rgba(255,255,255,.03)', padding:'4px 12px', borderRadius:6, display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color:'#64748b' }}>SCORE</span>
              <span style={{ fontSize:22, fontWeight:800, fontFamily:'monospace',
                color:score>700?'#22c55e':score>400?'#eab308':'#ef4444',
                animation: scorePulse==='up'?'scorePulseUp .4s':scorePulse==='down'?'scorePulseDown .4s':'none',
                display:'inline-block' }}>{score}</span>
            </div>
            {!roomId && <button onClick={()=>setRun(r=>!r)} className="btn"
              style={{ background:run?'#374151':'#16a34a' }}>{run?'PAUSAR':'RETOMAR'}</button>}
            <button onClick={()=>{clearSession();setRun(false);setPh('role');}} className="btn"
              style={{ background:'#1e293b', padding:'4px 10px', fontSize:11, color:'#64748b' }}>SAIR</button>
          </div>
        </div>
      </div>

      {/* ── R2 tools bar ── */}
      {isR2 && (
        <div style={{ background:'rgba(0,212,255,.04)', borderBottom:'1px solid rgba(0,212,255,.12)', padding:'3px 14px', display:'flex', gap:6, alignItems:'center', justifyContent:'center', flexWrap:'wrap', flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#00d4ff', letterSpacing:'.06em' }}>FERRAMENTAS LEAN:</span>
          {['Alta precoce','Fast Track','Discharge Lounge','Surgical Smoothing','Fluxista','Alta Segura'].map(t =>
            <span key={t} className="metric" style={{ color:'#22c55e' }}>{t}</span>
          )}
          <span className="metric" style={{ color:nirUses>=3?'#64748b':'#00d4ff' }}>NIR ({3-nirUses} restantes{nirCd>0?`, cd ${Math.ceil(nirCd/60)}min`:''})</span>
          <span className="metric" style={{ color:'#00d4ff' }}>Full Capacity</span>
        </div>
      )}

      {/* ── Metrics bar ── */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #1e293b', padding:'4px 14px', overflowX:'auto', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, justifyContent:'center', alignItems:'center', minWidth:600 }}>
          {/* Bloco 1: Fluxo */}
          <div style={{ display:'flex', gap:6, padding:'3px 10px', background:'rgba(0,212,255,.04)', borderRadius:6, border:'1px solid rgba(0,212,255,.1)' }}>
            {[
              { l:'Hospital',  v:`${hospPct}%`, c:hospPct>=95?'#ef4444':hospPct>=85?'#eab308':hospPct>=75?'#f97316':'#22c55e' },
              { l:'Boarding',  v:boarding.length, c:boarding.length>3?'#ef4444':boarding.length>0?'#eab308':'#64748b' },
              { l:'Corredor',  v:byS('corredor').length, c:byS('corredor').length>0?'#ef4444':'#64748b' },
            ].map(({l,v,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:'#64748b', fontSize:11 }}>{l}:</span>
                <span style={{ color:c, fontWeight:700, fontFamily:'monospace', fontSize:13 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ color:'#1e293b', fontSize:18 }}>·</div>
          {/* Bloco 2: Desfechos */}
          <div style={{ display:'flex', gap:6, padding:'3px 10px', background:'rgba(239,68,68,.04)', borderRadius:6, border:'1px solid rgba(239,68,68,.08)' }}>
            {[
              { l:'Deterioraram', v:st.dets, c:st.dets>0?'#f97316':'#64748b' },
              { l:'Óbitos',  v:st.deaths, c:st.deaths>0?'#ef4444':'#64748b' },
              { l:'LWBS',    v:st.lwbs,   c:st.lwbs>0?'#ef4444':'#64748b' },
            ].map(({l,v,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:'#64748b', fontSize:11 }}>{l}:</span>
                <span style={{ color:c, fontWeight:700, fontFamily:'monospace', fontSize:13 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ color:'#1e293b', fontSize:18 }}>·</div>
          {/* Bloco 3: Ações */}
          <div style={{ display:'flex', gap:6, padding:'3px 10px', background:'rgba(34,197,94,.04)', borderRadius:6, border:'1px solid rgba(34,197,94,.08)' }}>
            {[
              { l:'Cx cancel.', v:st.cxCan, c:st.cxCan>0?'#ef4444':'#64748b' },
              { l:'Fora perfil', v:st.offS, c:st.offS>0?'#f97316':'#64748b' },
              { l:'Altas',   v:st.disc,  c:'#22c55e' },
            ].map(({l,v,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:'#64748b', fontSize:11 }}>{l}:</span>
                <span style={{ color:c, fontWeight:700, fontFamily:'monospace', fontSize:13 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {cascade && <div style={{ background:'linear-gradient(90deg,#450a0a,#1a0505)', borderBottom:'2px solid #ef4444', padding:'5px 14px', textAlign:'center', animation:'cascPulse 2s infinite', fontSize:12, fontWeight:700, color:'#f87171', flexShrink:0 }}>EFEITO CASCATA: {cascade}</div>}
      {!cascade&&rpaW && <div style={{ background:'linear-gradient(90deg,#422006,#1a1005)', borderBottom:'2px solid #ca8a04', padding:'4px 14px', textAlign:'center', fontSize:11, fontWeight:600, color:'#fde047', flexShrink:0 }}>{rpaW}</div>}
      {evts.pcr  && <div style={{ background:'#450a0a', borderBottom:'1px solid #ef4444', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#f87171', animation:'pulse 2s infinite', flexShrink:0 }}>PARADA CARDÍACA — 1 maca bloqueada ({fmt(evts.pcrEnd)})</div>}
      {evts.tomo && <div style={{ background:'#1a1505', borderBottom:'1px solid #ca8a04', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#fde047', flexShrink:0 }}>{isR2?'TOMÓGRAFO (manutenção)':'TOMÓGRAFO QUEBRADO'} — Retorno às {fmt(evts.tomoEnd)}</div>}
      {evts.lab  && <div style={{ background:'#0a1a2a', borderBottom:'1px solid #0891b2', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#67e8f9', flexShrink:0 }}>ATRASO NO LABORATÓRIO — Resultados pendentes ({fmt(evts.labEnd)})</div>}

      {/* ── Main 4-column layout ── */}
      <div style={{ flex:1, display:'flex', gap:6, padding:'6px 8px', overflow:'hidden', minHeight:0 }}>

        {/* Col 1: Porta + PS + Corredor */}
        <div style={{ width:330, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>

          {/* Porta */}
          <div className="sector" style={{ background:'#0f172a', border:'1px solid #1e293b', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.08em' }}>TRIAGEM</span>
              <span style={{ fontSize:11, fontFamily:'monospace', color:byS('triagem').length>0?'#eab308':'#475569' }}>{byS('triagem').length} aguardando</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3, minHeight:16 }}>
              {byS('triagem').map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
              {byS('triagem').length===0&&<span style={{ fontSize:11, color:'#333', fontStyle:'italic' }}>Vazia</span>}
            </div>
          </div>

          {/* PS */}
          <div className={`sector${tgts.includes('de')?' valid-target':''}${fl==='de'?' flash':''}`}
            onClick={()=>doMove('de')}
            style={{ flex:1, background: hospColapso?'#1a0505':'#0f172a',
              border:`1px solid ${hospColapso?'#ef4444':hospDanger&&!isR2?'#eab30888':'#1e293b'}`,
              cursor:tgts.includes('de')?'pointer':'default', display:'flex', flexDirection:'column', minHeight:0,
              boxShadow: hospColapso&&!isR2?'inset 0 0 30px rgba(239,68,68,.15)':'none', transition:'all .5s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>DEPARTAMENTO DE EMERGÊNCIA</span>
                {hospDanger&&!isR2&&<span style={{ fontSize:11, fontWeight:800, color:'#ef4444', animation:'pulse 1s infinite' }}>OCUPAÇÃO >85%</span>}
              </div>
              <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700,
                color:dePct>=100?'#ef4444':dePct>=85?'#eab308':'#64748b' }}>
                {deOcc}/{CAP.de} ({dePct}%)
              </span>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5, minHeight:0, overflow:'hidden' }}>
              <div className="subarea" style={{ background:'rgba(100,116,139,.06)', border:'1px dashed #33415566' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:3 }}>Em Avaliação ({deEval.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deEval.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:deBoard.length>5?'rgba(239,68,68,.06)':'rgba(234,179,8,.04)', border:`1px solid ${deBoard.length>5?'#ef444433':'#eab30822'}` }}>
                <div style={{ fontSize:11, color:deBoard.length>5?'#ef4444':'#eab308', marginBottom:3, fontWeight:deBoard.length>5?700:400 }}>
                  Boarding ({deBoard.length}){deBoard.length>5?' CRÍTICO!':''}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deBoard.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:'rgba(34,197,94,.04)', border:'1px solid #22c55e22' }}>
                <div style={{ fontSize:11, color:'#22c55e', marginBottom:3 }}>Alta Pronta ({deAlta.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deAlta.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              {deObs.length>0&&<div className="subarea" style={{ background:'rgba(168,85,247,.04)', border:'1px solid #a855f722' }}>
                <div style={{ fontSize:11, color:'#a855f7', marginBottom:3 }}>Obs Prolongada ({deObs.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deObs.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>}
            </div>
          </div>

          {/* Corredor */}
          <div className="sector" style={{
            background:byS('corredor').length>0?'#1a0505':'#0f172a',
            border:`1px solid ${byS('corredor').length>2?'#ef4444':byS('corredor').length>0?'#eab308':'#1e293b'}`,
            flexShrink:0,
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:byS('corredor').length>0?'#ef4444':'#64748b', marginBottom:3 }}>
              CORREDOR{byS('corredor').length>0?` (${byS('corredor').length}${byS('corredor').length>2?' — LWBS ativo!':''})`:''}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3, minHeight:16 }}>
              {byS('corredor').map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
              {byS('corredor').length===0&&<span style={{ fontSize:11, color:'#333', fontStyle:'italic' }}>Vazio</span>}
            </div>
          </div>
        </div>

        {/* Col 2: ENF + UTI bed grids */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>

          {/* Enfermaria */}
          <div className={`sector${tgts.includes('enf')?' valid-target':''}${fl==='enf'?' flash':''}`}
            onClick={()=>doMove('enf')}
            style={{ flex:2, background:fl==='enf'?'#1a0505':'#0f172a', border:`1px solid ${fl==='enf'?'#ef4444':'#1e293b'}`, cursor:tgts.includes('enf')?'pointer':'default', display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, flexShrink:0 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', letterSpacing:'.08em' }}>ENFERMARIA</span>
              <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700,
                color:pctOf(enfOcc,CAP.enf)>=100?'#ef4444':pctOf(enfOcc,CAP.enf)>=85?'#eab308':pctOf(enfOcc,CAP.enf)>=70?'#f97316':'#22c55e' }}>
                {enfOcc}/{CAP.enf} ({pctOf(enfOcc,CAP.enf)}%)
              </span>
            </div>
            <div style={{ height:8, background:'#1e293b', borderRadius:4, overflow:'hidden', marginBottom:6, flexShrink:0 }}>
              <div style={{ width:`${Math.min(pctOf(enfOcc,CAP.enf),100)}%`, height:'100%', borderRadius:4, transition:'width .5s',
                background:pctOf(enfOcc,CAP.enf)>=100?'#ef4444':pctOf(enfOcc,CAP.enf)>=85?'#eab308':'#22c55e' }}/>
            </div>
            {/* Prontos para alta — destaque no topo */}
            {enfReady.length>0&&(
              <div style={{ background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.2)', borderRadius:6, padding:'4px 6px', marginBottom:4, flexShrink:0 }}>
                <div style={{ fontSize:11, color:'#22c55e', fontWeight:700, marginBottom:3 }}>
                  Prontos para Alta ({enfReady.length}) — selecione e mova para ALTA
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                  {enfReady.map(p=><MiniChip key={p.id} p={p} sel={sel} onClick={clk}/>)}
                </div>
              </div>
            )}
            {/* Internados */}
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:3, alignContent:'flex-start', overflowY:'auto', minHeight:0 }}>
              {allEnf.filter(p=>!enfReady.includes(p)).map(p=><MiniChip key={p.id} p={p} sel={sel} onClick={clk}/>)}
            </div>
          </div>

          {/* UTI */}
          <div className={`sector${tgts.includes('uti')?' valid-target':''}${fl==='uti'?' flash':''}`}
            onClick={()=>doMove('uti')}
            style={{ flex:1, background:fl==='uti'?'#1a0505':'#0f172a', border:`1px solid ${fl==='uti'?'#ef4444':'#1e293b'}`, cursor:tgts.includes('uti')?'pointer':'default', display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, flexShrink:0 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', letterSpacing:'.08em' }}>UTI</span>
              <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700,
                color:pctOf(utiOcc,CAP.uti)>=100?'#ef4444':pctOf(utiOcc,CAP.uti)>=85?'#eab308':'#22c55e' }}>
                {utiOcc}/{CAP.uti} ({pctOf(utiOcc,CAP.uti)}%)
              </span>
            </div>
            <div style={{ height:8, background:'#1e293b', borderRadius:4, overflow:'hidden', marginBottom:6, flexShrink:0 }}>
              <div style={{ width:`${Math.min(pctOf(utiOcc,CAP.uti),100)}%`, height:'100%', borderRadius:4, transition:'width .5s',
                background:pctOf(utiOcc,CAP.uti)>=100?'#ef4444':pctOf(utiOcc,CAP.uti)>=85?'#eab308':'#22c55e' }}/>
            </div>
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:4, alignContent:'flex-start', overflowY:'auto', minHeight:0, paddingTop:4 }}>
              {allUti.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
            </div>
            {utiReady.length>0&&<div style={{ fontSize:11, color:'#22c55e', marginTop:4, flexShrink:0, fontWeight:600 }}>
              {utiReady.length} pronto{utiReady.length>1?'s':''} step-down — mova para ENF
            </div>}
          </div>
        </div>

        {/* Col 3: RPA + CC */}
        <div style={{ width:188, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>
          <div className={`sector${tgts.includes('rpa')?' valid-target':''}${fl==='rpa'?' flash':''}`}
            onClick={()=>doMove('rpa')}
            style={{ background:rpaOcc>=CAP.rpa?'#1a0505':'#0f172a', border:`1px solid ${rpaOcc>=CAP.rpa?'#ef4444':'#1e293b'}`, cursor:tgts.includes('rpa')?'pointer':'default', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>RPA</span>
              <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700,
                color:rpaOcc>=CAP.rpa?'#ef4444':rpaOcc>=2?'#eab308':'#64748b' }}>{rpaOcc}/{CAP.rpa}</span>
            </div>
            <div style={{ display:'flex', gap:3 }}>
              {Array.from({length:CAP.rpa}).map((_,i)=>{
                const p=byS('rpa')[i];
                return p?<Chip key={p.id} p={p} sel={sel} onClick={clk}/>:<div key={`e${i}`} className="slot"/>;
              })}
            </div>
          </div>
          <SxPan surgeries={sx} sm={sm}/>
        </div>

        {/* Col 4: ALTA + LOG */}
        <div style={{ width:205, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>
          <div className={`sector${tgts.includes('alta')?' valid-target':''}`}
            onClick={()=>doMove('alta')}
            style={{ background:tgts.includes('alta')?'#0a1a0a':'#0f172a', border:'1px solid #1e293b', cursor:tgts.includes('alta')?'pointer':'default', textAlign:'center', flexShrink:0, padding:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#22c55e', marginBottom:2 }}>ALTA</div>
            <div style={{ fontSize:40, fontWeight:900, color:'#22c55e', fontFamily:'monospace', lineHeight:1 }}>{st.disc}</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>pacientes</div>
          </div>
          <div style={{ flex:1, background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:10, padding:8, overflowY:'auto', minHeight:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, letterSpacing:'.1em' }}>EVENTOS</div>
            {log.map((l,i)=>(
              <div key={i} className="log-entry" style={{ background:logBg[l.type], borderLeft:`3px solid ${logBrd[l.type]}`, color:logC[l.type], animation:i===0?'fadeIn .3s':'none' }}>
                <span style={{ color:'#475569', fontFamily:'monospace', fontSize:11, marginRight:3 }}>{fmt(l.t)}</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selected patient panel ── */}
      {sel&&run&&(
        <div style={{ position:'fixed', bottom:12, left:'50%', transform:'translateX(-50%)', background:'#1e293b', border:'2px solid #00d4ff', borderRadius:12, padding:'8px 16px', zIndex:50, boxShadow:'0 8px 40px rgba(0,0,0,.6)', display:'flex', alignItems:'center', gap:12, animation:'fadeIn .2s', maxWidth:'92vw' }}>
          <PSvg color={SEV[sel.sev].c} sz={22} dead={sel.dead} det={sel.det}/>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:12 }}>{sel.name}</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>
              {sel.sector==='de'&&!sel.ready&&!sel.obsProlong?`Avaliando... ${Math.max(0,Math.round(sel.deNeed-sel.deSpent))}min${sel.labDelay?' (lab)':''}`
                :sel.obsProlong?'Obs prolongada'
                :sel.sector==='de'&&sel.ready&&sel.dest==='alta_de'?'Pronto para alta DE'
                :sel.sector==='de'&&sel.ready&&sel.dest==='enf'?'Precisa de ENF'
                :sel.sector==='de'&&sel.ready&&sel.dest==='uti'?'Precisa de UTI (ou off-svc→ENF)'
                :sel.sector==='enf'&&sel.dischReady&&sel.prep>0?`Preparo: ${sel.prep}min`
                :sel.sector==='enf'&&sel.dischReady&&sel.prep<=0&&!sel.social?'Pronto ALTA!'
                :sel.sector==='enf'&&sel.social?`Atraso familiar: ${sel.socialDelay}min`
                :sel.sector==='enf'&&sel.blocked?'Bloqueado (Cx cancel.)'
                :sel.sector==='uti'&&sel.dischReady&&sel.prep<=0?'Step-down → ENF'
                :sel.sector==='rpa'?`Pós-op → ${sel.dest.toUpperCase()}`
                :sel.sector==='triagem'?'Aguardando DE'
                :sel.sector==='corredor'?'No corredor':''}
            </div>
            {sel.bMin>0&&<div style={{ fontSize:11, fontWeight:700, color:sel.bMin>=BOARD_DEAD_MIN?'#ef4444':sel.bMin>=BOARD_DET_MIN?'#f97316':'#eab308' }}>
              Boarding: {Math.floor(sel.bMin/60)}h{String(sel.bMin%60).padStart(2,'0')}
              {!sel.det&&sel.bMin<BOARD_DET_MIN&&` (deteriora em ${BOARD_DET_MIN-sel.bMin}min)`}
            </div>}
          </div>
          <div style={{ display:'flex', gap:4, marginLeft:6, flexShrink:0, flexWrap:'wrap' }}>
            {tgts.map(t=>(
              <button key={t} onClick={()=>doMove(t)} className="btn"
                style={{ background:t==='alta'?'#16a34a':t==='enf'?'#0f766e':t==='uti'?'#dc2626':t==='de'?'#1e6091':'#475569', fontSize:10 }}>
                → {secN[t]||t.toUpperCase()}{sel.dest==='uti'&&t==='enf'&&sel.sector!=='uti'?' [OFF]':''}
              </button>
            ))}
            {isR2&&sel.sector==='de'&&sel.ready&&sel.dest!=='alta_de'&&nirUses<3&&nirCd<=0&&(
              <button onClick={doNIR} className="btn" style={{ background:'#7c3aed', fontSize:10 }}>NIR</button>
            )}
            {isR2&&sel.sector==='de'&&sel.ready&&sel.sev==='green'&&sel.dest!=='alta_de'&&fcApproved&&fcUses<2&&(
              <button onClick={doFullCap} className="btn" style={{ background:'#0369a1', fontSize:10 }}>Full Cap ({2-fcUses})</button>
            )}
            {tgts.length===0&&!(isR2&&sel.sector==='de'&&sel.ready)&&(
              <span style={{ color:'#ef4444', fontSize:11, fontStyle:'italic' }}>
                {sel.ready||(sel.dischReady&&sel.prep<=0)?'Sem vaga!':sel.blocked?'Bloqueado':sel.social?'Atraso familiar':'Aguardando...'}
              </span>
            )}
          </div>
          <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:16, marginLeft:4 }}>&#x2715;</button>
        </div>
      )}

      {/* ── Color legend (bottom-right) ── */}
      {!sel && run && (
        <div style={{ position:'fixed', bottom:10, right:10, background:'rgba(15,23,42,.92)', border:'1px solid #1e293b', borderRadius:10, padding:'8px 12px', zIndex:40, backdropFilter:'blur(8px)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', letterSpacing:'.1em', marginBottom:5 }}>LEGENDA</div>
          {[
            { c:'#22c55e', l:'Verde — baixa complexidade' },
            { c:'#eab308', l:'Amarelo — média complexidade' },
            { c:'#f97316', l:'Laranja — alta complexidade' },
            { c:'#ef4444', l:'Vermelho — crítico / UTI' },
          ].map(({ c, l }) => (
            <div key={c} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
              <PSvg color={c} sz={10}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{l}</span>
            </div>
          ))}
          <div style={{ borderTop:'1px solid #1e293b', marginTop:4, paddingTop:4 }}>
            {[
              { icon:'OK', c:'#22c55e', l:'Pronto para mover' },
              { icon:'!',  c:'#f97316', l:'Deteriorou' },
              { icon:'X',  c:'#ef4444', l:'Óbito' },
              { icon:'BL', c:'#eab308', l:'Bloqueado / Social' },
              { icon:'OFF',c:'#f97316', l:'Fora da especialidade' },
              { icon:'LAB',c:'#06b6d4', l:'Aguardando exames' },
            ].map(({ icon, c, l }) => (
              <div key={icon} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ fontSize:11, fontWeight:800, color:c, width:18, textAlign:'center' }}>{icon}</span>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Game over modal ── */}
      {ph==='over'&&<GameOverModal isR2={isR2} score={score} st={st} pts={pts} moves={moves} r1Results={r1Results} onRestart={startR} onMenu={()=>{clearSession();setPh('menu');}}/>}
    </div>
  );
}

ReactDOM.render(<Game/>, document.getElementById('root'));
