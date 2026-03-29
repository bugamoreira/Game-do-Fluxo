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

// ── Regular chip (PS / RPA / UTI) ────────────────────────────
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
      {isR && !p.dead && !p.det && <span className="badge badge-tr" style={{ color:'#22c55e', animation:'bounce 1.5s infinite' }}>OK</span>}
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
        width:22, height:28, borderRadius:4, cursor:'pointer', flexShrink:0,
        background: selected ? 'rgba(0,212,255,.18)' : ready ? `${s.c}28`
          : p.det ? 'rgba(239,68,68,.18)' : 'rgba(255,255,255,.03)',
        border: selected ? '2px solid #00d4ff' : ready ? `1px solid ${s.c}88`
          : p.blocked ? '1px solid #eab30866' : p.social ? '1px solid #a855f766'
          : p.det ? '1px solid #ef444488' : `1px solid ${s.c}22`,
        transition:'all .15s', position:'relative',
      }}>
      {ready && <div style={{ position:'absolute', top:2, right:2, width:5, height:5, borderRadius:'50%', background:s.c }}/>}
      {p.det  && <div style={{ position:'absolute', top:1, left:2,  fontSize:8, color:'#ef4444', fontWeight:900, lineHeight:1 }}>!</div>}
    </div>
  );
}

// ── Surgery panel ─────────────────────────────────────────────
function SxPan({ surgeries, sm }) {
  return (
    <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:10, padding:8, flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#64748b', marginBottom:5, letterSpacing:'.08em', flexShrink:0 }}>CC — 4 SALAS</div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {surgeries.map(s => {
          const stM = s.stH*60, enM = stM+s.dur*60;
          const inP = sm>=stM && sm<enM && s.st==='scheduled';
          const done = sm>=enM && s.st!=='cancelled';
          const cn   = s.st==='cancelled';
          const prog = inP ? Math.round((sm-stM)/(enM-stM)*100) : 0;
          const col  = cn ? '#ef4444' : inP ? '#eab308' : done ? '#22c55e' : '#94a3b8';
          return (
            <div key={s.id} style={{ fontSize:10, padding:'4px 6px', borderRadius:5, marginBottom:2,
              background: cn ? 'rgba(239,68,68,.06)' : inP ? 'rgba(234,179,8,.08)' : done ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.02)',
              border:`1px solid ${col}22`, opacity:cn?.5:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:col, fontWeight:600 }}>{s.label}</span>
                <span style={{ fontSize:9, color:'#64748b', fontFamily:'monospace' }}>
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
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:500, width:'100%' }}>
        <div style={{ fontSize:36, fontWeight:900, color:'#FF3B3B', letterSpacing:'.04em', marginBottom:4 }}>PLANTÃO TRAVADO</div>
        <div style={{ fontSize:14, color:'#00d4ff', fontWeight:600, marginBottom:40 }}>Simulador de Fluxo Hospitalar — ED Leaders × FLAME 2026</div>
        <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={onJogador} className="btn"
            style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'18px 40px', fontSize:17, fontWeight:800, borderRadius:12, boxShadow:'0 0 30px rgba(255,59,59,.25)', minWidth:180 }}>
            Sou Jogador
          </button>
          <button onClick={onFacilitador} className="btn"
            style={{ background:'linear-gradient(135deg,#0891b2,#0e7490)', padding:'18px 40px', fontSize:17, fontWeight:800, borderRadius:12, boxShadow:'0 0 30px rgba(0,212,255,.2)', minWidth:180 }}>
            Sou Facilitador
          </button>
        </div>
        <div style={{ fontSize:11, color:'#475569', marginTop:24, lineHeight:1.6 }}>
          <strong>Jogadores:</strong> entrem com o nome do time e o código da sala.<br/>
          <strong>Facilitadores:</strong> criem e controlem a sala do jogo.
        </div>
      </div>
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
        <div style={{ fontSize:28, fontWeight:900, color:'#FF3B3B', marginBottom:4 }}>PLANTÃO TRAVADO</div>
        <div style={{ fontSize:12, color:'#00d4ff', fontWeight:600, marginBottom:28 }}>ED Leaders × FLAME 2026</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            <input placeholder="Login" value={user} onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key==='Enter'&&submit()} autoFocus autoComplete="username"/>
            <input placeholder="Senha" type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key==='Enter'&&submit()} autoComplete="current-password"/>
          </div>
          {err && <div style={{ color:'#fca5a5', fontSize:11, marginBottom:10 }}>{err}</div>}
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

