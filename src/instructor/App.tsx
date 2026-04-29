// ============================================================
// Instructor App — Plantao Travado / Plantao Lean
// Phase 1: minimal typing (as any where needed)
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { sb } from '../shared/lib/supabase'
import { fmt } from '../shared/lib/format'
import { CREDENTIALS } from '../shared/lib/constants'
import { TeamRow } from '../shared/components/TeamRow'
import { Podium } from '../shared/components/Podium'
import { ScoreBar } from '../shared/components/ScoreBar'

// ── Local helper (only used here) ────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Session persistence ──────────────────────────────────────
const INST_KEY = 'flame_instructor';
function saveInst(d: any) { try { localStorage.setItem(INST_KEY, JSON.stringify(d)); } catch (e) { /* noop */ } }
function loadInst(): any { try { const s = localStorage.getItem(INST_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// ── Login Screen ─────────────────────────────────────────────
function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (user.trim() === CREDENTIALS.user && pass === CREDENTIALS.pass) { onAuth(); }
    else setErr('Credenciais inválidas. Tente novamente.');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#060a13', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 380, width: '100%' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.14em', marginBottom: 6, textTransform: 'uppercase' as const }}>Acesso Facilitador</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#FF3B3B', marginBottom: 4 }}>PLANTAO TRAVADO</div>
        <div style={{ fontSize: 12, color: '#00d4ff', fontWeight: 600, marginBottom: 28 }}>ED Leaders x FLAME 2026</div>
        <div style={{ background: '#0f172a', borderRadius: 14, padding: 28, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 16 }}>
            <input placeholder="Login" value={user} onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoFocus autoComplete="username" />
            <input placeholder="Senha" type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password" />
          </div>
          {err && <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 10 }}>{err}</div>}
          <button onClick={submit} className="btn"
            style={{ background: 'linear-gradient(135deg,#FF3B3B,#dc2626)', padding: '12px 32px', fontSize: 14, fontWeight: 800, width: '100%', boxShadow: '0 0 24px rgba(255,59,59,.2)' }}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Instructor component ────────────────────────────────
function Instructor() {
  const s0 = useRef(loadInst()).current;
  const [phase, setPhase] = useState(s0?.phase || 'setup');
  const [roomCode, setRoomCode] = useState('FLAME');
  const [roomId, setRoomId] = useState<string | null>(s0?.roomId || null);
  const [teams, setTeams] = useState<any[]>([]);
  const [gameStates, setGameStates] = useState<Record<string, any>>({});
  const [simMin, setSimMin] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const [pendingRound, setPendingRound] = useState<number | null>(null);
  const [showPodium, setShowPodium] = useState(false);
  const subRef = useRef<any>(null);

  // Salvar estado a cada mudanca de fase
  useEffect(() => {
    if (roomId) saveInst({ phase, roomId });
  }, [phase, roomId]);

  useEffect(() => {
    if (roomId) saveInst({ phase, roomId });
  }, [simMin]);

  // Restaurar subscriptions apos F5
  useEffect(() => {
    if (s0?.roomId && s0?.phase !== 'setup') {
      subscribeRoom(s0.roomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    const code = 'FLAME';
    setCreating(true); setErr('');
    // Se sala FLAME ja existe, reseta ela; senao, cria nova
    const { data: existing } = await sb.from('rooms').select('id,code').eq('code', code).maybeSingle();
    let room: any;
    if (existing) {
      // Reseta a sala existente
      await sb.from('game_state').delete().eq('room_id', existing.id);
      // So deleta teams se sala NAO esta em waiting (preserva teams que ja entraram)
      if ((existing as any).status !== 'waiting' || (existing as any).round !== 0) {
        await sb.from('teams').delete().eq('room_id', existing.id);
      }
      await sb.from('rooms').update({ status: 'waiting', round: 0, allow_late_join: false, full_cap_approved: false }).eq('id', existing.id);
      room = existing;
    } else {
      const { data: newRoom, error } = await sb.from('rooms').insert({ code, status: 'waiting', round: 0 } as any).select('id,code').single();
      if (error || !newRoom) { setErr('Erro ao criar sala. Tente novamente.'); setCreating(false); return; }
      room = newRoom;
    }
    setRoomId(room.id); setRoomCode(code); setPhase('lobby'); setCreating(false);
    subscribeRoom(room.id);
  };

  const subscribeRoom = async (rid: string) => {
    // Cleanup subscriptions anteriores (evita leak no reiniciar)
    if (subRef.current) {
      if (subRef.current.teamSub) sb.removeChannel(subRef.current.teamSub);
      if (subRef.current.gsSub) sb.removeChannel(subRef.current.gsSub);
      if (subRef.current.pollIv) clearInterval(subRef.current.pollIv);
    }
    // Fetch inicial — carrega dados existentes
    const { data: initTeams } = await sb.from('teams').select('*').eq('room_id', rid);
    if (initTeams?.length) setTeams(initTeams);
    const { data: initGS } = await sb.from('game_state').select('*').eq('room_id', rid);
    if (initGS?.length) {
      const map: Record<string, any> = {};
      initGS.forEach((gs: any) => { if (!map[gs.team_id]) map[gs.team_id] = {}; map[gs.team_id][`round${gs.round}`] = gs; });
      setGameStates(map);
      const latest = initGS.reduce((a: any, g: any) => g.sim_minute > (a?.sim_minute || 0) ? g : a, null as any);
      console.log("pooling 1:" + latest.sim_minute)
      // if (latest?.sim_minute) setSimMin(latest.sim_minute);
    }

    // Realtime puro (Supabase Pro) — sem polling
    const teamSub = sb.channel(`teams-${rid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'teams', filter: `room_id=eq.${rid}` },
        (p: any) => setTeams(prev => {
          if (prev.find(t => t.id === p.new.id)) return prev;
          return [...prev, p.new];
        }))
      .subscribe();
    const gsSub = sb.channel(`gs-${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: `room_id=eq.${rid}` },
        (p: any) => {
          const gs = p.new;
          setGameStates(prev => ({
            ...prev,
            [gs.team_id]: { ...(prev[gs.team_id] || {}), [`round${gs.round}`]: gs }
          }));
          // console.log("pooling 2:" + gs.sim_minute)
          // if (gs.sim_minute) setSimMin(gs.sim_minute);
        })
      .subscribe();

    // Safety net: polling a cada 1.5s — teams + game_state
    const pollIv = setInterval(async () => {
      // Polling de teams (garante que aparecem mesmo se Realtime falhar)
      const { data: tData } = await sb.from('teams').select('*').eq('room_id', rid);
      if (tData) setTeams(tData);
      // Polling de game_state
      const { data: gsData } = await sb.from('game_state').select('*').eq('room_id', rid);
      if (gsData?.length) {
        const map: Record<string, any> = {};
        gsData.forEach((gs: any) => { if (!map[gs.team_id]) map[gs.team_id] = {}; map[gs.team_id][`round${gs.round}`] = gs; });
        setGameStates(map);
        const latest = gsData.reduce((a: any, g: any) => g.sim_minute > (a?.sim_minute || 0) ? g : a, null as any);
        console.log("pooling 3:" + latest.sim_minute)
        // if (latest?.sim_minute) setSimMin(latest.sim_minute);
      }
    }, 1500);

    subRef.current = { teamSub, gsSub, pollIv };
  };

  const setStatus = async (status: string, roundNum: number, allowLateJoin = false) => {
    await sb.from('rooms').update({ status, round: roundNum, allow_late_join: allowLateJoin }).eq('id', roomId!);
  };

  const startRound1 = () => setPendingRound(1);
  const startRound2 = () => setPendingRound(2);

  const confirmStart = async (allowLateJoin: boolean) => {
    const rn = pendingRound;
    setPendingRound(null);
    if (rn === 1) { await setStatus('round1', 1, allowLateJoin); setPhase('round1'); setSimMin(7 * 60); }
    else { await setStatus('round2', 2, allowLateJoin); setPhase('round2'); setSimMin(7 * 60); }
  };

  const endRound1 = async () => { await setStatus('debrief', 1, false); setPhase('debrief'); };
  const endRound2 = async () => { await setStatus('finished', 2, false); setPhase('done'); };

  const getRanking = (roundKey: string) => {
    return [...teams].map(t => ({ team: t, gs: gameStates[t.id]?.[roundKey] }))
      .sort((a, b) => (b.gs?.score ?? 1000) - (a.gs?.score ?? 1000));
  };

  const r1Ranking = getRanking('round1');
  const r2Ranking = getRanking('round2');
  const activeRanking = phase === 'round2' || phase === 'done' ? r2Ranking : r1Ranking;

  const activeRound = phase === 'round2' || phase === 'done' ? 'round2' : 'round1';
  const allGS = teams.map(t => gameStates[t.id]?.[activeRound]).filter(Boolean);
  const avgScore = allGS.length ? Math.round(allGS.reduce((a: number, g: any) => a + (g.score || 1000), 0) / allGS.length) : null;
  const totalDeaths = allGS.reduce((a: number, g: any) => a + (g.metrics?.dth || 0), 0);
  const totalCxCan = allGS.reduce((a: number, g: any) => a + (g.metrics?.cxC || 0), 0);
  const avgBoarding = allGS.length ? Math.round(allGS.reduce((a: number, g: any) => a + (g.metrics?.boarding || 0), 0) / allGS.length) : null;

  // ── Setup phase ──
  if (phase === 'setup') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(180deg, #060a13 0%, #0a1628 50%, #060a13 100%)', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 440, width: '100%' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: '.2em', marginBottom: 8, textTransform: 'uppercase' as const }}>ED Leaders apresenta</div>
        <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 4,
          background: 'linear-gradient(135deg, #FF3B3B, #f97316, #eab308)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FLAME 2026</div>
        <div style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500, marginBottom: 6 }}>Curso de Gestao de Fluxo Hospitalar</div>
        <div style={{ width: 80, height: 2, background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)', margin: '0 auto 28px' }}>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 14, padding: 28, border: '1px solid #1e293b', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, letterSpacing: '.08em', textTransform: 'uppercase' as const }}>Painel do Facilitador</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
            Inicie a dinâmica para que os jogadores possam entrar.<br />
            A sala <strong style={{ color: '#00d4ff', letterSpacing: '.1em' }}>FLAME</strong> será criada automaticamente.
          </div>
          {err && <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 10 }}>{err}</div>}
          <button onClick={createRoom} disabled={creating} className="btn"
            style={{ background: 'linear-gradient(135deg,#FF3B3B,#dc2626)', padding: '14px 32px', fontSize: 16, fontWeight: 800, width: '100%', boxShadow: '0 4px 24px rgba(255,59,59,.3)', borderRadius: 10 }}>
            {creating ? 'Preparando...' : 'Iniciar Dinamica'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>Abra esta pagina no notebook conectado ao projetor</div>
      </div>
    </div>
  );

  const phaseLabel = ({
    lobby: { label: 'Aguardando grupos', color: '#64748b' },
    round1: { label: 'Simulador do Plantao Travado (R1)', color: '#FF3B3B' },
    debrief: { label: 'Debrief R1', color: '#eab308' },
    round2: { label: 'Simulador do Plantao Lean (R2)', color: '#00d4ff' },
    done: { label: 'Finalizado', color: '#22c55e' },
  } as Record<string, { label: string; color: string }>)[phase] || { label: '', color: '#64748b' };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>

      {/* Podium overlay */}
      {showPodium && <Podium teams={teams} gameStates={gameStates} />}
      {showPodium && (
        <button onClick={() => setShowPodium(false)} className="btn"
          style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 2001, background: '#374151', padding: '10px 30px', fontSize: 14 }}>
          Fechar Podio
        </button>
      )}

      {/* Confirm Late Join Modal */}
      {pendingRound !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: '.1em', marginBottom: 8, textTransform: 'uppercase' as const }}>
              Iniciar {pendingRound === 1 ? 'Plantao Travado (R1)' : 'Plantao Lean (R2)'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
              Permitir entrada apos inicio?
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 24 }}>
              Se sim, grupos que entrarem depois poderao jogar normalmente.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => confirmStart(true)} className="btn"
                style={{ flex: 1, background: 'linear-gradient(135deg,#22c55e,#16a34a)', padding: '12px 0', fontSize: 13 }}>
                Sim, entrada aberta
              </button>
              <button onClick={() => confirmStart(false)} className="btn"
                style={{ flex: 1, background: '#374151', padding: '12px 0', fontSize: 13 }}>
                Não, sala fechada
              </button>
            </div>
            <button onClick={() => setPendingRound(null)} className="btn"
              style={{ marginTop: 10, background: 'transparent', color: '#475569', fontSize: 11, padding: '6px 0', width: '100%' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#0a0f1a', borderBottom: '1px solid #1e293b', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>FACILITADOR</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FF3B3B' }}>FLAME 2026</div>
          </div>
          <div style={{ width: 1, height: 36, background: '#1e293b' }} />
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Codigo da sala</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#00d4ff', letterSpacing: '.12em' }}>{roomCode}</div>
          </div>
          <div style={{ width: 1, height: 36, background: '#1e293b' }} />
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Status</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: phaseLabel.color }}>{phaseLabel.label}</div>
          </div>
          {(phase === 'round1' || phase === 'round2') && simMin && (
            <>
              <div style={{ width: 1, height: 36, background: '#1e293b' }} />
              <div style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 900, color: '#00d4ff' }}>{fmt(simMin)}</div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {phase === 'lobby' && (
            <button onClick={startRound1} disabled={teams.length === 0} className="btn"
              style={{ background: 'linear-gradient(135deg,#FF3B3B,#dc2626)', padding: '10px 22px', fontSize: 13 }}>
              Iniciar Plantao Travado (R1)
            </button>
          )}
          {phase === 'round1' && (
            <button onClick={endRound1} className="btn"
              style={{ background: '#374151', padding: '10px 22px', fontSize: 13 }}>
              Encerrar R1 → Debrief
            </button>
          )}
          {phase === 'debrief' && (
            <button onClick={startRound2} className="btn"
              style={{ background: 'linear-gradient(135deg,#00d4ff,#0891b2)', padding: '10px 22px', fontSize: 13 }}>
              Iniciar Plantao Lean (R2)
            </button>
          )}
          {phase === 'round2' && (
            <button onClick={endRound2} className="btn"
              style={{ background: '#374151', padding: '10px 22px', fontSize: 13 }}>
              Encerrar R2 → Comparacao
            </button>
          )}
          {phase === 'done' && (
            <button onClick={() => setShowPodium(true)} className="btn"
              style={{ background: 'linear-gradient(135deg,#eab308,#ca8a04)', padding: '10px 22px', fontSize: 13, boxShadow: '0 0 20px rgba(234,179,8,.3)' }}>
              Gerar Podio
            </button>
          )}
          {phase !== 'setup' && (
            <>
              <button onClick={async () => {
                const m = !(await sb.from('rooms').select('music_muted').eq('id', roomId!).single()).data?.music_muted;
                await sb.from('rooms').update({ music_muted: m } as any).eq('id', roomId!);
              }} className="btn"
                style={{ background: '#1e293b', padding: '10px 18px', fontSize: 12, border: '1px solid #334155' }}>
                Som Projetor
              </button>
              <button onClick={() => window.open('projetor.html', '_blank')} className="btn"
                style={{ background: '#1e293b', padding: '10px 18px', fontSize: 12, border: '1px solid #334155' }}>
                Abrir Projeção
              </button>
              <button onClick={async () => {
                if (!confirm('Reiniciar a dinâmica? Todos os dados serão apagados.')) return;
                await sb.from('game_state').delete().eq('room_id', roomId!);
                await sb.from('teams').delete().eq('room_id', roomId!);
                await sb.from('rooms').update({ status: 'waiting', round: 0, allow_late_join: false, music_muted: false } as any).eq('id', roomId!);
                setTeams([]); setGameStates({}); setSimMin(null); setPhase('lobby'); setShowPodium(false);
                localStorage.removeItem('flame_instructor');
              }} className="btn"
                style={{ background: '#7f1d1d', padding: '10px 18px', fontSize: 12, border: '1px solid #991b1b' }}>
                Reiniciar
              </button>
              <button onClick={() => {
                localStorage.removeItem('flame_instructor');
                localStorage.removeItem('flame_authed');
                window.location.reload();
              }} className="btn"
                style={{ background: '#1e293b', padding: '10px 14px', fontSize: 12, border: '1px solid #334155' }}>
                Sair
              </button>
            </>
          )}
        </div>
      </div>

      {/* Consolidated metrics */}
      {allGS.length > 0 && (
        <div style={{ background: '#0d1117', borderBottom: '1px solid #1e293b', padding: '6px 20px', display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {[
            { l: 'Score medio', v: avgScore != null ? avgScore : '--', c: avgScore != null ? (avgScore > 700 ? '#22c55e' : avgScore > 400 ? '#eab308' : '#ef4444') : '#64748b' },
            { l: 'Obitos total', v: totalDeaths, c: totalDeaths > 0 ? '#ef4444' : '#22c55e' },
            { l: 'Cx canceladas', v: totalCxCan, c: totalCxCan > 0 ? '#f97316' : '#22c55e' },
            { l: 'Boarding medio', v: avgBoarding != null ? avgBoarding : '--', c: avgBoarding != null ? (avgBoarding > 3 ? '#ef4444' : avgBoarding > 0 ? '#eab308' : '#22c55e') : '#64748b' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 6 }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>{l}:</span>
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: c }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0, minHeight: 0 }}>

        {/* Left: Ranking */}
        <div style={{ flex: 1, padding: 16, overflowY: 'auto' as const, minHeight: 0 }}>
          {phase === 'lobby' && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
                <span style={{ color: '#94a3b8', fontSize: 14 }}>Aguardando grupos entrarem...</span>
              </div>
              <div style={{ fontSize: 48, fontWeight: 900, color: '#00d4ff', letterSpacing: '.12em', marginBottom: 4 }}>{roomCode}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>Grupos: acessar <strong style={{ color: '#00d4ff' }}>plantaoflame.netlify.app</strong> e digitar este codigo</div>
            </div>
          )}

          {teams.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.1em', marginBottom: 10, textTransform: 'uppercase' as const }}>
                {phase === 'done' ? 'Resultado Final' : phase === 'round2' ? 'Simulador do Plantao Lean -- Ranking ao Vivo' : 'Simulador do Plantao Travado -- Ranking ao Vivo'}
              </div>
              {activeRanking.map(({ team, gs }, i) => (
                <TeamRow key={team.id} team={team} gs={gs} rank={i + 1} />
              ))}
            </div>
          )}

          {/* Comparison table (done phase) */}
          {phase === 'done' && teams.some(t => gameStates[t.id]?.round1 || gameStates[t.id]?.round2) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.1em', marginBottom: 10, textTransform: 'uppercase' as const }}>
                Comparacao R1 vs R2
              </div>
              <div style={{ background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', padding: '8px 14px', borderBottom: '1px solid #1e293b', fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '.06em' }}>
                  <span>TIME</span><span style={{ textAlign: 'right', color: '#FF3B3B' }}>R1 TRAVADO</span><span style={{ textAlign: 'right', color: '#00d4ff' }}>R2 LEAN</span><span style={{ textAlign: 'right', color: '#22c55e' }}>DELTA</span>
                </div>
                {[...teams]
                  .sort((a, b) => (gameStates[b.id]?.round2?.score ?? 0) - (gameStates[a.id]?.round2?.score ?? 0))
                  .map(t => {
                    const r1 = gameStates[t.id]?.round1?.score;
                    const r2 = gameStates[t.id]?.round2?.score;
                    const delta = r1 != null && r2 != null ? r2 - r1 : null;
                    return (
                      <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px', padding: '10px 14px', borderBottom: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#64748b' }} />
                          <span style={{ fontWeight: 700 }}>{t.name}</span>
                        </div>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: r1 > 700 ? '#22c55e' : r1 > 400 ? '#eab308' : '#ef4444' }}>{r1 ?? '--'}</span>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: r2 > 700 ? '#22c55e' : r2 > 400 ? '#eab308' : '#ef4444' }}>{r2 ?? '--'}</span>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: delta != null ? (delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#64748b') : '#64748b' }}>
                          {delta != null ? `${delta > 0 ? '+' : ''}${delta}` : '--'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 220, background: '#0a0f1a', borderLeft: '1px solid #1e293b', padding: 12, overflowY: 'auto' as const }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '.1em', marginBottom: 10, textTransform: 'uppercase' as const }}>
            Grupos ({teams.length})
          </div>
          {teams.length === 0 && (
            <div style={{ color: '#333', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>Nenhum grupo ainda</div>
          )}
          {teams.map(t => {
            const r1 = gameStates[t.id]?.round1;
            const r2 = gameStates[t.id]?.round2;
            return (
              <div key={t.id} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: 'rgba(255,255,255,.02)', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#64748b', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{t.name}</span>
                </div>
                {r1 && <div style={{ fontSize: 10, color: '#64748b' }}>R1: <span style={{ color: '#FF3B3B', fontWeight: 700 }}>{r1.score}</span></div>}
                {r2 && <div style={{ fontSize: 10, color: '#64748b' }}>R2: <span style={{ color: '#00d4ff', fontWeight: 700 }}>{r2.score}</span></div>}
                {!r1 && !r2 && <div style={{ fontSize: 10, color: '#333' }}>Aguardando...</div>}
              </div>
            );
          })}

          {phase === 'round1' && (
            <div style={{ marginTop: 16, padding: 10, background: 'rgba(239,68,68,.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', marginBottom: 6, letterSpacing: '.06em' }}>PONTOS PARA COMENTAR</div>
              <ul style={{ fontSize: 10, color: '#fca5a5', lineHeight: 1.7, paddingLeft: 12 }}>
                <li>Hospital acima de 85%?</li>
                <li>Boarding acumulando?</li>
                <li>Cirurgia cancelada?</li>
                <li>UTI travada?</li>
                <li>Round medico atrasou?</li>
                <li>Exames pendentes?</li>
              </ul>
            </div>
          )}
          {phase === 'debrief' && (
            <div style={{ marginTop: 16, padding: 10, background: 'rgba(234,179,8,.06)', borderRadius: 8, border: '1px solid rgba(234,179,8,.2)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#eab308', marginBottom: 6, letterSpacing: '.06em' }}>PERGUNTAS DE DEBRIEF</div>
              <ul style={{ fontSize: 10, color: '#fde047', lineHeight: 1.7, paddingLeft: 12 }}>
                <li>"O que aconteceu?"</li>
                <li>"Onde travou primeiro?"</li>
                <li>"Foi falta de leito ou falta de gestao?"</li>
                <li>"Quando o hospital congestionou?"</li>
                <li>"As altas sairam no horario?"</li>
              </ul>
              <div style={{ fontSize: 10, color: '#eab308', marginTop: 8, fontWeight: 700 }}>
                Fechar: "O problema nao esta na entrada. Esta na SAIDA."
              </div>
            </div>
          )}
          {phase === 'round2' && (
            <div style={{ marginTop: 16, padding: 10, background: 'rgba(0,212,255,.06)', borderRadius: 8, border: '1px solid rgba(0,212,255,.2)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#00d4ff', marginBottom: 6, letterSpacing: '.06em' }}>FERRAMENTAS LEAN ATIVAS</div>
              <ul style={{ fontSize: 10, color: '#7dd3fc', lineHeight: 1.7, paddingLeft: 12 }}>
                <li>Bed Huddle + Alta precoce (8h)</li>
                <li>Fast Track (verdes)</li>
                <li>Discharge Lounge</li>
                <li>Surgical Smoothing</li>
                <li>Fluxista + NIR</li>
                <li>Alta Segura (social reduzido)</li>
              </ul>
              <button onClick={async () => {
                await sb.from('rooms').update({ full_cap_approved: true }).eq('id', roomId!);
              }} className="btn"
                style={{ marginTop: 8, width: '100%', background: 'linear-gradient(135deg,#0369a1,#0e7490)', padding: '8px 0', fontSize: 11 }}>
                Autorizar Full Capacity (Diretoria)
              </button>
            </div>
          )}
          {phase === 'done' && (
            <div style={{ marginTop: 16, padding: 10, background: 'rgba(34,197,94,.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,.2)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', marginBottom: 6, letterSpacing: '.06em' }}>FECHAMENTO</div>
              <div style={{ fontSize: 10, color: '#86efac', lineHeight: 1.7 }}>
                "O problema nunca foi falta de leito. Era falta de <strong>gestao do fluxo de saida</strong>."
              </div>
              <button onClick={() => setShowPodium(true)} className="btn"
                style={{ marginTop: 10, width: '100%', background: 'linear-gradient(135deg,#eab308,#ca8a04)', padding: '8px 0', fontSize: 11 }}>
                Gerar Podio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Auth wrapper (main export) ───────────────────────────────
export function App() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem('flame_authed') === '1'; } catch (e) { return false; }
  });
  const doAuth = () => { setAuthed(true); try { localStorage.setItem('flame_authed', '1'); } catch (e) { /* noop */ } };
  if (!authed) return <LoginScreen onAuth={doAuth} />;
  return <Instructor />;
}
