// ============================================
// GAME DO FLUXO - App Controller
// ============================================

let questionCount = 0;
let answeredCurrent = false;
let totalPlayersInRoom = 0;
let answersReceived = 0;

// --- NAVIGATION ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- LOGIN ---
async function enterGame() {
  const nickname = document.getElementById('input-nickname').value.trim();
  if (!nickname) return showToast('Digite seu apelido!');

  try {
    let player = await game.getPlayer();
    if (!player) {
      player = await game.createPlayer(nickname);
    }
    document.getElementById('lobby-nickname').textContent = player.nickname;
    showScreen('lobby');
  } catch (err) {
    showToast('Erro: ' + err.message);
  }
}

// --- CREATE ROOM ---
async function createRoom() {
  const name = document.getElementById('input-room-name').value.trim() || 'Sala do Fluxo';
  try {
    const room = await game.createRoom(name);
    enterWaitingRoom();
  } catch (err) {
    showToast('Erro ao criar sala: ' + err.message);
  }
}

// --- JOIN ROOM ---
async function joinRoom() {
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!code) return showToast('Digite o codigo da sala!');
  try {
    await game.joinRoom(code);
    enterWaitingRoom();
  } catch (err) {
    showToast(err.message);
  }
}

// --- WAITING ROOM ---
async function enterWaitingRoom() {
  document.getElementById('display-room-code').textContent = game.room.code;
  document.getElementById('display-room-name').textContent = game.room.name;

  if (game.isHost) {
    document.getElementById('host-controls').style.display = 'block';
    document.getElementById('guest-waiting').style.display = 'none';
  } else {
    document.getElementById('host-controls').style.display = 'none';
    document.getElementById('guest-waiting').style.display = 'block';
  }

  showScreen('waiting');
  loadPlayers();

  // Set up realtime callbacks
  game.onRoomUpdate = (room) => {
    if (room.status === 'playing') {
      startPlaying();
    } else if (room.status === 'finished') {
      showResults();
    }
  };

  game.onPlayersUpdate = () => {
    loadPlayers();
  };

  game.onAnswerReceived = () => {
    answersReceived++;
    document.getElementById('answers-count').textContent =
      `${answersReceived} de ${totalPlayersInRoom} responderam`;
  };
}

async function loadPlayers() {
  const { data } = await supabase
    .from('room_players')
    .select('player_id, score, players(nickname)')
    .eq('room_id', game.room.id);

  totalPlayersInRoom = data ? data.length : 0;
  const list = document.getElementById('waiting-player-list');
  list.innerHTML = '';

  (data || []).forEach(rp => {
    const li = document.createElement('li');
    const isHost = rp.player_id === game.room.host_id;
    li.innerHTML = `
      <span class="name">${rp.players.nickname}${isHost ? '<span class="host-badge">HOST</span>' : ''}</span>
      <span class="score">${rp.score} pts</span>
    `;
    list.appendChild(li);
  });

  // Enable start button if more than 1 player
  const startBtn = document.getElementById('btn-start');
  if (startBtn) {
    startBtn.disabled = totalPlayersInRoom < 1;
  }
}

// --- QUESTIONS MANAGEMENT ---
function showAddQuestions() {
  questionCount = 0;
  document.getElementById('questions-form').innerHTML = '';
  addQuestionField();
  addQuestionField();
  addQuestionField();
  showScreen('questions');
}

