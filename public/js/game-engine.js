// ============================================
// GAME DO FLUXO - Multiplayer Game Engine
// ============================================

class GameEngine {
  constructor() {
    this.player = null;
    this.room = null;
    this.isHost = false;
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.timerInterval = null;
    this.subscriptions = [];
  }

  // --- PLAYER ---
  async createPlayer(nickname) {
    const { data, error } = await supabase
      .from('players')
      .insert({ nickname })
      .select()
      .single();
    if (error) throw error;
    this.player = data;
    localStorage.setItem('player_id', data.id);
    localStorage.setItem('player_nickname', data.nickname);
    return data;
  }

  async getPlayer() {
    const id = localStorage.getItem('player_id');
    if (!id) return null;
    const { data } = await supabase
      .from('players')
      .select()
      .eq('id', id)
      .single();
    this.player = data;
    return data;
  }

  // --- ROOMS ---
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(name) {
    const code = this.generateRoomCode();
    const { data, error } = await supabase
      .from('game_rooms')
      .insert({
        code,
        name,
        host_id: this.player.id,
        status: 'waiting'
      })
      .select()
      .single();
    if (error) throw error;
    this.room = data;
    this.isHost = true;
    await this.joinRoom(code);
    return data;
  }

  async joinRoom(code) {
    // Find room
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select()
      .eq('code', code.toUpperCase())
      .single();
    if (roomError) throw new Error('Sala nao encontrada!');
    if (room.status !== 'waiting') throw new Error('Jogo ja comecou!');

    this.room = room;
    this.isHost = room.host_id === this.player.id;

    // Add player to room
    const { error } = await supabase
      .from('room_players')
      .upsert({
        room_id: room.id,
        player_id: this.player.id,
        score: 0,
        is_ready: false
      }, { onConflict: 'room_id,player_id' });
    if (error) throw error;

    this.subscribeToRoom();
    return room;
  }

  // --- REALTIME ---
  subscribeToRoom() {
    // Subscribe to room changes
    const roomSub = supabase
      .channel(`room-${this.room.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${this.room.id}`
      }, (payload) => {
        this.room = payload.new;
        this.onRoomUpdate(payload.new);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${this.room.id}`
      }, (payload) => {
        this.onPlayersUpdate(payload);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'player_answers',
        filter: `room_id=eq.${this.room.id}`
      }, (payload) => {
        this.onAnswerReceived(payload.new);
      })
      .subscribe();

    this.subscriptions.push(roomSub);
  }

  // --- GAME FLOW ---
  async addQuestions(questionsData) {
    const questions = questionsData.map((q, i) => ({
      room_id: this.room.id,
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_index,
      time_limit: q.time_limit || 20,
      order_num: i + 1
    }));

    const { data, error } = await supabase
      .from('questions')
      .insert(questions)
      .select();
    if (error) throw error;
    this.questions = data.sort((a, b) => a.order_num - b.order_num);
    return data;
  }

  async startGame() {
    if (!this.isHost) throw new Error('Somente o host pode iniciar!');

    // Load questions
    const { data: questions } = await supabase
      .from('questions')
      .select()
      .eq('room_id', this.room.id)
      .order('order_num');
    this.questions = questions;

    // Update room status
    const { error } = await supabase
      .from('game_rooms')
      .update({ status: 'playing', current_question: 1 })
      .eq('id', this.room.id);
    if (error) throw error;
  }

  async loadQuestions() {
    const { data } = await supabase
      .from('questions')
      .select()
      .eq('room_id', this.room.id)
      .order('order_num');
    this.questions = data || [];
    return this.questions;
  }

  getCurrentQuestion() {
    if (!this.room || !this.questions.length) return null;
    return this.questions[this.room.current_question - 1] || null;
  }

  async submitAnswer(questionId, selectedIndex) {
    const question = this.questions.find(q => q.id === questionId);
    if (!question) return;

    const isCorrect = selectedIndex === question.correct_index;
    const points = isCorrect ? Math.max(100, 1000 - (Date.now() % 10000)) : 0;

    const { data, error } = await supabase
      .from('player_answers')
      .insert({
        question_id: questionId,
        player_id: this.player.id,
        room_id: this.room.id,
        selected_index: selectedIndex,
        is_correct: isCorrect,
        points
      })
      .select()
      .single();
    if (error) throw error;

    // Update score
    if (isCorrect) {
      const { data: rp } = await supabase
        .from('room_players')
        .select('score')
        .eq('room_id', this.room.id)
        .eq('player_id', this.player.id)
        .single();

      await supabase
        .from('room_players')
        .update({ score: (rp?.score || 0) + points })
        .eq('room_id', this.room.id)
        .eq('player_id', this.player.id);
    }

    return data;
  }

  async nextQuestion() {
    if (!this.isHost) return;
    const next = this.room.current_question + 1;

    if (next > this.questions.length) {
      await supabase
        .from('game_rooms')
        .update({ status: 'finished' })
        .eq('id', this.room.id);
    } else {
      await supabase
        .from('game_rooms')
        .update({ current_question: next })
        .eq('id', this.room.id);
    }
  }

  async getLeaderboard() {
    const { data } = await supabase
      .from('room_players')
      .select('score, player_id, players(nickname)')
      .eq('room_id', this.room.id)
      .order('score', { ascending: false });
    return data || [];
  }

  // --- CALLBACKS (override in UI) ---
  onRoomUpdate(room) {}
  onPlayersUpdate(payload) {}
  onAnswerReceived(answer) {}

  // --- CLEANUP ---
  destroy() {
    this.subscriptions.forEach(sub => supabase.removeChannel(sub));
    this.subscriptions = [];
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}

// Global instance
const game = new GameEngine();
