import { useState, useEffect, useRef } from 'react'
import { sb } from '../shared/lib/supabase'
import { fmt } from '../shared/lib/format'
import { SimsMusic } from '../shared/lib/music'
import { TeamRow } from '../shared/components/TeamRow'
import { Podium } from '../shared/components/Podium'
import { ScoreBar } from '../shared/components/ScoreBar'

export function App() {
  const [room, setRoom] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [gameStates, setGameStates] = useState<any>({});
  const [simMin, setSimMin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const musicStarted = useRef(false);

  const [audioReady, setAudioReady] = useState(false);
  const initAudio = () => { SimsMusic.init(); setAudioReady(true); };

  // Musica: inicializar quando round comeca, atualizar com metricas
  useEffect(() => {
    if (!room) return;
    const isRound = room.status === 'round1' || room.status === 'round2';
    if (isRound && audioReady) {
      musicStarted.current = true;
    }
    if (musicStarted.current) {
      // Mute/unmute controlado pelo facilitador via Supabase
      const shouldMute = !!room.music_muted;
      if (shouldMute !== SimsMusic.isMuted()) SimsMusic.toggleMute();

      // Atualizar mood baseado nas metricas agregadas
      const activeRound = room.status === 'round2' || room.status === 'finished' ? 'round2' : 'round1';
      const allGS = teams.map(t => (gameStates as any)[t.id]?.[activeRound]).filter(Boolean);
      const totalDeaths = allGS.reduce((a: number, g: any) => a + (g.metrics?.dth || 0), 0);
      const avgBoarding = allGS.length ? Math.round(allGS.reduce((a: number, g: any) => a + (g.metrics?.boarding || 0), 0) / allGS.length) : 0;
      SimsMusic.update({
        deOcc: avgBoarding > 5 ? 14 : avgBoarding > 2 ? 10 : 6,
        boarding: avgBoarding,
        deaths: totalDeaths,
        isR2: room.status === 'round2',
        run: isRound,
      });
    }
    if (room.status === 'finished' && musicStarted.current) {
      musicStarted.current = false;
    }
  }, [room, teams, gameStates, audioReady]);

  // Conectar a sala FLAME — fetch inicial + Realtime puro (Pro)
  useEffect(() => {
    const connect = async () => {
      // Retry ate encontrar a sala (projetor pode abrir antes do facilitador)
      let data: any = null;
      for (let i = 0; i < 60; i++) {
        const res = await sb.from('rooms').select('*').eq('code', 'FLAME').maybeSingle();
        if (res.data) { data = res.data; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (data) {
        setRoom(data);
        setLoading(false);
        const { data: t } = await sb.from('teams').select('*').eq('room_id', data.id);
        if (t) setTeams(t);
        const { data: gs } = await sb.from('game_state').select('*').eq('room_id', data.id);
        if (gs) {
          const map: any = {};
          gs.forEach((g: any) => { if (!map[g.team_id]) map[g.team_id] = {}; map[g.team_id][`round${g.round}`] = g; });
          setGameStates(map);
        }

        // Realtime puro — room status changes
        sb.channel(`proj-room-${data.id}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${data.id}` } as any,
            (p: any) => setRoom(p.new))
          .subscribe();

        // Realtime — novos teams
        sb.channel(`proj-teams-${data.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'teams', filter: `room_id=eq.${data.id}` } as any,
            (p: any) => setTeams(prev => {
              if (prev.find(t2 => t2.id === p.new.id)) return prev;
              return [...prev, p.new];
            }))
          .subscribe();

        // Realtime — game state updates (instantaneo)
        sb.channel(`proj-gs-${data.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: `room_id=eq.${data.id}` } as any,
            (p: any) => {
              const gs2 = p.new;
              setGameStates((prev: any) => ({
                ...prev,
                [gs2.team_id]: { ...(prev[gs2.team_id] || {}), [`round${gs2.round}`]: gs2 }
              }));
              if (gs2.sim_minute) setSimMin(gs2.sim_minute);
            })
          .subscribe();

        // Safety net: polling leve para garantir sync
        const pollId = setInterval(async () => {
          const { data: r2 } = await sb.from('rooms').select('*').eq('id', data.id).single();
          if (r2) setRoom(r2);
          const { data: gs2 } = await sb.from('game_state').select('*').eq('room_id', data.id);
          if (gs2?.length) {
            const m2: any = {};
            gs2.forEach((g: any) => { if (!m2[g.team_id]) m2[g.team_id] = {}; m2[g.team_id][`round${g.round}`] = g; });
            setGameStates((prev: any) => ({ ...prev, ...m2 }));
            const lat = gs2.reduce((a: any, g: any) => g.sim_minute > (a?.sim_minute || 0) ? g : a, null as any);
            if (lat?.sim_minute) setSimMin(lat.sim_minute);
          }
          const { data: t2 } = await sb.from('teams').select('*').eq('room_id', data.id);
          if (t2) setTeams(t2);
        }, 1500);
        return () => clearInterval(pollId);
      }
      setLoading(false);
    };
    connect();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#FF3B3B', marginBottom: 8 }}>FLAME 2026</div>
        <div style={{ color: '#64748b', animation: 'pulse 1.5s infinite' }}>Conectando...</div>
      </div>
    </div>
  );

  if (!audioReady) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#060a13' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#FF3B3B', marginBottom: 4 }}>FLAME 2026</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>Tela de Projeção</div>
        <button onClick={initAudio} className="btn"
          style={{ background: 'linear-gradient(135deg,#FF3B3B,#dc2626)', padding: '16px 40px', fontSize: 16, fontWeight: 800, borderRadius: 12, boxShadow: '0 4px 30px rgba(255,59,59,.3)' }}>
          Iniciar com Audio
        </button>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 12 }}>Clique para ativar o som do projetor</div>
      </div>
    </div>
  );

  if (!room) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#FF3B3B', marginBottom: 8 }}>FLAME 2026</div>
        <div style={{ fontSize: 14, color: '#64748b' }}>Aguardando o facilitador iniciar a dinâmica...</div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 12, animation: 'pulse 2s infinite' }}>A tela atualizará automaticamente</div>
      </div>
    </div>
  );

  const phase = room.status;
  const isRound = phase === 'round1' || phase === 'round2';
  const isDone = phase === 'finished';

  const phaseLabel = ({
    waiting: { label: 'Aguardando grupos', color: '#64748b' },
    round1: { label: 'Simulador do Plantao Travado (R1)', color: '#FF3B3B' },
    debrief: { label: 'Debrief', color: '#eab308' },
    round2: { label: 'Simulador do Plantao Lean (R2)', color: '#00d4ff' },
    finished: { label: 'Finalizado', color: '#22c55e' },
  } as any)[phase] || { label: '', color: '#64748b' };

  const activeRound = phase === 'round2' || isDone ? 'round2' : 'round1';
  const ranking = [...teams]
    .map(t => ({ team: t, gs: gameStates[t.id]?.[activeRound] }))
    .sort((a, b) => (b.gs?.score ?? 1000) - (a.gs?.score ?? 1000));

  const allGS = teams.map(t => gameStates[t.id]?.[activeRound]).filter(Boolean);
  const avgScore = allGS.length ? Math.round(allGS.reduce((a: number, g: any) => a + (g.score || 1000), 0) / allGS.length) : null;
  const totalDeaths = allGS.reduce((a: number, g: any) => a + (g.metrics?.dth || 0), 0);

  // Podio automatico na fase done
  if (isDone) return <Podium teams={teams} gameStates={gameStates} />;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#0a0f1a', borderBottom: '1px solid #1e293b', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: '.1em' }}>FLAME 2026</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: phaseLabel.color }}>{phaseLabel.label}</div>
          </div>
          {isRound && simMin && (
            <>
              <div style={{ width: 1, height: 40, background: '#1e293b' }} />
              <div style={{ fontFamily: 'monospace', fontSize: 40, fontWeight: 900, color: '#00d4ff' }}>{fmt(simMin)}</div>
            </>
          )}
        </div>
        {allGS.length > 0 && (
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(10px, 1.5vw, 14px)', color: '#64748b' }}>Score medio</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: (avgScore as number) > 700 ? '#22c55e' : (avgScore as number) > 400 ? '#eab308' : '#ef4444' }}>{avgScore}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(10px, 1.5vw, 14px)', color: '#64748b' }}>Obitos total</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: totalDeaths > 0 ? '#ef4444' : '#22c55e' }}>{totalDeaths}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(10px, 1.5vw, 14px)', color: '#64748b' }}>Times</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#00d4ff' }}>{teams.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', minHeight: 0 }}>

        {/* Waiting for teams */}
        {phase === 'waiting' && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <img src="img/edleaders.png" alt="ED Leaders" style={{ height: 56, objectFit: 'contain', marginBottom: 16 }} />
            <div style={{
              fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900, marginBottom: 6,
              background: 'linear-gradient(135deg, #FF3B3B, #f97316, #eab308)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              SIMULADOR DO PLANTAO
            </div>
            <div style={{ fontSize: 'clamp(14px, 2vw, 18px)', color: '#94a3b8', marginBottom: 12 }}>2o Congresso Latino-americano de Medicina de Emergencia</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a4d8f', background: 'linear-gradient(135deg,#eab308,#f59e0b)', padding: '3px 12px', borderRadius: 6 }}>FLAME 2026</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', padding: '3px 12px', background: 'rgba(26,77,143,.2)', borderRadius: 6, border: '1px solid rgba(26,77,143,.3)' }}>ABRAMEDE</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
              <span style={{ color: '#94a3b8', fontSize: 18 }}>{teams.length} grupo{teams.length !== 1 ? 's' : ''} conectado{teams.length !== 1 ? 's' : ''}</span>
            </div>
            {teams.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 600, margin: '0 auto' }}>
                {teams.map((t: any) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,.04)', borderRadius: 8, border: '1px solid #1e293b' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#64748b' }} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Debrief */}
        {phase === 'debrief' && (
          <div style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: '#eab308', marginBottom: 32 }}>DEBRIEF — PLANTAO TRAVADO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, margin: '0 auto' }}>
              {['O que aconteceu?', 'Onde travou primeiro?', 'Foi falta de leito ou falta de gestao?', 'As altas sairam no horario?', 'Quando o hospital congestionou?'].map(q => (
                <div key={q} style={{ background: 'rgba(234,179,8,.06)', border: '1px solid rgba(234,179,8,.2)', borderRadius: 10, padding: '16px 24px', fontSize: 'clamp(18px, 3vw, 26px)', color: '#fde047', fontWeight: 600, fontStyle: 'italic' }}>
                  "{q}"
                </div>
              ))}
            </div>
            <div style={{ fontSize: 'clamp(14px, 2vw, 18px)', color: '#eab308', marginTop: 32, fontWeight: 700 }}>
              "O problema nao esta na entrada. Esta na SAIDA."
            </div>
          </div>
        )}

        {/* Live ranking */}
        {(isRound || phase === 'debrief') && teams.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: '.1em', marginBottom: 14, textTransform: 'uppercase' }}>
              {phase === 'round2' ? 'Simulador do Plantao Lean — Ranking ao Vivo' : 'Simulador do Plantao Travado — Ranking ao Vivo'}
            </div>
            {ranking.map(({ team, gs }, i) => (
              <TeamRow key={team.id} team={team} gs={gs} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