function addQuestionField() {
  questionCount++;
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <h4 style="margin-bottom:12px; color: var(--secondary)">Pergunta ${questionCount}</h4>
    <input type="text" placeholder="Texto da pergunta" class="q-text" data-q="${questionCount}">
    <input type="text" placeholder="Opcao A" class="q-opt" data-q="${questionCount}" data-opt="0">
    <input type="text" placeholder="Opcao B" class="q-opt" data-q="${questionCount}" data-opt="1">
    <input type="text" placeholder="Opcao C" class="q-opt" data-q="${questionCount}" data-opt="2">
    <input type="text" placeholder="Opcao D" class="q-opt" data-q="${questionCount}" data-opt="3">
    <select class="q-correct" data-q="${questionCount}">
      <option value="0">Resposta correta: A</option>
      <option value="1">Resposta correta: B</option>
      <option value="2">Resposta correta: C</option>
      <option value="3">Resposta correta: D</option>
    </select>
  `;
  document.getElementById('questions-form').appendChild(div);
}

async function saveQuestions() {
  const questions = [];
  for (let i = 1; i <= questionCount; i++) {
    const text = document.querySelector(`.q-text[data-q="${i}"]`).value.trim();
    if (!text) continue;

    const opts = [];
    document.querySelectorAll(`.q-opt[data-q="${i}"]`).forEach(el => {
      opts.push(el.value.trim() || `Opcao ${parseInt(el.dataset.opt) + 1}`);
    });

    const correct = parseInt(document.querySelector(`.q-correct[data-q="${i}"]`).value);

    questions.push({
      question_text: text,
      options: opts,
      correct_index: correct,
      time_limit: 20
    });
  }

  if (questions.length === 0) return showToast('Adicione pelo menos 1 pergunta!');

  try {
    await game.addQuestions(questions);
    showToast(`${questions.length} perguntas salvas!`);
    document.getElementById('btn-start').disabled = false;
    showScreen('waiting');
  } catch (err) {
    showToast('Erro: ' + err.message);
  }
}

// --- GAME PLAY ---
async function startGame() {
  try {
    await game.startGame();
    startPlaying();
  } catch (err) {
    showToast('Erro: ' + err.message);
  }
}

async function startPlaying() {
  await game.loadQuestions();
  showScreen('playing');
  renderQuestion();
}

function renderQuestion() {
  const q = game.getCurrentQuestion();
  if (!q) return;

  answeredCurrent = false;
  answersReceived = 0;

  document.getElementById('question-counter').textContent =
    `Pergunta ${game.room.current_question} de ${game.questions.length}`;
  document.getElementById('question-text').textContent = q.question_text;
  document.getElementById('answers-count').textContent = `0 de ${totalPlayersInRoom} responderam`;

  // Render options
  const container = document.getElementById('options-container');
  container.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.onclick = () => selectOption(q.id, i, btn);
    container.appendChild(btn);
  });

  // Timer
  let timeLeft = q.time_limit || 20;
  const timerEl = document.getElementById('timer');
  timerEl.textContent = timeLeft;
  timerEl.classList.remove('warning');

  if (game.timerInterval) clearInterval(game.timerInterval);
  game.timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 5) timerEl.classList.add('warning');
    if (timeLeft <= 0) {
      clearInterval(game.timerInterval);
      if (!answeredCurrent) {
        disableOptions();
        revealAnswer();
      }
      if (game.isHost) {
        document.getElementById('host-next').style.display = 'block';
      }
    }
  }, 1000);

  document.getElementById('host-next').style.display = 'none';
}

async function selectOption(questionId, index, btn) {
  if (answeredCurrent) return;
  answeredCurrent = true;

  btn.classList.add('selected');
  disableOptions();

  try {
    const answer = await game.submitAnswer(questionId, index);
    revealAnswer();

    if (answer.is_correct) {
      showToast(`Correto! +${answer.points} pontos`);
    } else {
      showToast('Errou!');
    }
  } catch (err) {
    showToast('Erro ao enviar resposta');
  }

  if (game.isHost) {
    setTimeout(() => {
      document.getElementById('host-next').style.display = 'block';
    }, 2000);
  }
}

function disableOptions() {
  document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
}

function revealAnswer() {
  const q = game.getCurrentQuestion();
  if (!q) return;
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach((btn, i) => {
    if (i === q.correct_index) {
      btn.classList.add('correct');
    } else if (btn.classList.contains('selected')) {
      btn.classList.add('wrong');
    }
  });
}

async function nextQuestion() {
  await game.nextQuestion();
  // Room update will trigger via realtime
  if (game.room.current_question < game.questions.length) {
    game.room.current_question++;
    renderQuestion();
  }
}

// --- RESULTS ---
async function showResults() {
  showScreen('results');
  const leaderboard = await game.getLeaderboard();
  const container = document.getElementById('leaderboard');
  container.innerHTML = '';

  leaderboard.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'leaderboard-item';
    const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    div.innerHTML = `
      <div class="rank">${medal}</div>
      <div class="info">
        <div class="name">${entry.players.nickname}</div>
      </div>
      <div class="total-score">${entry.score} pts</div>
    `;
    container.appendChild(div);
  });
}

function backToLobby() {
  game.destroy();
  showScreen('lobby');
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
  const player = await game.getPlayer();
  if (player) {
    document.getElementById('lobby-nickname').textContent = player.nickname;
    showScreen('lobby');
  }
});

// Enter key handlers
document.getElementById('input-nickname').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enterGame();
});
document.getElementById('input-room-code').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinRoom();
});
