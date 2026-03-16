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

// --- ユーティリティ ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatQuestionText(text) {
  const bulletRe = /[•・]/;
  if (!bulletRe.test(text)) {
    return escapeHtml(text);
  }
  const firstIdx = text.search(bulletRe);
  const prefix = text.substring(0, firstIdx).trim();
  const bulletPart = text.substring(firstIdx);
  const items = bulletPart.split(/[•・]/).map(s => s.trim()).filter(s => s.length > 0);

  // 最後のセグメントから後続テキスト（箇条書き外の文章）を分離
  let suffix = '';
  if (items.length > 0) {
    const last = items[items.length - 1];
    const periodIdx = last.indexOf('。');
    if (periodIdx !== -1 && periodIdx < last.length - 1) {
      // 「。」の後にテキストが続く → 後続文として分離
      items[items.length - 1] = last.substring(0, periodIdx + 1);
      suffix = last.substring(periodIdx + 1).trim();
    } else if (periodIdx === -1) {
      // 「。」なし → 質問パターンで分割を試行
      const qMatch = last.match(/(何を|どう|どの|どのように|この|これらの).*$/);
      if (qMatch && qMatch.index > 0) {
        items[items.length - 1] = last.substring(0, qMatch.index).trim();
        suffix = qMatch[0].trim();
      }
    }
  }

  let html = '';
  if (prefix) html += escapeHtml(prefix);
  html += '<ul>' + items.map(item => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>';
  if (suffix) html += escapeHtml(suffix);
  return html;
}

function isAnsweredState(answerState) {
  return Boolean(answerState && answerState.isSubmitted);
}

function renderSubmittedAnswer(q, answerState) {
  const correctLabels = window.QuizLogic.getAnswerLabels(q.answer);

  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    const label = btn.dataset.label;
    if (correctLabels.includes(label)) {
      btn.classList.add('correct');
    } else if (answerState.selected.includes(label)) {
      btn.classList.add('incorrect');
    }
  });

  renderExplanation(q.explanation);
  document.getElementById('explanation-panel').classList.remove('hidden');
  document.getElementById('btn-skip').classList.add('hidden');
  document.getElementById('btn-submit').classList.add('hidden');
  document.getElementById('selection-hint').classList.add('hidden');

  const navArea = document.getElementById('nav-area');
  navArea.classList.remove('hidden');

  const nextBtn = document.getElementById('btn-next');
  const isLast = currentIndex === sessionQuestions.length - 1;
  nextBtn.textContent = isLast ? 'スタートに戻る' : '次の問題 →';
  nextBtn.onclick = () => {
    if (isLast) {
      renderStart();
      showScreen('screen-start');
    } else {
      currentIndex++;
      renderQuiz();
    }
  };
}

function renderPendingAnswer(q, selectedLabels) {
  document.getElementById('explanation-panel').classList.add('hidden');
  document.getElementById('nav-area').classList.add('hidden');
  document.getElementById('btn-skip').classList.remove('hidden');

  const selectionHint = document.getElementById('selection-hint');
  const submitBtn = document.getElementById('btn-submit');
  const isMultiAnswer = window.QuizLogic.isMultiAnswerQuestion(q);

  if (isMultiAnswer) {
    selectionHint.textContent = '複数選択問題です。正しい選択肢をすべて選んでから「回答する」を押してください。';
    selectionHint.classList.remove('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = selectedLabels.length === 0;
  } else {
    selectionHint.classList.add('hidden');
    submitBtn.classList.add('hidden');
  }

  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = false;
    btn.classList.toggle('selected', selectedLabels.includes(btn.dataset.label));
  });
}

function submitCurrentAnswer() {
  if (answered) return;

  const q = sessionQuestions[currentIndex];
  const selectedLabels = sessionAnswers[currentIndex]?.selected || [];
  if (selectedLabels.length === 0) return;

  const normalizedSelection = window.QuizLogic.getAnswerLabels(selectedLabels);
  const isCorrect = window.QuizLogic.evaluateAnswer(q.answer, normalizedSelection);

  recordAnswer(q.id, isCorrect);
  sessionAnswers[currentIndex] = {
    selected: normalizedSelection,
    isCorrect,
    isSubmitted: true,
  };
  answered = true;
  renderQuiz();
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
  const answerState = sessionAnswers[currentIndex];
  const selectedLabels = answerState?.selected || [];
  answered = isAnsweredState(answerState);

  document.getElementById('quiz-counter').textContent =
    `問題 ${q.id} （${currentIndex + 1} / ${sessionQuestions.length}）`;

  document.getElementById('btn-prev').disabled = currentIndex === 0;
  document.getElementById('question-text').innerHTML = formatQuestionText(q.question);

  const choicesDiv = document.getElementById('choices');
  choicesDiv.innerHTML = '';
  for (const [label, text] of Object.entries(q.choices)) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `<span class="choice-label">${label}</span><span>${text.replace(/\n/g, '<br>')}</span>`;
    btn.dataset.label = label;
    btn.setAttribute('aria-pressed', String(selectedLabels.includes(label)));
    btn.addEventListener('click', () => onChoiceSelected(label, q));
    choicesDiv.appendChild(btn);
  }

  if (answered) {
    renderSubmittedAnswer(q, answerState);
  } else {
    renderPendingAnswer(q, selectedLabels);
  }
}

function onChoiceSelected(selected, q) {
  if (answered) return;

  if (window.QuizLogic.isMultiAnswerQuestion(q)) {
    const currentSelection = sessionAnswers[currentIndex]?.selected || [];
    const nextSelection = window.QuizLogic.toggleSelection(currentSelection, selected);

    sessionAnswers[currentIndex] = nextSelection.length
      ? { selected: nextSelection, isSubmitted: false }
      : null;

    renderQuiz();
    return;
  }

  const normalizedSelection = window.QuizLogic.getAnswerLabels([selected]);
  const isCorrect = window.QuizLogic.evaluateAnswer(q.answer, normalizedSelection);

  recordAnswer(q.id, isCorrect);
  sessionAnswers[currentIndex] = {
    selected: normalizedSelection,
    isCorrect,
    isSubmitted: true,
  };
  answered = true;
  renderQuiz();
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
    if (!isAnsweredState(ans)) {
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
  const modal = document.getElementById('jump-modal');
  if (modal && !modal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeJumpModal();
    }
    return;
  }

  if (document.getElementById('screen-quiz').classList.contains('hidden')) return;

  const key = e.key;

  if (key === 'Escape') {
    e.preventDefault();
    renderStart();
    showScreen('screen-start');
    return;
  }

  if (key === 'ArrowLeft') {
    e.preventDefault();
    goToPrevQuestion();
    return;
  }

  if (!answered) {
    const choiceBtns = document.querySelectorAll('.choice-btn');
    if (/^[1-5]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (idx < choiceBtns.length) {
        e.preventDefault();
        choiceBtns[idx].click();
      }
      return;
    }

    if (key === 'Enter') {
      const submitBtn = document.getElementById('btn-submit');
      if (!submitBtn.classList.contains('hidden') && !submitBtn.disabled) {
        e.preventDefault();
        submitBtn.click();
        return;
      }
    }

    if (key === 's' || key === 'S') {
      e.preventDefault();
      skipQuestion();
      return;
    }
  }

  if (answered && (key === 'Enter' || key === 'ArrowRight')) {
    e.preventDefault();
    document.getElementById('btn-next').click();
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
  document.getElementById('btn-submit').addEventListener('click', submitCurrentAnswer);
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