// ── Lobby (Jogador) ──────────────────────────────────────────
function LobbyScreen({ onJoin, onSolo, onBack }) {
  const [tName,   setTName]   = useState('');
  const [rCode,   setRCode]   = useState('FLAME');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!tName.trim()) { setErr('Digite o nome do seu time.'); return; }
    if (!rCode.trim()) { setErr('Digite o código da sala.');   return; }
    setLoading(true); setErr('');
    const result = await onJoin(tName.trim(), rCode.trim().toUpperCase());
    if (result?.error) { setErr(result.error); setLoading(false); }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:440, width:'100%' }}>
        <div style={{ fontSize:32, fontWeight:900, color:'#FF3B3B', letterSpacing:'.04em', marginBottom:2 }}>PLANTÃO TRAVADO</div>
        <div style={{ fontSize:13, color:'#00d4ff', fontWeight:600, marginBottom:32 }}>Simulador de Fluxo Hospitalar — ED Leaders × FLAME 2026</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:18, letterSpacing:'.08em', textTransform:'uppercase' }}>Entrar na Sala Multiplayer</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            <input placeholder="Nome do time (ex: Grupo Alpha)" value={tName}
              onChange={e => setTName(e.target.value)} onKeyDown={e => e.key==='Enter'&&submit()} maxLength={30} autoFocus/>
            <input placeholder="Código da sala" value={rCode}
              onChange={e => setRCode(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter'&&submit()}
              maxLength={8} style={{ textTransform:'uppercase', letterSpacing:'.12em', fontWeight:700 }}/>
          </div>
          {err && <div style={{ color:'#fca5a5', fontSize:11, marginBottom:12, textAlign:'left' }}>{err}</div>}
          <button onClick={submit} disabled={loading} className="btn"
            style={{ background:'linear-gradient(135deg,#FF3B3B,#dc2626)', padding:'13px 32px', fontSize:15, fontWeight:800, width:'100%', boxShadow:'0 0 24px rgba(255,59,59,.25)', opacity:loading?.6:1 }}>
            {loading ? 'Conectando...' : 'Entrar na Sala'}
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
        <div style={{ fontSize:32, fontWeight:900, color:'#FF3B3B', marginBottom:2 }}>PLANTÃO TRAVADO</div>
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
        <div style={{ fontSize:30, fontWeight:900, color:'#FF3B3B', marginBottom:4 }}>PLANTÃO TRAVADO</div>
        <div style={{ fontSize:13, color:'#00d4ff', fontWeight:600, marginBottom:24 }}>Simulador de Fluxo Hospitalar — ED Leaders</div>
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
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>Rodada 1 — sem ferramentas. O sistema congela. Você sente o caos.</div>
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
function GameOverModal({ isR2, score, st, pts, onRestart, onMenu }) {
  const boarding = pts.filter(p => p.sector==='ps'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
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
          {isR2 ? 'PLANTÃO LEAN' : 'PLANTÃO TRAVADO'}
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
              <div style={{ fontSize:9, color:'#64748b' }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:800, color:c, fontFamily:'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderRadius:10, padding:12, marginBottom:16, border:`1px solid ${isR2?'rgba(0,212,255,.15)':'rgba(255,59,59,.15)'}`,
          background:isR2?'rgba(0,212,255,.05)':'rgba(255,59,59,.06)' }}>
          <p style={{ color:isR2?'#7dd3fc':'#fca5a5', fontSize:12, lineHeight:1.6 }}>{msg}</p>
        </div>
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
function Game() {
  const [ph,        setPh]       = useState('role');    // role | lobby | facilLogin | waiting | menu | play | over
  const [pts,       setPts]      = useState([]);
  const [sx,        setSx]       = useState([]);
  const [sm,        setSm]       = useState(SH*60);
  const [run,       setRun]      = useState(false);
  const [sel,       setSel]      = useState(null);
  const [fl,        setFl]       = useState(null);
  const [log,       setLog]      = useState([]);
  const [st,        setSt]       = useState({ disc:0, dets:0, deaths:0, cxCan:0, lwbs:0, offS:0, socB:0, boardHrs:0 });
  const [evts,      setEvts]     = useState({ pcr:false, tomo:false, surto:false, social:false, lab:false, famDelay:false, pcrEnd:0, tomoEnd:0, labEnd:0 });
  const [cascade,   setCascade]  = useState(null);
  const [rpaW,      setRpaW]     = useState(null);
  const [rnd2,      setRnd2]     = useState(1);
  const [nirUses,   setNirUses]  = useState(0);
  const [nirCd,     setNirCd]    = useState(0);
  const [deathFlash,setDeathFlash] = useState(false);
  const [musicMuted,setMusicMuted] = useState(false);

  // Multiplayer
  const [tName,  setTName]  = useState('');
  const [rCode,  setRCode]  = useState('');
  const [roomId, setRoomId] = useState(null);
  const [teamId, setTeamId] = useState(null);

  const isR2 = rnd2 === 2;
  const ref  = useRef({ pts:[], st:{}, sm:0, nx:SH*60+rnd(5,12), rd:{}, evts:{}, rnd2:1 });

  useEffect(() => { ref.current.pts  = pts  }, [pts]);
  useEffect(() => { ref.current.st   = st   }, [st]);
  useEffect(() => { ref.current.sm   = sm   }, [sm]);
  useEffect(() => { ref.current.evts = evts }, [evts]);
  useEffect(() => { ref.current.rnd2 = rnd2 }, [rnd2]);

  const addL = useCallback((msg, type='info') => {
    setLog(prev => [{ msg, type, t:ref.current.sm }, ...prev].slice(0, 60));
  }, []);

  // Derived
  const byS      = s => pts.filter(p => p.sector===s);
  const psOcc    = byS('ps').length;
  const enfOcc   = byS('enf').length;
  const utiOcc   = byS('uti').length;
  const rpaOcc   = byS('rpa').length;
  const boarding = pts.filter(p => p.sector==='ps'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
  const avgB     = boarding.length>0 ? Math.round(boarding.reduce((a,p)=>a+p.bMin,0)/boarding.length) : 0;
  const score    = calcScore(st);
  const prog     = ((sm-SH*60)/((EH-SH)*60))*100;
  const psEval   = byS('ps').filter(p=>!p.ready&&!p.obsProlong);
  const psBoard  = byS('ps').filter(p=>p.ready&&(p.dest==='enf'||p.dest==='uti'));
  const psAlta   = byS('ps').filter(p=>p.ready&&p.dest==='alta_ps');
  const psObs    = byS('ps').filter(p=>p.obsProlong);
  const enfReady = byS('enf').filter(p=>p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
  const utiReady = byS('uti').filter(p=>p.dischReady&&p.prep<=0);
  const psPct    = pctOf(psOcc, CAP.ps);

  // ── Music update ──────────────────────────────────────────
  useEffect(() => {
    if (ph === 'play') {
      SimsMusic.update({ psOcc, boarding: boarding.length, deaths: st.deaths, isR2, run });
    }
  }, [psOcc, boarding.length, st.deaths, isR2, run, ph]);

  const toggleMusic = () => setMusicMuted(SimsMusic.toggleMute());

  // ── Start round ───────────────────────────────────────────
  const startR = useCallback((roundNum) => {
    SimsMusic.init();
    _id = 0;
    setRnd2(roundNum);
    setPts(mkInit());
    setSx(roundNum===2 ? mkSxR2() : mkSx());
    setSm(SH*60);
    setRun(true);
    setPh('play');
    setSel(null);
    setNirUses(0);
    setNirCd(0);
    setDeathFlash(false);
    const title = roundNum===2 ? 'PLANTÃO LEAN' : 'PLANTÃO TRAVADO';
    const r2Msg = roundNum===2 ? ' FERRAMENTAS LEAN ATIVAS: Alta precoce, Fast Track, Discharge Lounge, Surgical Smoothing, Fluxista, NIR, Full Capacity, Alta Segura.' : '';
    setLog([{ msg:`${title} iniciado! PS 8/15, Enf 72/85 (85%), UTI 13/15 (87%).${r2Msg}`, type:'info', t:SH*60 }]);
    if (roundNum===2) setLog(prev => [{ msg:'BED HUDDLE 7h: Previsão ~40 pacientes. 7 cirurgias redistribuídas. Pico 11h-14h.', type:'info', t:SH*60 }, ...prev]);
    setSt({ disc:0, dets:0, deaths:0, cxCan:0, lwbs:0, offS:0, socB:0, boardHrs:0 });
    setEvts({ pcr:false, tomo:false, surto:false, social:false, lab:false, famDelay:false, pcrEnd:0, tomoEnd:0, labEnd:0 });
    setCascade(null);
    setRpaW(null);
    ref.current.nx   = SH*60+rnd(5,12);
    ref.current.rd   = {};
    ref.current.rnd2 = roundNum;
  }, []);

  // ── Multiplayer: join room ────────────────────────────────
  const joinRoom = async (name, code) => {
    SimsMusic.init();
    const { data:room } = await sb.from('rooms').select('id,code,status,allow_late_join').eq('code', code).maybeSingle();
    if (!room) return { error:`Sala "${code}" não encontrada. Verifique o código com o facilitador.` };
    if (room.status === 'finished') return { error:`A sala "${code}" já foi encerrada.` };
    const cols = ['#FF3B3B','#00d4ff','#22c55e','#eab308','#f97316','#a855f7','#ec4899','#14b8a6'];
    const col  = cols[Math.floor(Math.random()*cols.length)];
    const { data:team, error } = await sb.from('teams').insert({ room_id:room.id, name, color:col }).select('id').single();
    if (error||!team) return { error:'Erro ao registrar time. Tente novamente.' };
    setTName(name); setRCode(code); setRoomId(room.id); setTeamId(team.id);
    if (room.allow_late_join && (room.status==='round1'||room.status==='round2')) {
      startR(room.status==='round1' ? 1 : 2);
    } else {
      setPh('waiting');
    }
    sb.channel(`rm-${room.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${room.id}` }, p => {
        if (p.new.status==='round1') startR(1);
        else if (p.new.status==='round2') startR(2);
      })
      .subscribe();
    return {};
  };

  // ── Multiplayer: sync score every 10s ────────────────────
  useEffect(() => {
    if (!teamId||!roomId) return;
    const iv = setInterval(() => {
      const P=ref.current.pts, S=ref.current.st, m=ref.current.sm, r=ref.current.rnd2;
      const brd = P.filter(p=>p.sector==='ps'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
      const avgBrd = brd.length>0 ? Math.round(brd.reduce((a,p)=>a+p.bMin,0)/brd.length) : 0;
      sb.from('game_state').upsert({
        team_id:teamId, room_id:roomId, round:r, sim_minute:m, score:calcScore(S),
        metrics:{
          dis:S.disc, det:S.dets, dth:S.deaths, cxC:S.cxCan, lw:S.lwbs, off:S.offS, soc:S.socB, bH:S.boardHrs,
          psOcc:P.filter(p=>p.sector==='ps').length, enfOcc:P.filter(p=>p.sector==='enf').length,
          utiOcc:P.filter(p=>p.sector==='uti').length, rpaOcc:P.filter(p=>p.sector==='rpa').length,
          boarding:brd.length, avgB:avgBrd, corredor:P.filter(p=>p.sector==='corredor').length,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict:'team_id,round' });
    }, 10000);
    return () => clearInterval(iv);
  }, [teamId, roomId]);

  // ── Game tick ─────────────────────────────────────────────
  const tick = useCallback(() => {
    setSm(prev => {
      const nm = prev+1;
      if (nm>=EH*60) { setRun(false); setPh('over'); addL('Plantão encerrado!','success'); return EH*60; }
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
        addL('PARADA CARDÍACA no PS! 1 maca bloqueada por 1h.','danger');
      }
      if (E.pcr&&cm>=E.pcrEnd) { E.pcr=false; addL('Parada resolvida. Maca liberada.','success'); }

      // Tomógrafo quebrado
      if (ch>=8&&ch<14&&!E.tomo&&Math.random()<.005) {
        E.tomo=true; E.tomoEnd=cm+120;
        addL('TOMÓGRAFO QUEBROU! Decisão +120min para todos no PS.','danger');
      }
      if (E.tomo&&cm>=E.tomoEnd) { E.tomo=false; addL('Tomógrafo reparado.','success'); }

      // Exames com atraso (NOVO — Teoria das Restrições)
      if (ch>=9&&ch<16&&!E.lab&&Math.random()<(isR2local?.002:.006)) {
        E.lab=true; E.labEnd=cm+(isR2local?45:90);
        const affected=P.filter(p=>p.sector==='ps'&&!p.ready&&!p.obsProlong).slice(0,rnd(2,4));
        affected.forEach(p => { p.psNeed+=isR2local?30:60; p.labDelay=true; });
        addL(`ATRASO NO LABORATÓRIO! ${affected.length} pacientes aguardando resultados (+${isR2local?30:60}min).`,'warning');
      }
      if (E.lab&&cm>=E.labEnd) { E.lab=false; P.forEach(p => { if(p.labDelay) p.labDelay=false; }); addL('Laboratório normalizado.','success'); }

      // Surto: GARANTIDO às 12h na R1, aleatório na R2
      const surtoForced = !isR2local && cm===12*60 && !E.surto;
      const surtoRandom = ch>=12&&ch<15&&!E.surto&&Math.random()<.006;
      if (surtoForced||surtoRandom) {
        E.surto=true;
        for (let i=0;i<3;i++) {
          const d = i<2 ? rollDest() : { dest:'uti', sev:'red', ps:rnd(90,150) };
          const np=mkPt('porta',d.dest,d.sev,false,d.ps); np.arrMin=cm; P.push(np);
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

      // Observação prolongada
      if (ch>=9&&ch<15&&Math.random()<.004) {
        const pp=P.find(p=>p.sector==='ps'&&!p.ready&&!p.obsProlong);
        if (pp) { pp.obsProlong=true; pp.obsEnd=cm+rnd(300,480); pp.psNeed=99999; addL(`OBS PROLONGADA: ${pp.name} — maca presa por ${Math.round((pp.obsEnd-cm)/60)}h.`,'warning'); }
      }
      P.forEach(p => { if (p.obsProlong&&cm>=p.obsEnd) { p.obsProlong=false; p.ready=true; p.dest='alta_ps'; addL(`${p.name} (obs) liberado.`,'success'); }});
      setEvts(E);

      // ── Arrivals ─────────────────────────────────────────
      if (cm>=ref.current.nx) {
        const d=rollDest();
        const np=mkPt('porta',d.dest,d.sev,false,d.ps);
        np.arrMin=cm; if (E.tomo) np.psNeed+=120;
        if (E.lab) { np.psNeed+=30; np.labDelay=true; }
        const pcrB=E.pcr?1:0;
        if (P.filter(x=>x.sector==='ps').length<CAP.ps-pcrB) np.sector='ps';
        P.push(np);
        const rate=arrRate(ch, isR2local);
        ref.current.nx=cm+Math.max(3,Math.round(60/rate)+rnd(-4,4));
      }

      // Auto-move porta → PS
      const porta=P.filter(p=>p.sector==='porta').sort((a,b)=>a.arrMin-b.arrMin);
      const pcrB=E.pcr?1:0;
      const space=CAP.ps-pcrB-P.filter(p=>p.sector==='ps').length;
      for (let i=0;i<Math.min(space,porta.length);i++) porta[i].sector='ps';

      // PS processing with congestion multiplier
      const psN=P.filter(p=>p.sector==='ps').length;
      const psEffective=isR2local?P.filter(p=>p.sector==='ps'&&p.dest!=='alta_ps').length:psN;
      const mult=psMult(isR2local?Math.round(psEffective/CAP.ps*15):psN);
      P.forEach(p => { if (p.sector==='ps'&&!p.ready&&!p.obsProlong) { p.psSpent+=mult; if (p.psSpent>=p.psNeed) { p.ready=true; if(p.labDelay) p.labDelay=false; }}});

      // R2: Fluxista auto-discharge alta_ps every 20 sim-min (was 30)
      if (isR2local&&cm%20===0) {
        const fluxPts=P.filter(p=>p.sector==='ps'&&p.ready&&p.dest==='alta_ps');
        fluxPts.forEach(p => { p.sector='alta'; S.disc++; addL(`Fluxista: ${p.name} — alta automática.`,'success'); });
        if (fluxPts.length>0) SimsMusic.sfx('fluxista');
      }

      // R2: Fast Track — green patients process 40% faster
      if (isR2local) {
        P.forEach(p => { if (p.sector==='ps'&&!p.ready&&!p.obsProlong&&p.sev==='green') p.psSpent+=0.4; });
      }

      // NIR cooldown
      if (nirCd>0) setNirCd(prev=>Math.max(0,prev-1));

      // ── Boarding consequences ─────────────────────────────
      P.forEach(p => {
        if (p.sector==='ps'&&p.ready&&(p.dest==='enf'||p.dest==='uti')) {
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
      P.forEach(p => { if (p.offSvc&&p.sector==='enf'&&!p.dead&&!p.det&&Math.random()<OFFSVC_DET_PROB) { p.det=true; S.dets++; addL(`${p.name} deteriorou OFF-SERVICE!`,'warning'); SimsMusic.sfx('det'); }});

      // Corridor overflow — LWBS dispara mais cedo em R1 (corredor > 2)
      if (P.filter(p=>p.sector==='ps').length>=CAP.ps-pcrB&&P.filter(p=>p.sector==='porta').length>2) {
        const tc=P.find(p=>p.sector==='porta');
        if (tc&&Math.random()<.4) { tc.sector='corredor'; addL(`${tc.name} → CORREDOR — sem macas disponíveis!`,'warning'); }
      }
      const corredorLimit = isR2local ? 5 : 2;
      if (P.filter(p=>p.sector==='corredor').length>corredorLimit) {
        const lw=P.find(p=>p.sector==='corredor'&&p.dest==='alta_ps'&&!p.dead);
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

      setSt(S); return P;
    });
  }, [addL, nirCd]);

  useEffect(() => { let iv; if (run) iv=setInterval(tick,TICK); return ()=>clearInterval(iv); }, [run, tick]);

  // ── Move logic ────────────────────────────────────────────
  const getT = p => {
    if (!p) return [];
    const t=[];
    if (p.sector==='porta'||p.sector==='corredor') t.push('ps');
    if (p.sector==='ps'&&p.ready) {
      if (p.dest==='alta_ps') t.push('alta');
      if (p.dest==='enf')     t.push('enf');
      if (p.dest==='uti')     { t.push('uti'); t.push('enf'); }
    }
    if (p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social) t.push('alta');
    if (p.sector==='uti'&&p.dischReady&&p.prep<=0) { if (p.dest==='enf') t.push('enf'); else t.push('alta'); }
    if (p.sector==='rpa'&&p.ready) { if (p.dest==='enf') t.push('enf'); if (p.dest==='uti') { t.push('uti'); t.push('enf'); }}
    return t;
  };
  const tgts = getT(sel);

  const doMove = sid => {
    if (!run||!sel) return;
    if (!tgts.includes(sid)) { setFl(sid); setTimeout(()=>setFl(null),500); return; }
    const cap2=sid==='enf'?CAP.enf:sid==='uti'?CAP.uti:sid==='ps'?CAP.ps-(evts.pcr?1:0):999;
    const cnt=pts.filter(p=>p.sector===sid).length;
    if (sid!=='alta'&&cnt>=cap2) { setFl(sid); addL(`${sid.toUpperCase()} LOTADO!`,'danger'); setTimeout(()=>setFl(null),600); return; }
    const isOff=sel.dest==='uti'&&sid==='enf'&&sel.sector!=='uti';
    setPts(prev=>prev.map(p=>{
      if (p.id!==sel.id) return p;
      if (sid==='alta') { setSt(s=>({...s,disc:s.disc+1})); addL(`${p.name} — alta.`,'success'); SimsMusic.sfx('disc'); }
      else if (isOff)   { setSt(s=>({...s,offS:s.offS+1})); addL(`OFF-SERVICE: ${p.name} UTI→ENF. Risco elevado!`,'warning'); }
      else addL(`${p.name} → ${sid.toUpperCase()}`,'info');
      return {...p,sector:sid,ready:false,dischReady:false,bStart:null,bMin:0,offSvc:isOff};
    }));
    setSel(null);
  };

  const doNIR = () => {
    if (!isR2||nirUses>=3||nirCd>0||!sel) return;
    if (sel.sector!=='ps'||!sel.ready) return;
    setPts(prev=>prev.filter(pt=>pt.id!==sel.id));
    setNirUses(n=>n+1); setNirCd(60); setSel(null);
    addL(`NIR: ${sel.name} transferido para outra unidade. (${nirUses+1}/3 usos)`,'success');
    SimsMusic.sfx('disc');
  };

  const doFullCap = () => {
    if (!isR2||!sel) return;
    if (sel.sector!=='ps'||!sel.ready||sel.dest==='uti'||sel.dest==='alta_ps') return;
    setPts(prev=>prev.map(pt=>pt.id!==sel.id?pt:{...pt,sector:'corredor',bStart:null,bMin:0}));
    setSel(null);
    addL(`FULL CAPACITY: ${sel.name} ao corredor da enfermaria. Maca liberada no PS.`,'success');
  };

  const clk = p => run && setSel(s=>s?.id===p.id?null:p);

  // Color helpers
  const logC   = { danger:'#fca5a5', warning:'#fde047', success:'#86efac', info:'#94a3b8' };
  const logBg  = { danger:'rgba(239,68,68,.06)', warning:'rgba(234,179,8,.05)', success:'rgba(34,197,94,.05)', info:'rgba(255,255,255,.02)' };
  const logBrd = { danger:'#ef4444', warning:'#eab308', success:'#22c55e', info:'#1e293b' };
  const secN   = { ps:'PS', enf:'ENF', uti:'UTI', rpa:'RPA', alta:'ALTA' };

  // Phase routing
  if (ph==='role')       return <RoleSelector onJogador={()=>setPh('lobby')} onFacilitador={()=>setPh('facilLogin')}/>;
  if (ph==='facilLogin') return <FacilitadorLogin onAuth={()=>{ window.location.href='instrutor.html'; }} onBack={()=>setPh('role')}/>;
  if (ph==='lobby')      return <LobbyScreen onJoin={joinRoom} onSolo={()=>{ SimsMusic.init(); setPh('menu'); }} onBack={()=>setPh('role')}/>;
  if (ph==='waiting')    return <WaitingScreen tName={tName} rCode={rCode}/>;
  if (ph==='menu')       return <MenuScreen onStart={startR}/>;

  // ── Game UI ───────────────────────────────────────────────
  const allEnf = byS('enf');
  const allUti = byS('uti');
  const psDanger = psPct >= 85;
  const psColapso = psPct >= 100;

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', background:'#060a13' }}>

      {/* Death flash overlay */}
      {deathFlash && <div style={{ position:'fixed', inset:0, background:'rgba(239,68,68,.3)', zIndex:300, pointerEvents:'none', animation:'fadeIn .1s' }}/>}

      {/* ── Header ── */}
      <div style={{ background:'#0a0f1a', borderBottom:`1px solid ${psColapso?'#ef4444':'#1e293b'}`, padding:'5px 14px', flexShrink:0,
        boxShadow: psColapso ? '0 2px 20px rgba(239,68,68,.3)' : 'none', transition:'box-shadow .5s' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:14, fontWeight:900, color:isR2?'#00d4ff':'#FF3B3B' }}>
              {isR2?'PLANTÃO LEAN':'PLANTÃO TRAVADO'}
            </span>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4,
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
            {psDanger && !isR2 && (
              <div style={{ fontSize:10, fontWeight:800, color:'#ef4444', animation:'pulse 1s infinite',
                padding:'2px 8px', background:'rgba(239,68,68,.12)', borderRadius:4, border:'1px solid #ef444433' }}>
                {psColapso ? 'PS COLAPSADO' : 'PS CRÍTICO'}
              </div>
            )}
            <div style={{ background:'rgba(255,255,255,.03)', padding:'4px 12px', borderRadius:6, display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>SCORE</span>
              <span style={{ fontSize:20, fontWeight:800, fontFamily:'monospace',
                color:score>700?'#22c55e':score>400?'#eab308':'#ef4444' }}>{score}</span>
            </div>
            <button onClick={toggleMusic} className="btn"
              style={{ background:'#1e293b', padding:'4px 10px', fontSize:10, color: musicMuted?'#64748b':'#94a3b8' }}>
              {musicMuted ? 'SOM OFF' : 'SOM ON'}
            </button>
            <button onClick={()=>setRun(r=>!r)} className="btn"
              style={{ background:run?'#374151':'#16a34a' }}>{run?'PAUSAR':'RETOMAR'}</button>
          </div>
        </div>
      </div>

      {/* ── R2 tools bar ── */}
      {isR2 && (
        <div style={{ background:'rgba(0,212,255,.04)', borderBottom:'1px solid rgba(0,212,255,.12)', padding:'3px 14px', display:'flex', gap:6, alignItems:'center', justifyContent:'center', flexWrap:'wrap', flexShrink:0 }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#00d4ff', letterSpacing:'.06em' }}>FERRAMENTAS LEAN:</span>
          {['Alta precoce','Fast Track','Discharge Lounge','Surgical Smoothing','Fluxista','Alta Segura'].map(t =>
            <span key={t} className="metric" style={{ color:'#22c55e' }}>{t}</span>
          )}
          <span className="metric" style={{ color:nirUses>=3?'#64748b':'#00d4ff' }}>NIR ({3-nirUses} restantes{nirCd>0?`, cd ${nirCd}m`:''})</span>
          <span className="metric" style={{ color:'#00d4ff' }}>Full Capacity</span>
        </div>
      )}

      {/* ── Metrics bar ── */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #1e293b', padding:'4px 14px', overflowX:'auto', flexShrink:0 }}>
        <div style={{ display:'flex', gap:5, justifyContent:'center', minWidth:600 }}>
          {[
            { l:'Boarding',  v:boarding.length, c:boarding.length>3?'#ef4444':boarding.length>0?'#eab308':'#64748b' },
            { l:'Board.méd', v:`${Math.floor(avgB/60)}h${String(avgB%60).padStart(2,'0')}`, c:avgB>BOARD_DET_MIN?'#ef4444':avgB>60?'#eab308':'#64748b' },
            { l:'Corredor',  v:byS('corredor').length, c:byS('corredor').length>0?'#ef4444':'#64748b' },
            { l:'Deter.',    v:st.dets,   c:st.dets>0?'#f97316':'#64748b' },
            { l:'Óbitos',    v:st.deaths, c:st.deaths>0?'#ef4444':'#64748b' },
            { l:'Cx cancel.',v:st.cxCan,  c:st.cxCan>0?'#ef4444':'#64748b' },
            { l:'LWBS',      v:st.lwbs,   c:st.lwbs>0?'#ef4444':'#64748b' },
            { l:'Off-svc',   v:st.offS,   c:st.offS>0?'#f97316':'#64748b' },
            { l:'Altas',     v:st.disc,   c:'#22c55e' },
          ].map(({ l, v, c }) => (
            <div key={l} className="metric">
              <span style={{ color:'#64748b' }}>{l}:</span>
              <span style={{ color:c, fontWeight:700, fontFamily:'monospace' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alerts ── */}
      {cascade && <div style={{ background:'linear-gradient(90deg,#450a0a,#1a0505)', borderBottom:'2px solid #ef4444', padding:'5px 14px', textAlign:'center', animation:'cascPulse 2s infinite', fontSize:12, fontWeight:700, color:'#fca5a5', flexShrink:0 }}>EFEITO CASCATA: {cascade}</div>}
      {!cascade&&rpaW && <div style={{ background:'linear-gradient(90deg,#422006,#1a1005)', borderBottom:'2px solid #ca8a04', padding:'4px 14px', textAlign:'center', fontSize:11, fontWeight:600, color:'#fde047', flexShrink:0 }}>{rpaW}</div>}
      {evts.pcr  && <div style={{ background:'#450a0a', borderBottom:'1px solid #ef4444', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#fca5a5', animation:'pulse 2s infinite', flexShrink:0 }}>PARADA CARDÍACA — 1 maca bloqueada ({fmt(evts.pcrEnd)})</div>}
      {evts.tomo && <div style={{ background:'#1a1505', borderBottom:'1px solid #ca8a04', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#fde047', flexShrink:0 }}>TOMÓGRAFO QUEBRADO — Decisão +120min ({fmt(evts.tomoEnd)})</div>}
      {evts.lab  && <div style={{ background:'#0a1a2a', borderBottom:'1px solid #0891b2', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#67e8f9', flexShrink:0 }}>ATRASO NO LABORATÓRIO — Resultados pendentes ({fmt(evts.labEnd)})</div>}

      {/* ── Main 4-column layout ── */}
      <div style={{ flex:1, display:'flex', gap:6, padding:'6px 8px', overflow:'hidden', minHeight:0 }}>

        {/* Col 1: Porta + PS + Corredor */}
        <div style={{ width:330, display:'flex', flexDirection:'column', gap:6, minHeight:0 }}>

          {/* Porta */}
          <div className="sector" style={{ background:'#0f172a', border:'1px solid #1e293b', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.08em' }}>PORTA</span>
              <span style={{ fontSize:11, fontFamily:'monospace', color:byS('porta').length>0?'#eab308':'#475569' }}>{byS('porta').length} aguardando</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3, minHeight:16 }}>
              {byS('porta').map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
              {byS('porta').length===0&&<span style={{ fontSize:10, color:'#333', fontStyle:'italic' }}>Vazia</span>}
            </div>
          </div>

          {/* PS */}
          <div className={`sector${tgts.includes('ps')?' valid-target':''}${fl==='ps'?' flash':''}`}
            onClick={()=>doMove('ps')}
            style={{ flex:1, background: psColapso?'#1a0505':'#0f172a',
              border:`1px solid ${psColapso?'#ef4444':psDanger&&!isR2?'#eab30888':'#1e293b'}`,
              cursor:tgts.includes('ps')?'pointer':'default', display:'flex', flexDirection:'column', minHeight:0,
              boxShadow: psColapso&&!isR2?'inset 0 0 30px rgba(239,68,68,.15)':'none', transition:'all .5s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>PRONTO-SOCORRO</span>
                {psDanger&&!isR2&&<span style={{ fontSize:9, fontWeight:800, color:'#ef4444', animation:'pulse 1s infinite' }}>ZONA DE PERIGO</span>}
              </div>
              <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700,
                color:psPct>=100?'#ef4444':psPct>=85?'#eab308':'#64748b' }}>
                {psOcc}/{CAP.ps} ({psPct}%){psMult(psOcc)>1?` [×${psMult(psOcc)}]`:''}
              </span>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5, minHeight:0, overflow:'hidden' }}>
              <div className="subarea" style={{ background:'rgba(100,116,139,.06)', border:'1px dashed #33415566' }}>
                <div style={{ fontSize:9, color:'#64748b', marginBottom:3 }}>Em Avaliação ({psEval.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{psEval.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:psBoard.length>5?'rgba(239,68,68,.06)':'rgba(234,179,8,.04)', border:`1px solid ${psBoard.length>5?'#ef444433':'#eab30822'}` }}>
                <div style={{ fontSize:9, color:psBoard.length>5?'#ef4444':'#eab308', marginBottom:3, fontWeight:psBoard.length>5?700:400 }}>
                  Boarding ({psBoard.length}){psBoard.length>5?' CRÍTICO!':''}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{psBoard.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:'rgba(34,197,94,.04)', border:'1px solid #22c55e22' }}>
                <div style={{ fontSize:9, color:'#22c55e', marginBottom:3 }}>Alta Pronta ({psAlta.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{psAlta.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              {psObs.length>0&&<div className="subarea" style={{ background:'rgba(168,85,247,.04)', border:'1px solid #a855f722' }}>
                <div style={{ fontSize:9, color:'#a855f7', marginBottom:3 }}>Obs Prolongada ({psObs.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{psObs.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>}
            </div>
          </div>

          {/* Corredor */}
          <div className="sector" style={{
            background:byS('corredor').length>0?'#1a0505':'#0f172a',
            border:`1px solid ${byS('corredor').length>2?'#ef4444':byS('corredor').length>0?'#eab308':'#1e293b'}`,
            flexShrink:0,
          }}>
            <div style={{ fontSize:10, fontWeight:700, color:byS('corredor').length>0?'#ef4444':'#64748b', marginBottom:3 }}>
              CORREDOR{byS('corredor').length>0?` (${byS('corredor').length}${byS('corredor').length>2?' — LWBS ativo!':''})`:''}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3, minHeight:16 }}>
              {byS('corredor').map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
              {byS('corredor').length===0&&<span style={{ fontSize:9, color:'#333', fontStyle:'italic' }}>Vazio</span>}
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
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:3, alignContent:'flex-start', overflowY:'auto', minHeight:0 }}>
              {allEnf.map(p=><MiniChip key={p.id} p={p} sel={sel} onClick={clk}/>)}
            </div>
            {enfReady.length>0&&<div style={{ fontSize:9, color:'#22c55e', marginTop:4, flexShrink:0, fontWeight:600 }}>
              {enfReady.length} pronto{enfReady.length>1?'s':''} para alta — selecione e mova para ALTA
            </div>}
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
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:4, alignContent:'flex-start', overflowY:'auto', minHeight:0 }}>
              {allUti.map(p=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
            </div>
            {utiReady.length>0&&<div style={{ fontSize:9, color:'#22c55e', marginTop:4, flexShrink:0, fontWeight:600 }}>
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
              <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8' }}>RPA</span>
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
            <div style={{ fontSize:10, fontWeight:700, color:'#22c55e', marginBottom:2 }}>ALTA</div>
            <div style={{ fontSize:40, fontWeight:900, color:'#22c55e', fontFamily:'monospace', lineHeight:1 }}>{st.disc}</div>
            <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>pacientes</div>
          </div>
          <div style={{ flex:1, background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:10, padding:8, overflowY:'auto', minHeight:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:5, letterSpacing:'.1em' }}>EVENTOS</div>
            {log.map((l,i)=>(
              <div key={i} className="log-entry" style={{ background:logBg[l.type], borderLeft:`3px solid ${logBrd[l.type]}`, color:logC[l.type], animation:i===0?'fadeIn .3s':'none' }}>
                <span style={{ color:'#475569', fontFamily:'monospace', fontSize:9, marginRight:3 }}>{fmt(l.t)}</span>{l.msg}
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
            <div style={{ fontSize:10, color:'#94a3b8' }}>
              {sel.sector==='ps'&&!sel.ready&&!sel.obsProlong?`Avaliando... ${Math.max(0,Math.round(sel.psNeed-sel.psSpent))}min${sel.labDelay?' (lab)':''}`
                :sel.obsProlong?'Obs prolongada'
                :sel.sector==='ps'&&sel.ready&&sel.dest==='alta_ps'?'Pronto para alta PS'
                :sel.sector==='ps'&&sel.ready&&sel.dest==='enf'?'Precisa de ENF'
                :sel.sector==='ps'&&sel.ready&&sel.dest==='uti'?'Precisa de UTI (ou off-svc→ENF)'
                :sel.sector==='enf'&&sel.dischReady&&sel.prep>0?`Preparo: ${sel.prep}min`
                :sel.sector==='enf'&&sel.dischReady&&sel.prep<=0&&!sel.social?'Pronto ALTA!'
                :sel.sector==='enf'&&sel.social?`Atraso familiar: ${sel.socialDelay}min`
                :sel.sector==='enf'&&sel.blocked?'Bloqueado (Cx cancel.)'
                :sel.sector==='uti'&&sel.dischReady&&sel.prep<=0?'Step-down → ENF'
                :sel.sector==='rpa'?`Pós-op → ${sel.dest.toUpperCase()}`
                :sel.sector==='porta'?'Aguardando PS'
                :sel.sector==='corredor'?'No corredor':''}
            </div>
            {sel.bMin>0&&<div style={{ fontSize:10, fontWeight:700, color:sel.bMin>=BOARD_DEAD_MIN?'#ef4444':sel.bMin>=BOARD_DET_MIN?'#f97316':'#eab308' }}>
              Boarding: {Math.floor(sel.bMin/60)}h{String(sel.bMin%60).padStart(2,'0')}
              {!sel.det&&sel.bMin<BOARD_DET_MIN&&` (deteriora em ${BOARD_DET_MIN-sel.bMin}min)`}
            </div>}
          </div>
          <div style={{ display:'flex', gap:4, marginLeft:6, flexShrink:0, flexWrap:'wrap' }}>
            {tgts.map(t=>(
              <button key={t} onClick={()=>doMove(t)} className="btn"
                style={{ background:t==='alta'?'#16a34a':t==='enf'?'#0f766e':t==='uti'?'#dc2626':t==='ps'?'#1e6091':'#475569', fontSize:10 }}>
                → {secN[t]||t.toUpperCase()}{sel.dest==='uti'&&t==='enf'&&sel.sector!=='uti'?' [OFF]':''}
              </button>
            ))}
            {isR2&&sel.sector==='ps'&&sel.ready&&sel.dest!=='alta_ps'&&nirUses<3&&nirCd<=0&&(
              <button onClick={doNIR} className="btn" style={{ background:'#7c3aed', fontSize:10 }}>NIR</button>
            )}
            {isR2&&sel.sector==='ps'&&sel.ready&&sel.dest==='enf'&&(
              <button onClick={doFullCap} className="btn" style={{ background:'#0369a1', fontSize:10 }}>Full Capacity</button>
            )}
            {tgts.length===0&&!(isR2&&sel.sector==='ps'&&sel.ready)&&(
              <span style={{ color:'#ef4444', fontSize:10, fontStyle:'italic' }}>
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
          <div style={{ fontSize:8, fontWeight:700, color:'#475569', letterSpacing:'.1em', marginBottom:5 }}>LEGENDA</div>
          {[
            { c:'#22c55e', l:'Verde — baixa complexidade' },
            { c:'#eab308', l:'Amarelo — média complexidade' },
            { c:'#f97316', l:'Laranja — alta complexidade' },
            { c:'#ef4444', l:'Vermelho — crítico / UTI' },
          ].map(({ c, l }) => (
            <div key={c} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
              <PSvg color={c} sz={10}/>
              <span style={{ fontSize:9, color:'#94a3b8' }}>{l}</span>
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
                <span style={{ fontSize:8, fontWeight:800, color:c, width:18, textAlign:'center' }}>{icon}</span>
                <span style={{ fontSize:9, color:'#94a3b8' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Game over modal ── */}
      {ph==='over'&&<GameOverModal isR2={isR2} score={score} st={st} pts={pts} onRestart={startR} onMenu={()=>setPh('menu')}/>}
    </div>
  );
}

ReactDOM.render(<Game/>, document.getElementById('root'));
