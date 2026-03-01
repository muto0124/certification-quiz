// app.js — 資格試験学習サイト メインロジック

let currentExamId = null;  // 現在選択中の試験ID

function getStorageKey() {
  return `quiz_progress_${currentExamId}`;
}

let allQuestions = [];   // data.json から読み込んだ全問題
let sessionQuestions = []; // 今回の出題リスト（範囲・シャッフル済み）
let currentIndex = 0;    // sessionQuestions 内の現在位置
let answered = false;    // 現在の問題を回答済みか
let sessionAnswers = []; // セッション内の回答状態 (null=未回答, {selected, isCorrect}=回答済み)

// --- 進捗管理 ---

function loadProgress() {
  if (!currentExamId) return { progress: {} };
  try {
    return JSON.parse(localStorage.getItem(getStorageKey())) || { progress: {} };
  } catch { return { progress: {} }; }
}

function saveProgress(data) {
  if (!currentExamId) return;
  localStorage.setItem(getStorageKey(), JSON.stringify(data));
}

function recordAnswer(questionId, isCorrect) {
  const data = loadProgress();
  if (!data.progress[questionId]) data.progress[questionId] = { history: [] };
  data.progress[questionId].history.push(isCorrect ? 'correct' : 'incorrect');
  saveProgress(data);
}

function getQuestionProgress(questionId) {
  const data = loadProgress();
  return data.progress[questionId] || { history: [] };
}

// --- 画面切り替え ---

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// --- スタート画面 ---

function renderStart() {
  showScreen('screen-start');
  document.getElementById('quiz-title').textContent = allQuestions.length
    ? window._quizTitle : '';
  document.getElementById('range-end').value = allQuestions.length;
  document.getElementById('range-start').max = allQuestions.length;
  document.getElementById('range-end').max = allQuestions.length;

  // サマリー表示
  const data = loadProgress();
  const answered = Object.values(data.progress).filter(p => p.history.length > 0).length;
  const correctTotal = Object.values(data.progress)
    .reduce((s, p) => s + p.history.filter(h => h === 'correct').length, 0);
  const totalAnswered = Object.values(data.progress)
    .reduce((s, p) => s + p.history.length, 0);
  const rate = totalAnswered ? Math.round(correctTotal / totalAnswered * 100) : 0;
  document.getElementById('summary-text').innerHTML =
    `<strong>${allQuestions.length}</strong>問中 <strong>${answered}</strong>問回答済み ／ 正答率 <strong>${rate}%</strong>`;
}

function startQuiz(mode) {
  document.getElementById('completion-message').classList.add('hidden');
  const startVal = parseInt(document.getElementById('range-start').value) || 1;
  const endVal = parseInt(document.getElementById('range-end').value) || allQuestions.length;
  const start = Math.max(1, Math.min(startVal, allQuestions.length));
  const end = Math.max(start, Math.min(endVal, allQuestions.length));

  // id は 1-based
  sessionQuestions = allQuestions.filter(q => q.id >= start && q.id <= end);
  if (mode === 'random') {
    sessionQuestions = [...sessionQuestions].sort(() => Math.random() - 0.5);
  }
  currentIndex = 0;
  sessionAnswers = new Array(sessionQuestions.length).fill(null);
  renderQuiz();
  showScreen('screen-quiz');
}

function startIncorrectOnly() {
  document.getElementById('completion-message').classList.add('hidden');
  const data = loadProgress();
  const incorrectIds = allQuestions.filter(q => {
    const p = data.progress[q.id];
    if (!p || p.history.length === 0) return false;
    return p.history[p.history.length - 1] === 'incorrect';
  });

  if (incorrectIds.length === 0) {
    const msg = document.getElementById('incorrect-only-msg');
    msg.textContent = '不正解の問題はありません';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
    return;
  }

  sessionQuestions = [...incorrectIds].sort(() => Math.random() - 0.5);
  currentIndex = 0;
  sessionAnswers = new Array(sessionQuestions.length).fill(null);
  renderQuiz();
  showScreen('screen-quiz');
}

function skipQuestion() {
  if (answered) return;
  currentIndex++;
  renderQuiz();
}

function goToPrevQuestion() {
  if (currentIndex <= 0) return;
  currentIndex--;
  renderQuiz();
}

function showCompletionMessage() {
  const msg = document.getElementById('completion-message');
  msg.classList.remove('hidden');
  const timer = setTimeout(() => msg.classList.add('hidden'), 5000);
  document.getElementById('btn-dismiss').onclick = () => {
    msg.classList.add('hidden');
    clearTimeout(timer);
  };
}

