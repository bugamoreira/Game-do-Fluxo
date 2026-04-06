// ============================================================
// PLANTAO TRAVADO / PLANTAO LEAN — UI + Multiplayer
// ED Leaders x FLAME 2026
// Phase 1: Vite+TS migration (same logic, ES modules)
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../shared/lib/supabase'
import { mkInit, mkSx, mkSxR2, mkPt, arrRate, rollDest, hospMult, hospOcc, calcScore, resetId } from '../shared/lib/game-engine'
import { fmt, pctOf, rnd } from '../shared/lib/format'
import { TICK, SH, EH, CAP, SEV, HOSP_BEDS, BOARD_DET_MIN, BOARD_DEAD_MIN, OFFSVC_DET_PROB, TEAM_COLORS } from '../shared/lib/constants'
import { SimsMusic } from '../shared/lib/music'
import { PSvg } from '../shared/components/PSvg'
import { RoleSelector } from './components/RoleSelector'
import { FacilitadorLogin } from './components/FacilitadorLogin'
import { LobbyScreen } from './components/LobbyScreen'
import { WaitingScreen } from './components/WaitingScreen'
import { MenuScreen } from './components/MenuScreen'
import { GameOverModal } from './components/GameOverModal'
import { Chip } from './components/Chip'
import { MiniChip } from './components/MiniChip'
import { SurgeryPanel } from './components/SurgeryPanel'