// --- クイズ画面 ---

function renderQuiz() {
  if (currentIndex >= sessionQuestions.length) {
    renderStart();
    showScreen('screen-start');
    showCompletionMessage();
    return;
  }

  const q = sessionQuestions[currentIndex];
  const savedAnswer = sessionAnswers[currentIndex];
  answered = savedAnswer !== null;

  document.getElementById('quiz-counter').textContent =
    `問題 ${q.id} （${currentIndex + 1} / ${sessionQuestions.length}）`;

  // 前へボタンの有効/無効
  document.getElementById('btn-prev').disabled = currentIndex === 0;

  document.getElementById('question-text').textContent = q.question;

  // 選択肢ボタンを生成
  const choicesDiv = document.getElementById('choices');
  choicesDiv.innerHTML = '';
  for (const [label, text] of Object.entries(q.choices)) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `<span class="choice-label">${label}</span><span>${text}</span>`;
    btn.dataset.label = label;
    btn.addEventListener('click', () => onChoiceSelected(label, q));
    choicesDiv.appendChild(btn);
  }

  if (answered) {
    // 回答済み: 選択肢ハイライト＋解説を復元
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = true;
      const label = btn.dataset.label;
      if (q.answer.includes(label)) {
        btn.classList.add('correct');
      } else if (label === savedAnswer.selected && !savedAnswer.isCorrect) {
        btn.classList.add('incorrect');
      }
    });
    renderExplanation(q.explanation);
    document.getElementById('explanation-panel').classList.remove('hidden');
    document.getElementById('btn-skip').classList.add('hidden');
    const navArea = document.getElementById('nav-area');
    navArea.classList.remove('hidden');
    const nextBtn = document.getElementById('btn-next');
    const isLast = currentIndex === sessionQuestions.length - 1;
    nextBtn.textContent = isLast ? 'スタートに戻る' : '次の問題 →';
    nextBtn.onclick = () => {
      if (isLast) { renderStart(); showScreen('screen-start'); }
      else { currentIndex++; renderQuiz(); }
    };
  } else {
    // 未回答: 通常表示
    document.getElementById('explanation-panel').classList.add('hidden');
    document.getElementById('nav-area').classList.add('hidden');
    document.getElementById('btn-skip').classList.remove('hidden');
  }
}

function onChoiceSelected(selected, q) {
  if (answered) return;
  answered = true;

  const isCorrect = q.answer.includes(selected);
  recordAnswer(q.id, isCorrect);
  sessionAnswers[currentIndex] = { selected, isCorrect };

  // 選択肢をハイライト
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    const label = btn.dataset.label;
    if (q.answer.includes(label)) {
      btn.classList.add('correct');
    } else if (label === selected && !isCorrect) {
      btn.classList.add('incorrect');
    }
  });

  renderExplanation(q.explanation);
  document.getElementById('explanation-panel').classList.remove('hidden');

  // スキップボタンを非表示、次の問題ボタンを表示
  document.getElementById('btn-skip').classList.add('hidden');
  const navArea = document.getElementById('nav-area');
  navArea.classList.remove('hidden');
  const nextBtn = document.getElementById('btn-next');
  const isLast = currentIndex === sessionQuestions.length - 1;
  nextBtn.textContent = isLast ? 'スタートに戻る' : '次の問題 →';
  nextBtn.onclick = () => {
    if (isLast) { renderStart(); showScreen('screen-start'); }
    else { currentIndex++; renderQuiz(); }
  };
}