// ── Session persistence helpers ──────────────────────────────
const SESSION_KEY = 'flame_session';
function saveSession(data: any) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch(e){} }
function loadSession(): any { try { const s=localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch(e){ return null; } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch(e){} }

// ── Main Game ─────────────────────────────────────────────────
export function Game() {
  // Tentar restaurar sessao do localStorage
  const saved = useRef<any>(loadSession());
  const s0 = saved.current;
  // So restaura sessao play se foi salva nos ultimos 5 minutos (evita sessao morta)
  const sessionFresh = s0?.ph === 'play' && s0?.savedAt && (Date.now() - s0.savedAt < 5 * 60 * 1000);
  // Se sessao stale, anula tudo para nao contaminar o state
  if (!sessionFresh) { clearSession(); saved.current = null; }

  const sf = saved.current; // sf e null se sessao stale, s0 se fresh
  const [ph,        setPh]       = useState(sf ? 'play' : 'role');
  const [pts,       setPts]      = useState<any[]>(sf?.pts || []);
  const [sx,        setSx]       = useState<any[]>(sf?.sx || []);
  const [sm,        setSm]       = useState(sf?.sm ?? SH*60);
  const [run,       setRun]      = useState(sf?.ph === 'play' ? true : false);
  const [sel,       setSel]      = useState<any>(null);
  const [fl,        setFl]       = useState<any>(null);
  const [log,       setLog]      = useState<any[]>(sf?.log || []);
  const [st,        setSt]       = useState<any>(sf?.st || { disc:0, altaHosp:0, libDE:0, dets:0, deaths:0, cxCan:0, lwbs:0, offS:0, socB:0, boardHrs:0 });
  const [evts,      setEvts]     = useState<any>(sf?.evts || { pcr:false, tomo:false, surto:false, social:false, lab:false, famDelay:false, pcrEnd:0, tomoEnd:0, labEnd:0 });
  const [cascade,   setCascade]  = useState<any>(null);
  const [rpaW,      setRpaW]     = useState<any>(null);
  const [rnd2,      setRnd2]     = useState(sf?.rnd2 || 1);
  const [nirUses,   setNirUses]  = useState(sf?.nirUses || 0);
  const [nirCd,     setNirCd]    = useState(sf?.nirCd || 0);
  const [deathFlash,setDeathFlash] = useState(false);
  // Contadores de decisao para painel pos-rodada
  const [moves, setMoves] = useState({ total:0, produtivo:0, reativo:0 });
  const [r1Results, setR1Results] = useState<any>(sf?.r1Results || null); // salva resultado R1 para comparativo
  const [ccBlocked, setCcBlocked]  = useState(sf?.ccBlocked || false);
  const [showCcModal, setShowCcModal] = useState<any>(null);
  const [fcUses,    setFcUses]     = useState(sf?.fcUses || 0);
  const [fcApproved,setFcApproved] = useState(false);

  // Multiplayer
  const [tName,  setTName]  = useState(sf?.tName || '');
  const [rCode,  setRCode]  = useState(sf?.rCode || '');
  const [roomId, setRoomId] = useState<any>(sf?.roomId || null);
  const [teamId, setTeamId] = useState<any>(sf?.teamId || null);

  const isR2 = rnd2 === 2;
  const ref  = useRef<any>({ pts:sf?.pts||[], st:sf?.st||{}, sm:sf?.sm||0, nx:sf?.nx||SH*60+rnd(5,12), rd:sf?.rd||{}, evts:sf?.evts||{}, rnd2:sf?.rnd2||1, ccBlocked:sf?.ccBlocked||false });
  const doStartRRef = useRef<any>(null); // ref estavel para subscriptions Supabase
  const subChannelRef = useRef<any>(null); // ref para cleanup de subscriptions

  // Salvar sessao a cada 3s durante o jogo
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
    if (sf?.roomId && sf?.teamId && (sf?.ph === 'play' || sf?.ph === 'waiting')) {
      sb.channel(`rm-${s0.roomId}`)
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${s0.roomId}` } as any, (p: any) => {
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

  const addL = useCallback((msg: string, type='info') => {
    setLog(prev => [{ msg, type, t:ref.current.sm }, ...prev].slice(0, 60));
  }, []);

  // Derived
  const byS      = (s: string) => pts.filter((p: any) => p.sector===s);
  const deOcc    = byS('de').length;
  const enfOcc   = byS('enf').length;
  const utiOcc   = byS('uti').length;
  const rpaOcc   = byS('rpa').length;
  const boarding = pts.filter((p: any) => p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
  const avgB     = boarding.length>0 ? Math.round(boarding.reduce((a: number,p: any)=>a+p.bMin,0)/boarding.length) : 0;
  const score    = calcScore({...st, isR2});
  const prevScoreRef = useRef(score);
  const [scorePulse, setScorePulse] = useState<string|null>(null); // 'up' | 'down' | null
  useEffect(() => {
    if (score !== prevScoreRef.current && run) {
      setScorePulse(score > prevScoreRef.current ? 'up' : 'down');
      setTimeout(() => setScorePulse(null), 400);
      prevScoreRef.current = score;
    }
  }, [score, run]);
  const prog     = ((sm-SH*60)/((EH-SH)*60))*100;
  const deEval   = byS('de').filter((p: any)=>!p.ready&&!p.obsProlong);
  const deBoard  = byS('de').filter((p: any)=>p.ready&&(p.dest==='enf'||p.dest==='uti'));
  const deAlta   = byS('de').filter((p: any)=>p.ready&&p.dest==='alta_de');
  const deObs    = byS('de').filter((p: any)=>p.obsProlong);
  const enfReady = byS('enf').filter((p: any)=>p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
  const utiReady = byS('uti').filter((p: any)=>p.dischReady&&p.prep<=0);
  const dePct    = pctOf(deOcc, CAP.de);
  const hospPct  = hospOcc(enfOcc, utiOcc);  // (ENF+UTI)/100 leitos

  // ── Music update ──────────────────────────────────────────
  useEffect(() => {
    if (ph === 'play') {
      SimsMusic.update({ deOcc, boarding: boarding.length, deaths: st.deaths, isR2, run });
    }
  }, [deOcc, boarding.length, st.deaths, isR2, run, ph]);

  // ── Start round ───────────────────────────────────────────
  // Multiplayer: inicia direto (sem modal CC — facilitador ja decidiu)
  // Solo: mostra modal de bloqueio CC
  const startR = useCallback((roundNum: number) => {
    if (roomId) {
      triggerStart(roundNum);
    } else {
      // Solo → mostrar modal CC
      setShowCcModal(roundNum);
    }
  }, [roomId]);

  const doStartR = useCallback((roundNum: number, blocked: boolean) => {
    // Som apenas no projetor — jogador nao inicializa musica
    resetId();
    setShowCcModal(null);
    setRnd2(roundNum);
    setCcBlocked(blocked);
    ref.current.ccBlocked = blocked;
    setPts(mkInit());

    // Cirurgias — em R1, atraso da primeira cirurgia na sala 1
    const sxList = roundNum===2 ? mkSxR2() : mkSx();
    if (roundNum===1) {
      const delay = rnd(30,60)/60; // 0.5-1h de atraso
      sxList.forEach((s: any) => { if (s.sala === 1) s.stH += delay; });
    }
    // Se bloqueou sala 4 para emergencias, remove cirurgias da sala 4 ou realocar
    if (blocked) {
      sxList.forEach((s: any) => { if (s.sala === 4) s.sala = 3; }); // reagrupa na sala 3
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
    const title = roundNum===2 ? 'PLANTAO LEAN' : 'PLANTAO TRAVADO';
    const ccMsg = blocked ? ' Sala 4 reservada para emergencias.' : ' Todas as 4 salas em uso eletivo.';
    const r2Msg = roundNum===2 ? ' FERRAMENTAS LEAN ATIVAS: Alta precoce, Fast Track, Discharge Lounge, Surgical Smoothing, Fluxista, NIR, Full Capacity, Alta Segura.' : '';
    const initLogs = [{ msg:`${title} iniciado! DE 8/15, Enf 71/85, UTI 13/15. Ocupacao hospitalar: 84%.${ccMsg}${r2Msg}`, type:'info', t:SH*60 }];
    if (roundNum===1) {
      const delayMin = Math.round(((sxList.find((s: any)=>s.sala===1)?.stH ?? 7.5) - 7.5) * 60);
      if (delayMin > 0) initLogs.push({ msg:`ATRASO: Primeira cirurgia atrasou ${delayMin}min. Efeito cascata na Sala 1.`, type:'warning', t:SH*60 });
    }
    if (roundNum===2) initLogs.push({ msg:'BED HUDDLE 7h: Previsao ~40 pacientes. 7 cirurgias redistribuidas. Pico 11h-14h.', type:'info', t:SH*60 });
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

  // Funcao wrapper estavel — SEMPRE usa a versao mais recente via ref
  const triggerStart = useCallback((roundNum: number) => {
    if (doStartRRef.current) doStartRRef.current(roundNum, false);
  }, []);

  // ── Multiplayer: join room (padrao Kahoot) ─────────────────
  const joinRoom = async (name: string, code: string) => {
    let room: any = null;
    // Fase 1: encontrar a sala (ate 60s — permite jogador entrar antes do facilitador)
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data } = await sb.from('rooms').select('id,code,status,allow_late_join').eq('code', code).maybeSingle();
      if (data) {
        // Sala existe — verificar se esta pronta para receber teams
        if (data.status === 'waiting' || data.status === 'round1' || data.status === 'round2') {
          room = data; break;
        }
        // Sala em debrief/finished — aguardar facilitador resetar
        // (continua polling ate status mudar para 'waiting')
      }
      if (attempt < 39) await new Promise(r => setTimeout(r, 1500));
    }
    if (!room) return { error:`Sala nao encontrada ou nao esta pronta. Verifique se o facilitador criou a sala.` };
    // Verificar nome duplicado
    const { data: existing } = await sb.from('teams').select('id').eq('room_id', room.id).eq('name', name).maybeSingle();
    if (existing) return { error:`Ja existe um time chamado "${name}". Escolha outro nome.` };
    const col  = TEAM_COLORS[Math.floor(Math.random()*TEAM_COLORS.length)];
    const { data:team, error } = await sb.from('teams').insert({ room_id:room.id, name, color:col }).select('id').single();
    if (error) {
      if (error.code === '23505') return { error:`Ja existe um time chamado "${name}". Escolha outro nome.` };
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
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`id=eq.${room.id}` } as any, (p: any) => {
        if (p.new.status==='round1') triggerStart(1);
        else if (p.new.status==='round2') triggerStart(2);
      })
      .subscribe();
    subChannelRef.current = ch;
    return {};
  };

  // ── Multiplayer: heartbeat — verifica se team ainda existe ──
  useEffect(() => {
    if (ph !== 'waiting' || !teamId) return;
    const hb = setInterval(async () => {
      const { data } = await sb.from('teams').select('id').eq('id', teamId).maybeSingle();
      if (!data) {
        // Team deletado (facilitador resetou sala) → volta ao lobby
        clearInterval(hb);
        clearSession();
        setTeamId(null); setRoomId(null); setTName('');
        if (subChannelRef.current) { sb.removeChannel(subChannelRef.current); subChannelRef.current = null; }
        setPh('lobby');
        alert('Sala reiniciada pelo facilitador. Entre novamente.');
      }
    }, 3000);
    return () => clearInterval(hb);
  }, [ph, teamId]);

  // ── Multiplayer: sync score every 1s ──────────────────────
  useEffect(() => {
    if (!teamId||!roomId) return;
    let failCount = 0;
    const iv = setInterval(async () => {
      const P=ref.current.pts, S=ref.current.st, m=ref.current.sm, r=ref.current.rnd2;
      const brd = P.filter((p: any)=>p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')&&!p.dead);
      const avgBrd = brd.length>0 ? Math.round(brd.reduce((a: number,p: any)=>a+p.bMin,0)/brd.length) : 0;
      const { error } = await sb.from('game_state').upsert({
        team_id:teamId, room_id:roomId, round:r, sim_minute:m, score:calcScore({...S, isR2:r===2}),
        metrics:{
          dis:S.disc, det:S.dets, dth:S.deaths, cxC:S.cxCan, lw:S.lwbs, off:S.offS, soc:S.socB, bH:S.boardHrs,
          deOcc:P.filter((p: any)=>p.sector==='de').length, enfOcc:P.filter((p: any)=>p.sector==='enf').length,
          utiOcc:P.filter((p: any)=>p.sector==='uti').length, rpaOcc:P.filter((p: any)=>p.sector==='rpa').length,
          boarding:brd.length, avgB:avgBrd, corredor:P.filter((p: any)=>p.sector==='corredor').length,
          altaHosp:S.altaHosp||0, libDE:S.libDE||0,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict:'team_id,round' } as any);
      if (error) {
        failCount++;
        console.error('Sync error:', error.message, {teamId, roomId, r, failCount});
        // Se FK error (team deletado), forcar re-join
        if (error.code === '23503' || failCount >= 5) {
          clearInterval(iv);
          clearSession();
          setPh('role');
          alert('Sessao expirada. Por favor, entre novamente.');
        }
      } else { failCount = 0; }
    }, 1000);
    return () => clearInterval(iv);
  }, [teamId, roomId]);

  // ── Game tick ─────────────────────────────────────────────
  const tick = useCallback(() => {
    setSm((prev: number) => {
      const nm = prev+1;
      if (nm>=EH*60) {
        setRun(false); setPh('over'); addL('Plantao encerrado!','success');
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
    setPts((prev: any[]) => {
      let P = prev.map((p: any)=>({...p}));
      const cm=ref.current.sm+1, ch=Math.floor(cm/60);
      let S={...ref.current.st};
      const R=ref.current.rd, E={...ref.current.evts};
      const isR2local = ref.current.rnd2===2;

      // ── Random events ────────────────────────────────────

      // Parada cardiaca — mais frequente em R1
      if (ch>=9&&ch<16&&!E.pcr&&Math.random()<(isR2local?.004:.008)) {
        E.pcr=true; E.pcrEnd=cm+60;
        addL('PARADA CARDIACA no DE! 1 maca bloqueada por 1h.','danger');
      }
      if (E.pcr&&cm>=E.pcrEnd) { E.pcr=false; addL('Parada resolvida. Maca liberada.','success'); }

      // Tomografo quebrado
      if (ch>=8&&ch<14&&!E.tomo&&Math.random()<.005) {
        const tomoDur = isR2local ? 60 : 120;
        E.tomo=true; E.tomoEnd=cm+tomoDur;
        if (isR2local) addL('TOMOGRAFO: manutencao preventiva, retorno em 1h.','warning');
        else addL('TOMOGRAFO QUEBROU! Decisao +120min para todos no DE.','danger');
      }
      if (E.tomo&&cm>=E.tomoEnd) { E.tomo=false; addL('Tomografo reparado.','success'); }

      // Exames com atraso (NOVO — Teoria das Restricoes)
      if (ch>=9&&ch<16&&!E.lab&&Math.random()<(isR2local?.002:.006)) {
        E.lab=true; E.labEnd=cm+(isR2local?45:90);
        const affected=P.filter((p: any)=>p.sector==='de'&&!p.ready&&!p.obsProlong).slice(0,rnd(2,4));
        affected.forEach((p: any) => { p.deNeed+=isR2local?30:60; p.labDelay=true; });
        addL(`ATRASO NO LABORATORIO! ${affected.length} pacientes aguardando resultados (+${isR2local?30:60}min).`,'warning');
      }
      if (E.lab&&cm>=E.labEnd) { E.lab=false; P.forEach((p: any) => { if(p.labDelay) p.labDelay=false; }); addL('Laboratorio normalizado.','success'); }

      // Surto: GARANTIDO as 12h na R1, aleatorio na R2
      const surtoForced = !isR2local && cm===12*60 && !E.surto;
      const surtoRandom = ch>=12&&ch<15&&!E.surto&&Math.random()<.006;
      if (surtoForced||surtoRandom) {
        E.surto=true;
        for (let i=0;i<3;i++) {
          const d = i<2 ? rollDest(isR2local) : { dest:'uti' as const, sev:'red' as const, de:rnd(90,150) };
          const np=mkPt('triagem',d.dest,d.sev,false,d.de); np.arrMin=cm; P.push(np);
        }
        addL('SURTO! 3 pacientes simultaneos chegando!','danger');
        SimsMusic.sfx('cascade');
      }

      // Paciente social (atraso de familiares)
      if (ch>=10&&ch<17&&!E.social&&Math.random()<.005) {
        E.social=true;
        const ef=P.find((p: any)=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
        if (ef) {
          ef.social=true; ef.socialDelay=isR2local?60:rnd(180,300); S.socB++;
          addL(`ATRASO DE FAMILIARES: ${ef.name} — leito bloqueado ~${Math.round(ef.socialDelay/60)}h.${isR2local?' Alta segura acionada: reduzido a 1h.':''}`, isR2local?'info':'warning');
        }
      }

      // Segundo caso social em R1 (agrava o problema)
      if (!isR2local&&ch>=13&&ch<16&&!E.famDelay&&Math.random()<.004) {
        E.famDelay=true;
        const ef=P.find((p: any)=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.social&&!p.blocked);
        if (ef) {
          ef.social=true; ef.socialDelay=rnd(120,240); S.socB++;
          addL(`BLOQUEIO SOCIAL: ${ef.name} — sem responsavel, leito preso ~${Math.round(ef.socialDelay/60)}h!`,'warning');
        }
      }

      // Cirurgia de emergencia do DE
      if (ch>=9&&ch<16&&Math.random()<(isR2local?.003:.005)) {
        const emgCandidate = P.find((p: any)=>p.sector==='de'&&p.sev==='red'&&!p.dead&&!p.postOp);
        if (emgCandidate) {
          const rpaCount = P.filter((p: any)=>p.sector==='rpa').length;
          const blocked = ref.current.ccBlocked;
          // Simplificado: se RPA tem vaga, pode operar
          if (rpaCount < CAP.rpa) {
            emgCandidate.sector='rpa'; emgCandidate.postOp=true; emgCandidate.ready=true; emgCandidate.dest='uti';
            emgCandidate.name=`EMG-${emgCandidate.name.split(' ')[0]}`;
            addL(`EMERGENCIA CIRURGICA: ${emgCandidate.name} → CC${blocked?' (sala reservada)':''} → RPA.`,'danger');
            SimsMusic.sfx('cascade');
          } else if (!blocked) {
            // RPA lotada e sem sala reservada → obito
            emgCandidate.dead=true; S.deaths++;
            addL(`SEM SALA CIRURGICA! ${emgCandidate.name} — obito evitavel. RPA lotada, sem sala reservada.`,'danger');
            SimsMusic.sfx('death');
            setDeathFlash(true); setTimeout(()=>setDeathFlash(false),600);
          } else {
            // Bloqueou sala mas RPA lotada — opera na sala reservada, paciente fica em espera
            emgCandidate.blocked = true;
            emgCandidate.ready = false;
            addL(`EMERGENCIA: ${emgCandidate.name} operado na sala reservada. Aguardando vaga na RPA.`,'warning');
          }
        }
      }

      // Observacao prolongada
      if (ch>=9&&ch<15&&Math.random()<.004) {
        const pp=P.find((p: any)=>p.sector==='de'&&!p.ready&&!p.obsProlong);
        if (pp) { pp.obsProlong=true; pp.obsEnd=cm+rnd(300,480); pp.deNeed=99999; addL(`OBS PROLONGADA: ${pp.name} — maca presa por ${Math.round((pp.obsEnd-cm)/60)}h.`,'warning'); }
      }
      P.forEach((p: any) => { if (p.obsProlong&&cm>=p.obsEnd) { p.obsProlong=false; p.ready=true; p.dest='alta_de'; addL(`${p.name} (obs) liberado.`,'success'); }});
      setEvts(E);

      // ── Arrivals ─────────────────────────────────────────
      if (cm>=ref.current.nx) {
        const d=rollDest(isR2local);
        const np=mkPt('triagem',d.dest,d.sev,false,d.de);
        np.arrMin=cm; if (E.tomo) np.deNeed+=120;
        if (E.lab) { np.deNeed+=30; np.labDelay=true; }
        const pcrB=E.pcr?1:0;
        if (P.filter((x: any)=>x.sector==='de').length<CAP.de-pcrB) np.sector='de';
        P.push(np);
        const rate=arrRate(ch, isR2local);
        ref.current.nx=cm+Math.max(3,Math.round(60/rate)+rnd(-4,4));
      }

      // Auto-move triagem → DE
      const porta=P.filter((p: any)=>p.sector==='triagem').sort((a: any,b: any)=>a.arrMin-b.arrMin);
      const pcrB=E.pcr?1:0;
      const space=CAP.de-pcrB-P.filter((p: any)=>p.sector==='de').length;
      for (let i=0;i<Math.min(space,porta.length);i++) porta[i].sector='de';

      // DE processing with hospital congestion multiplier
      const eN=P.filter((p: any)=>p.sector==='enf').length, uN=P.filter((p: any)=>p.sector==='uti').length;
      const mult=hospMult(eN, uN, isR2local);
      P.forEach((p: any) => { if (p.sector==='de'&&!p.ready&&!p.obsProlong) { p.deSpent+=mult; if (p.deSpent>=p.deNeed) { p.ready=true; if(p.labDelay) p.labDelay=false; }}});

      // R2: Fluxista auto-discharge alta_de every 20 sim-min
      if (isR2local&&cm%20===0) {
        const fluxPts=P.filter((p: any)=>p.sector==='de'&&p.ready&&p.dest==='alta_de');
        fluxPts.forEach((p: any) => { p.sector='alta'; S.disc++; addL(`Fluxista: ${p.name} — alta automatica.`,'success'); });
        if (fluxPts.length>0) SimsMusic.sfx('fluxista');
      }

      // R2: Fast Track — green patients process 40% faster
      if (isR2local) {
        P.forEach((p: any) => { if (p.sector==='de'&&!p.ready&&!p.obsProlong&&p.sev==='green') p.deSpent+=0.4; });
      }

      // R2: Fluxo puxado — DE lotado ACELERA decisoes (pull system)
      const deCount = P.filter((p: any)=>p.sector==='de').length;
      if (isR2local && deCount >= Math.round(CAP.de*0.8)) {
        P.forEach((p: any) => { if (p.sector==='de'&&!p.ready&&!p.obsProlong) p.deSpent+=1.0; });
        if (!R.pullLog) { R.pullLog=true; addL('PROTOCOLO DE FLUXO RAPIDO ATIVO — decisoes aceleradas no DE.','success'); }
      }

      // NIR cooldown
      if (nirCd>0) setNirCd((prev: number)=>Math.max(0,prev-1));

      // ── Boarding consequences ─────────────────────────────
      P.forEach((p: any) => {
        if (p.sector==='de'&&p.ready&&(p.dest==='enf'||p.dest==='uti')) {
          if (!p.bStart) p.bStart=cm;
          p.bMin=cm-p.bStart;
          S.boardHrs+=(1/60);
          if (p.bMin>=BOARD_DET_MIN&&!p.det) {
            p.det=true; S.dets++;
            addL(`DETERIORACAO: ${p.name} — ${Math.floor(p.bMin/60)}h em boarding!`,'warning');
            SimsMusic.sfx('det');
          }
          if (p.bMin>=BOARD_DEAD_MIN&&!p.dead) {
            p.dead=true; S.deaths++;
            addL(`OBITO EVITAVEL: ${p.name} — ${Math.floor(p.bMin/60)}h em boarding.`,'danger');
            SimsMusic.sfx('death');
            setDeathFlash(true); setTimeout(()=>setDeathFlash(false),600);
          }
        }
      });

      // Off-service deterioration
      P.forEach((p: any) => {
        if (p.offSvc&&p.sector==='enf'&&!p.dead&&!p.det&&Math.random()<OFFSVC_DET_PROB) {
          p.det=true; p.sev='red'; S.dets++;
          // Fluxo reverso: deteriorou fora do perfil + UTI lotada → volta ao DE
          const utiCount = P.filter((x: any)=>x.sector==='uti').length;
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
      if (S.deaths>=1 && !R.factDeath) { R.factDeath=true; addL('Em hospitais com ocupacao >95%, mortalidade cresce 8% por cada 10% de boarding adicional.','fact'); }
      if (S.cxCan>=1 && !R.factCx) { R.factCx=true; addL('Cirurgias canceladas por falta de leito custam em media R$15.000 por caso.','fact'); }

      // Corridor overflow — LWBS dispara mais cedo em R1 (corredor > 2)
      if (P.filter((p: any)=>p.sector==='de').length>=CAP.de-pcrB&&P.filter((p: any)=>p.sector==='triagem').length>2) {
        const tc=P.find((p: any)=>p.sector==='triagem');
        if (tc&&Math.random()<.4) { tc.sector='corredor'; addL(`${tc.name} → CORREDOR — sem macas disponiveis!`,'warning'); }
      }
      const corredorLimit = isR2local ? 3 : 2;
      if (P.filter((p: any)=>p.sector==='corredor').length>corredorLimit) {
        const lw=P.find((p: any)=>p.sector==='corredor'&&p.dest==='alta_de'&&!p.dead);
        if (lw&&Math.random()<.3) { lw.sector='alta'; S.lwbs++; addL(`${lw.name} SAIU SEM ATENDIMENTO! (LWBS)`,'danger'); }
      }

      // Social delay countdown
      P.forEach((p: any) => { if (p.social&&p.socialDelay>0) { p.socialDelay--; if (p.socialDelay<=0) { p.social=false; addL(`${p.name} (social) liberado.`,'success'); }}});

      // ENF rounds — R2 Bed Huddle antecipa para 8h (alta precoce)
      // R1: round medico as 11h (atraso!), preparo 120-180min (burocracia)
      const enfRoundH=isR2local?8:11;
      if (ch>=enfRoundH&&!R.e1) {
        R.e1=true;
        const c=P.filter((p: any)=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(6,8),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:rnd(120,180); }
        if (isR2local) addL(`BED HUDDLE ${enfRoundH}h: ${n} altas prescritas. Discharge Lounge: leitos liberam IMEDIATO.`,'success');
        else addL(`ROUND MEDICO ${enfRoundH}h: ${n} altas prescritas. Preparo estimado: 2-3h. TARDE DEMAIS!`,'warning');
      }
      if (ch>=14&&!R.e2) {
        R.e2=true;
        const c=P.filter((p: any)=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(3,4),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:rnd(90,120); }
        addL(`ROUND 14h: ${n} altas.${isR2local?' Liberacao imediata.':' Preparo ~1.5-2h.'}`,'success');
      }
      if (ch>=17&&!R.e3) {
        R.e3=true;
        const c=P.filter((p: any)=>p.sector==='enf'&&!p.dischReady&&!p.blocked&&!p.social);
        const n=Math.min(rnd(1,2),c.length);
        for (let i=0;i<n;i++) { c[i].dischReady=true; c[i].prep=isR2local?0:60; }
        if (n>0) addL(`ROUND 17h: ${n} alta(s) esporadica(s).`,'info');
      }

      // UTI step-downs
      if (ch>=11&&!R.u1) { R.u1=true; const c=P.filter((p: any)=>p.sector==='uti'&&!p.dischReady); for (let i=0;i<Math.min(2,c.length);i++) { c[i].dischReady=true; c[i].dest='enf'; c[i].prep=isR2local?0:60; addL(`Alta UTI: ${c[i].name} step-down → ENF.`,'info'); }}
      if (ch>=15&&!R.u2) { R.u2=true; const c=P.find((p: any)=>p.sector==='uti'&&!p.dischReady); if (c) { c.dischReady=true; c.dest='enf'; c.prep=isR2local?0:60; addL(`Alta UTI: ${c.name} step-down → ENF.`,'info'); }}

      P.forEach((p: any) => { if (p.prep>0) p.prep--; });

      // ── Surgery processing ────────────────────────────────
      setSx((prevSx: any[]) => {
        const sx2=prevSx.map((s: any)=>({...s}));
        sx2.forEach((s: any) => {
          if (s.st!=='scheduled') return;
          const enM=s.stH*60+s.dur*60;
          if (cm>=enM) {
            const rC=P.filter((p: any)=>p.sector==='rpa').length;
            if (rC>=CAP.rpa) {
              s.st='cancelled'; S.cxCan++;
              const disch=P.find((p: any)=>p.sector==='enf'&&p.dischReady&&p.prep<=0&&!p.blocked&&!p.social);
              if (disch) { disch.dischReady=false; disch.blocked=true; addL(`${s.label} CANCELADA! ${disch.name} perde alta. EFEITO CASCATA.`,'danger'); setCascade(`${s.label} cancelada → ${disch.name} perde alta → leito nao gira`); setTimeout(()=>setCascade(null),8000); }
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
        const rC=P.filter((p: any)=>p.sector==='rpa').length;
        const nxt=sx2.find((s: any)=>s.st==='scheduled'&&cm<s.stH*60+s.dur*60);
        if (nxt&&rC>=2) { const mL=Math.round(nxt.stH*60+nxt.dur*60-cm); if (mL>0&&mL<=45) setRpaW(`RPA ${rC}/${CAP.rpa} — ${nxt.label} termina em ${mL} min`); else setRpaW(null); } else setRpaW(null);
        return sx2;
      });

      setSt((prev: any) => ({...prev, ...S})); return P;
    });
  }, [addL, nirCd]);

  useEffect(() => { let iv: any; if (run) iv=setInterval(tick,TICK); return ()=>clearInterval(iv); }, [run, tick]);

  // ── Move logic ────────────────────────────────────────────
  const getT = (p: any) => {
    if (!p) return [];
    const t: string[]=[];
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

  const [offServiceConfirm, setOffServiceConfirm] = useState<any>(null); // {sel, sid} quando pendente

  const doMove = (sid: string) => {
    if (!run||!sel) return;
    if (!tgts.includes(sid)) { setFl(sid); setTimeout(()=>setFl(null),500); return; }
    const cap2=sid==='enf'?CAP.enf:sid==='uti'?CAP.uti:sid==='de'?CAP.de-(evts.pcr?1:0):999;
    const cnt=pts.filter((p: any)=>p.sector===sid).length;
    if (sid!=='alta'&&cnt>=cap2) { setFl(sid); addL(`${sid.toUpperCase()} LOTADO!`,'danger'); setTimeout(()=>setFl(null),600); return; }
    const isOff=sel.dest==='uti'&&sid==='enf'&&sel.sector!=='uti';
    // Confirmacao off-service: popup antes de mover
    if (isOff) { setOffServiceConfirm({sel:{...sel}, sid}); return; }
    const isProd = sid==='alta'||(sid==='enf'&&!isOff)||(sid==='uti'&&sel.dest==='uti');
    setPts((prev: any[])=>prev.map((p: any)=>{
      if (p.id!==sel.id) return p;
      if (sid==='alta') {
        const isHospDisc = p.sector==='enf'; // Alta hospitalar = so ENF
        setSt((s: any)=>({...s, disc:s.disc+1, altaHosp:(s.altaHosp||0)+(isHospDisc?1:0), libDE:(s.libDE||0)+(p.sector==='de'?1:0) }));
        addL(`${p.name} — ${isHospDisc?'alta hospitalar':'liberacao DE'}.`,'success');
        SimsMusic.sfx('disc');
      }
      else if (isOff)   { setSt((s: any)=>({...s,offS:s.offS+1})); addL(`FORA DO PERFIL: ${p.name} UTI→ENF. Risco elevado!`,'warning'); }
      else addL(`${p.name} → ${sid.toUpperCase()}`,'info');
      // Evolucao clinica: cor muda ao mudar de setor
      let newSev = p.sev;
      if (p.sector==='uti'&&sid==='enf'&&p.dischReady) newSev = 'green'; // step-down UTI→ENF = melhorou
      return {...p,sector:sid,sev:newSev,ready:false,dischReady:false,bStart:null,bMin:0,offSvc:isOff,obsProlong:false};
    }));
    setMoves((m: any) => ({ total:m.total+1, produtivo:m.produtivo+(isProd?1:0), reativo:m.reativo+(isProd?0:1) }));
    setSel(null);
  };

  const confirmOffService = () => {
    if (!offServiceConfirm) return;
    const { sel: s, sid } = offServiceConfirm;
    setPts((prev: any[])=>prev.map((p: any)=>{
      if (p.id!==s.id) return p;
      setSt((st2: any)=>({...st2,offS:st2.offS+1}));
      addL(`FORA DO PERFIL: ${p.name} UTI→ENF. Risco elevado!`,'warning');
      return {...p,sector:sid,ready:false,dischReady:false,bStart:null,bMin:0,offSvc:true};
    }));
    setMoves((m: any) => ({ total:m.total+1, produtivo:m.produtivo, reativo:m.reativo+1 }));
    setOffServiceConfirm(null); setSel(null);
  };

  const doNIR = () => {
    if (!isR2||nirUses>=3||nirCd>0||!sel) return;
    if (sel.sector!=='de'||!sel.ready) return;
    setPts((prev: any[])=>prev.filter((pt: any)=>pt.id!==sel.id));
    setNirUses((n: number)=>n+1); setNirCd(60); setSel(null);
    addL(`NIR: ${sel.name} transferido para outra unidade. (${nirUses+1}/3 usos)`,'success');
    SimsMusic.sfx('disc');
  };

  const doFullCap = () => {
    if (!isR2||!sel) return;
    if (!fcApproved) { addL('FULL CAPACITY negado — aguardando autorizacao da Diretoria.','warning'); return; }
    if (fcUses >= 2) { addL('FULL CAPACITY esgotado — limite de 2 pacientes atingido.','warning'); return; }
    if (sel.sector!=='de'||!sel.ready||sel.sev!=='green'||sel.dest==='alta_de') { addL('FULL CAPACITY apenas para pacientes VERDES com indicacao de internacao no DE.','warning'); return; }
    setPts((prev: any[])=>prev.map((pt: any)=>pt.id!==sel.id?pt:{...pt,sector:'corredor',bStart:null,bMin:0}));
    setFcUses((n: number)=>n+1); setSel(null);
    addL(`FULL CAPACITY: ${sel.name} ao corredor da enfermaria. Maca liberada. (${fcUses+1}/2 usos)`,'success');
  };

  // Polling para autorizacao Full Capacity do facilitador
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

  const clk = (p: any) => run && setSel((s: any)=>s?.id===p.id?null:p);

  // Color helpers
  const logC: any   = { danger:'#f87171', warning:'#fde047', success:'#86efac', info:'#94a3b8', fact:'#c4b5fd' };
  const logBg: any  = { danger:'rgba(239,68,68,.06)', warning:'rgba(234,179,8,.05)', success:'rgba(34,197,94,.05)', info:'rgba(255,255,255,.02)', fact:'rgba(167,139,250,.08)' };
  const logBrd: any = { danger:'#ef4444', warning:'#eab308', success:'#22c55e', info:'#1e293b', fact:'#a78bfa' };
  const secN: any   = { de:'DE', enf:'ENF', uti:'UTI', rpa:'RPA', alta:'ALTA' };

  // Phase routing
  if (ph==='role')       return <RoleSelector onJogador={()=>setPh('lobby')} onFacilitador={()=>setPh('facilLogin')}/>;
  if (ph==='facilLogin') return <FacilitadorLogin onAuth={()=>{ window.location.href='instrutor.html'; }} onBack={()=>setPh('role')}/>;
  if (ph==='lobby')      return <LobbyScreen onJoin={joinRoom} onSolo={()=>setPh('menu')} onBack={()=>setPh('role')}/>;
  if (ph==='waiting')    return <WaitingScreen tName={tName} rCode={rCode}/>;
  if (ph==='menu')       return <MenuScreen onStart={startR} onBack={()=>setPh('role')}/>;

  // CC Block modal (aparece antes do jogo comecar)
  if (showCcModal !== null) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060a13', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:480, width:'100%' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'.14em', marginBottom:6, textTransform:'uppercase' }}>
          {showCcModal===2 ? 'Plantao Lean (R2)' : 'Plantao Travado (R1)'}
        </div>
        <div style={{ fontSize:28, fontWeight:900, color:showCcModal===2?'#00d4ff':'#FF3B3B', marginBottom:20 }}>CENTRO CIRURGICO</div>
        <div style={{ background:'#0f172a', borderRadius:14, padding:28, border:'1px solid #1e293b' }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0', marginBottom:8 }}>
            O hospital tem 4 salas cirurgicas.
          </div>
          <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.7, marginBottom:20 }}>
            Emergencias cirurgicas podem chegar a qualquer momento.<br/>
            Sem sala disponivel = <strong style={{ color:'#ef4444' }}>obito evitavel</strong>.
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#e2e8f0', marginBottom:20 }}>
            Bloquear 1 sala para emergencias?
          </div>
          <div style={{ display:'flex', gap:12, marginBottom:12 }}>
            <button onClick={()=>doStartR(showCcModal, true)} className="btn"
              style={{ flex:1, background:'linear-gradient(135deg,#22c55e,#16a34a)', padding:'14px 0', fontSize:14, fontWeight:800, borderRadius:10 }}>
              Sim, reservar sala 4
              <div style={{ fontSize:11, fontWeight:400, opacity:.8, marginTop:2 }}>3 eletivas + 1 emergencia</div>
            </button>
            <button onClick={()=>doStartR(showCcModal, false)} className="btn"
              style={{ flex:1, background:'linear-gradient(135deg,#ef4444,#dc2626)', padding:'14px 0', fontSize:14, fontWeight:800, borderRadius:10 }}>
              Nao, usar todas
              <div style={{ fontSize:11, fontWeight:400, opacity:.8, marginTop:2 }}>4 eletivas (risco!)</div>
            </button>
          </div>
          {showCcModal===2 && (
            <div style={{ fontSize:11, color:'#00d4ff', padding:'8px 12px', background:'rgba(0,212,255,.06)', borderRadius:8, border:'1px solid rgba(0,212,255,.15)' }}>
              Bed Huddle recomenda: reservar 1 sala para emergencias.
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
              Enviar para ENF fora do perfil? Risco de deterioracao. (-25 pts)
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
              {isR2?'PLANTAO LEAN':'PLANTAO TRAVADO'}
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
                {hospColapso ? `INTERNACAO ${hospPct}% — COLAPSADO` : `INTERNACAO ${hospPct}% — CRITICO`}
              </div>
            )}
            <div style={{ background:'rgba(255,255,255,.03)', padding:'4px 12px', borderRadius:6, display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color:'#64748b' }}>SCORE</span>
              <span style={{ fontSize:22, fontWeight:800, fontFamily:'monospace',
                color:score>700?'#22c55e':score>400?'#eab308':'#ef4444',
                animation: scorePulse==='up'?'scorePulseUp .4s':scorePulse==='down'?'scorePulseDown .4s':'none',
                display:'inline-block' }}>{score}</span>
            </div>
            {!roomId && <button onClick={()=>setRun((r: boolean)=>!r)} className="btn"
              style={{ background:run?'#374151':'#16a34a' }}>{run?'PAUSAR':'RETOMAR'}</button>}
            <button onClick={()=>{if(confirm('Sair do jogo? O progresso sera perdido.')){clearSession();setRun(false);setPh('role');}}} className="btn"
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
              { l:'Obitos',  v:st.deaths, c:st.deaths>0?'#ef4444':'#64748b' },
              { l:'LWBS',    v:st.lwbs,   c:st.lwbs>0?'#ef4444':'#64748b' },
            ].map(({l,v,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:'#64748b', fontSize:11 }}>{l}:</span>
                <span style={{ color:c, fontWeight:700, fontFamily:'monospace', fontSize:13 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ color:'#1e293b', fontSize:18 }}>·</div>
          {/* Bloco 3: Acoes */}
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
      {evts.pcr  && <div style={{ background:'#450a0a', borderBottom:'1px solid #ef4444', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#f87171', animation:'pulse 2s infinite', flexShrink:0 }}>PARADA CARDIACA — 1 maca bloqueada ({fmt(evts.pcrEnd)})</div>}
      {evts.tomo && <div style={{ background:'#1a1505', borderBottom:'1px solid #ca8a04', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#fde047', flexShrink:0 }}>{isR2?'TOMOGRAFO (manutencao)':'TOMOGRAFO QUEBRADO'} — Retorno as {fmt(evts.tomoEnd)}</div>}
      {evts.lab  && <div style={{ background:'#0a1a2a', borderBottom:'1px solid #0891b2', padding:'3px 14px', textAlign:'center', fontSize:11, color:'#67e8f9', flexShrink:0 }}>ATRASO NO LABORATORIO — Resultados pendentes ({fmt(evts.labEnd)})</div>}

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
              {byS('triagem').map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
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
                <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>DEPARTAMENTO DE EMERGENCIA</span>
                {hospDanger&&!isR2&&<span style={{ fontSize:11, fontWeight:800, color:'#ef4444', animation:'pulse 1s infinite' }}>OCUPACAO &gt;85%</span>}
              </div>
              <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700,
                color:dePct>=100?'#ef4444':dePct>=85?'#eab308':'#64748b' }}>
                {deOcc}/{CAP.de} ({dePct}%)
              </span>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5, minHeight:0, overflow:'hidden' }}>
              <div className="subarea" style={{ background:'rgba(100,116,139,.06)', border:'1px dashed #33415566' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:3 }}>Em Avaliacao ({deEval.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deEval.map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:deBoard.length>5?'rgba(239,68,68,.06)':'rgba(234,179,8,.04)', border:`1px solid ${deBoard.length>5?'#ef444433':'#eab30822'}` }}>
                <div style={{ fontSize:11, color:deBoard.length>5?'#ef4444':'#eab308', marginBottom:3, fontWeight:deBoard.length>5?700:400 }}>
                  Boarding ({deBoard.length}){deBoard.length>5?' CRITICO!':''}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deBoard.map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              <div className="subarea" style={{ background:'rgba(34,197,94,.04)', border:'1px solid #22c55e22' }}>
                <div style={{ fontSize:11, color:'#22c55e', marginBottom:3 }}>Alta Pronta ({deAlta.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deAlta.map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
              </div>
              {deObs.length>0&&<div className="subarea" style={{ background:'rgba(168,85,247,.04)', border:'1px solid #a855f722' }}>
                <div style={{ fontSize:11, color:'#a855f7', marginBottom:3 }}>Obs Prolongada ({deObs.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>{deObs.map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}</div>
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
              {byS('corredor').map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
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
                  {enfReady.map((p: any)=><MiniChip key={p.id} p={p} sel={sel} onClick={clk}/>)}
                </div>
              </div>
            )}
            {/* Internados */}
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:3, alignContent:'flex-start', overflowY:'auto', minHeight:0 }}>
              {allEnf.filter((p: any)=>!enfReady.includes(p)).map((p: any)=><MiniChip key={p.id} p={p} sel={sel} onClick={clk}/>)}
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
              {allUti.map((p: any)=><Chip key={p.id} p={p} sel={sel} onClick={clk}/>)}
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
          <SurgeryPanel surgeries={sx} sm={sm}/>
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
            {log.map((l: any,i: number)=>(
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
          <PSvg color={(SEV as any)[sel.sev].c} sz={22} dead={sel.dead} det={sel.det}/>
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
                :sel.sector==='rpa'?`Pos-op → ${sel.dest.toUpperCase()}`
                :sel.sector==='triagem'?'Aguardando DE'
                :sel.sector==='corredor'?'No corredor':''}
            </div>
            {sel.bMin>0&&<div style={{ fontSize:11, fontWeight:700, color:sel.bMin>=BOARD_DEAD_MIN?'#ef4444':sel.bMin>=BOARD_DET_MIN?'#f97316':'#eab308' }}>
              Boarding: {Math.floor(sel.bMin/60)}h{String(sel.bMin%60).padStart(2,'0')}
              {!sel.det&&sel.bMin<BOARD_DET_MIN&&` (deteriora em ${BOARD_DET_MIN-sel.bMin}min)`}
            </div>}
          </div>
          <div style={{ display:'flex', gap:4, marginLeft:6, flexShrink:0, flexWrap:'wrap' }}>
            {tgts.map((t: string)=>(
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
            { c:'#eab308', l:'Amarelo — media complexidade' },
            { c:'#f97316', l:'Laranja — alta complexidade' },
            { c:'#ef4444', l:'Vermelho — critico / UTI' },
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
              { icon:'X',  c:'#ef4444', l:'Obito' },
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