function renderExplanation(exp) {
  document.getElementById('exp-focus').textContent = exp.focus || '';

  // 核心
  const keyInsightDiv = document.getElementById('exp-key-insight');
  if (exp.keyInsight) {
    keyInsightDiv.innerHTML = `<p class="key-insight"><strong>核心:</strong> ${exp.keyInsight}</p>`;
  } else { keyInsightDiv.innerHTML = ''; }

  // 選択肢分析テーブル（type に応じた色分け）
  const analysisDiv = document.getElementById('exp-analysis');
  if (exp.analysis && exp.analysis.length) {
    const rows = exp.analysis.map(a => {
      const rowClass = a.correct ? 'is-correct' : 'is-incorrect';
      const typeClass = a.type === 'key' ? ' reason-key'
                      : a.type === 'trap' ? ' reason-trap'
                      : '';
      const prefix = a.type === 'key' ? '<span class="type-badge type-key">KEY</span> '
                   : a.type === 'trap' ? '<span class="type-badge type-trap">TRAP</span> '
                   : '';
      return `
      <tr class="${rowClass}">
        <td><strong>${a.choice}</strong></td>
        <td>${a.summary}</td>
        <td>${a.correct ? '✓' : '✗'}</td>
        <td class="${typeClass.trim()}">${prefix}${a.reason}</td>
      </tr>`;
    }).join('');
    analysisDiv.innerHTML = `
      <table class="analysis-table">
        <thead><tr><th>選択肢</th><th>内容</th><th>判定</th><th>理由</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else { analysisDiv.innerHTML = ''; }

  // 間違いやすいポイント
  const pitfallsDiv = document.getElementById('exp-pitfalls');
  if (exp.pitfalls) {
    pitfallsDiv.innerHTML = `<p><strong>間違いやすいポイント:</strong></p><pre style="white-space:pre-wrap;font-family:inherit;font-size:0.9rem">${exp.pitfalls}</pre>`;
  } else { pitfallsDiv.innerHTML = ''; }
}

// --- 進捗一覧画面 ---

let currentFilter = 'all';

function renderProgress() {
  showScreen('screen-progress');
  applyFilter(currentFilter);
}

function applyFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === filter);
  });

  const data = loadProgress();
  const list = document.getElementById('progress-list');
  list.innerHTML = '';

  const filtered = allQuestions.filter(q => {
    const p = data.progress[q.id] || { history: [] };
    if (filter === 'unanswered') return p.history.length === 0;
    if (filter === 'correct') {
      const last = p.history[p.history.length - 1];
      return last === 'correct';
    }
    if (filter === 'incorrect') {
      const last = p.history[p.history.length - 1];
      return last === 'incorrect';
    }
    return true; // 'all'
  });

  filtered.forEach(q => {
    const p = data.progress[q.id] || { history: [] };
    const total = p.history.length;
    const correct = p.history.filter(h => h === 'correct').length;
    const rate = total ? Math.round(correct / total * 100) : null;

    const historyHTML = p.history.map(h =>
      `<span title="${h}">${h === 'correct' ? '✅' : '❌'}</span>`
    ).join('');

    const rateClass = rate === null ? '' : rate >= 70 ? 'good' : 'bad';
    const rateText = rate === null
      ? '<span class="unanswered-label">未回答</span>'
      : `<span class="progress-rate ${rateClass}">${rate}%</span>`;

    const item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML = `
      <span class="progress-qnum">問題 ${q.id}</span>
      <span class="progress-history">${historyHTML}</span>
      ${rateText}
      <button class="btn btn-secondary btn-jump" data-qid="${q.id}">解く</button>
    `;
    item.querySelector('.btn-jump').addEventListener('click', () => {
      jumpToQuestion(q.id);
    });
    list.appendChild(item);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:2rem">該当する問題はありません</p>';
  }
}

function jumpToQuestion(qid) {
  // 指定問題を先頭にして順番通りモードで開始
  sessionQuestions = allQuestions.filter(q => q.id === qid);
  currentIndex = 0;
  sessionAnswers = new Array(sessionQuestions.length).fill(null);
  renderQuiz();
  showScreen('screen-quiz');
}

// --- ジャンプグリッドモーダル ---

function openJumpModal() {
  const modal = document.getElementById('jump-modal');
  const grid = document.getElementById('jump-grid');
  grid.innerHTML = '';

  sessionQuestions.forEach((q, idx) => {
    const cell = document.createElement('button');
    cell.className = 'jump-cell';
    cell.textContent = q.id;

    const ans = sessionAnswers[idx];
    if (ans === null) {
      cell.classList.add('cell-unanswered');
    } else if (ans.isCorrect) {
      cell.classList.add('cell-correct');
    } else {
      cell.classList.add('cell-incorrect');
    }

    if (idx === currentIndex) {
      cell.classList.add('cell-current');
    }

    cell.addEventListener('click', () => {
      currentIndex = idx;
      closeJumpModal();
      renderQuiz();
    });
    grid.appendChild(cell);
  });

  modal.classList.remove('hidden');
}

function closeJumpModal() {
  document.getElementById('jump-modal').classList.add('hidden');
}

// --- キーボードショートカット ---

function handleKeydown(e) {
  // モーダルが表示中なら Escape で閉じるのみ
  const modal = document.getElementById('jump-modal');
  if (modal && !modal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeJumpModal();
    }
    return;
  }

  // クイズ画面が非表示なら無視
  if (document.getElementById('screen-quiz').classList.contains('hidden')) return;

  const key = e.key;

  // Escape: ホームに戻る
  if (key === 'Escape') {
    e.preventDefault();
    renderStart();
    showScreen('screen-start');
    return;
  }

  // ArrowLeft: 前の問題に戻る
  if (key === 'ArrowLeft') {
    e.preventDefault();
    goToPrevQuestion();
    return;
  }

  // 未回答時: 数字キーで選択肢を選ぶ、s でスキップ
  if (!answered) {
    const choiceBtns = document.querySelectorAll('.choice-btn');
    if (key >= '1' && key <= '4') {
      const idx = parseInt(key) - 1;
      if (idx < choiceBtns.length) {
        choiceBtns[idx].click();
      }
      return;
    }
    if (key === 's' || key === 'S') {
      e.preventDefault();
      skipQuestion();
      return;
    }
  }

  // 回答後: Enter / ArrowRight で次の問題
  if (answered && (key === 'Enter' || key === 'ArrowRight')) {
    e.preventDefault();
    document.getElementById('btn-next').click();
    return;
  }
}

// --- 初期化 ---

function migrateOldProgress() {
  const oldKey = 'quiz_progress';
  const oldData = localStorage.getItem(oldKey);
  if (!oldData) return;

  const newKey = 'quiz_progress_google_network';
  if (!localStorage.getItem(newKey)) {
    localStorage.setItem(newKey, oldData);
  }
  localStorage.removeItem(oldKey);
}

function renderSelectScreen(indexData) {
  showScreen('screen-select');
  const list = document.getElementById('exam-list');
  list.innerHTML = '';

  indexData.exams.forEach(exam => {
    const card = document.createElement('button');
    card.className = 'exam-card card';
    card.innerHTML = `
      <h2 class="exam-card-title">${exam.title}</h2>
      <span class="exam-card-info">${exam.total}問</span>
    `;
    card.addEventListener('click', () => selectExam(exam.id));
    list.appendChild(card);
  });

  // バージョン表示
  const ver = indexData.version || '';
  if (ver.length >= 14) {
    const formatted = `Build: ${ver.slice(0,4)}-${ver.slice(4,6)}-${ver.slice(6,8)} ${ver.slice(8,10)}:${ver.slice(10,12)}`;
    document.getElementById('app-version-select').textContent = formatted;
  }
}

async function selectExam(examId) {
  currentExamId = examId;
  try {
    const res = await fetch(`data/${examId}.json`);
    const data = await res.json();
    allQuestions = data.questions;
    window._quizTitle = data.title;

    // バージョン表示
    const ver = data.version || '';
    if (ver.length >= 14) {
      const formatted = `Build: ${ver.slice(0,4)}-${ver.slice(4,6)}-${ver.slice(6,8)} ${ver.slice(8,10)}:${ver.slice(10,12)}`;
      document.getElementById('app-version').textContent = formatted;
    }

    renderStart();
  } catch (e) {
    console.error('Failed to load exam data:', e);
    currentExamId = null;
    alert('試験データの読み込みに失敗しました。再度お試しください。');
  }
}

async function init() {
  migrateOldProgress();

  const res = await fetch('data/index.json');
  const indexData = await res.json();
  window._indexData = indexData;

  renderSelectScreen(indexData);

  document.getElementById('btn-sequential').addEventListener('click', () => startQuiz('sequential'));
  document.getElementById('btn-random').addEventListener('click', () => startQuiz('random'));
  document.getElementById('btn-incorrect-only').addEventListener('click', startIncorrectOnly);
  document.getElementById('btn-skip').addEventListener('click', skipQuestion);
  document.getElementById('btn-prev').addEventListener('click', goToPrevQuestion);
  document.getElementById('btn-jump-grid').addEventListener('click', openJumpModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeJumpModal);
  document.getElementById('jump-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeJumpModal();
  });
  document.getElementById('btn-progress').addEventListener('click', renderProgress);
  document.getElementById('btn-home').addEventListener('click', () => {
    renderStart();
    showScreen('screen-start');
  });
  document.getElementById('btn-to-progress').addEventListener('click', renderProgress);
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('この試験の進捗データをすべてリセットしますか？')) {
      localStorage.removeItem(getStorageKey());
      renderStart();
    }
  });
  document.getElementById('btn-back').addEventListener('click', () => {
    if (!document.getElementById('screen-quiz').classList.contains('hidden')) {
      showScreen('screen-quiz');
    } else {
      renderStart();
      showScreen('screen-start');
    }
  });
  document.getElementById('btn-back-to-select').addEventListener('click', () => {
    renderSelectScreen(window._indexData);
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => applyFilter(tab.dataset.filter));
  });

  document.addEventListener('keydown', handleKeydown);
}

init();
