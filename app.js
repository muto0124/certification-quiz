// app.js — 資格試験学習サイト メインロジック

let currentExamId = null;  // 現在選択中の試験ID

function getStorageKey() {
  return `quiz_progress_${currentExamId}`;
}

function getCoreOnlyStorageKey() {
  return `quiz_core_only_${currentExamId}`;
}

// --- コア問題の絞り込み ---
// localStorage はプライベートモードなどで例外を投げる。チェック状態が
// 保持できなくても出題は成立するので、失敗は握りつぶして既定値へ倒す。

function isCoreOnlyEnabled() {
  if (!window._quizCoreTotal) return false;
  return document.getElementById('core-only').checked;
}

function loadCoreOnlyPreference() {
  if (!currentExamId) return false;
  try {
    return localStorage.getItem(getCoreOnlyStorageKey()) === '1';
  } catch { return false; }
}

function saveCoreOnlyPreference(enabled) {
  if (!currentExamId) return;
  try {
    localStorage.setItem(getCoreOnlyStorageKey(), enabled ? '1' : '0');
  } catch { /* 設定の保持を諦める */ }
}

// --- ドメイン／タスクの絞り込み ---
// 分類データ（categories）を持つ試験だけで使う。選択は
// 'all' | 'd:{ドメインID}' | 't:{タスクID}' の1文字列で、試験ごとに保存する。

function getCategoryStorageKey() {
  return `quiz_category_${currentExamId}`;
}

function getSelectedCategory() {
  if (!window._quizCategories) return window.QuizLogic.ALL_CATEGORY;
  return document.getElementById('category-select').value || window.QuizLogic.ALL_CATEGORY;
}

function loadCategoryPreference() {
  if (!currentExamId) return window.QuizLogic.ALL_CATEGORY;
  try {
    return localStorage.getItem(getCategoryStorageKey()) || window.QuizLogic.ALL_CATEGORY;
  } catch { return window.QuizLogic.ALL_CATEGORY; }
}

function saveCategoryPreference(value) {
  if (!currentExamId) return;
  try {
    localStorage.setItem(getCategoryStorageKey(), value);
  } catch { /* 設定の保持を諦める */ }
}

let allQuestions = [];   // data.json から読み込んだ全問題
let sessionQuestions = []; // 今回の出題リスト（範囲・シャッフル済み）
let currentIndex = 0;    // sessionQuestions 内の現在位置
let answered = false;    // 現在の問題を回答済みか
let sessionAnswers = []; // セッション内の回答状態 (null=未回答, {selected, isCorrect}=回答済み)
let currentMode = 'sequential';
let currentCoreOnly = false; // 今回の出題を代表問に絞ったか（バッジ表示用）
let currentCategory = 'all'; // 今回の出題をどのドメイン／タスクに絞ったか（バッジ表示用）
// 同系問リンクで飛ぶ前の出題状態。飛んだ先から続けて飛べるよう積み上げ、戻るたびに 1 つ取り出す
let returnStack = [];

// --- 進捗管理 ---

function loadProgress() {
  if (!currentExamId) return { progress: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(getStorageKey())) || {};
    const progress = parsed && typeof parsed.progress === 'object' && parsed.progress
      ? parsed.progress
      : {};
    return { ...parsed, progress };
  } catch { return { progress: {} }; }
}

function saveProgress(data) {
  if (!currentExamId) return;
  localStorage.setItem(getStorageKey(), JSON.stringify(data));
}

function recordAnswer(questionId, isCorrect) {
  const data = loadProgress();
  if (!data.progress || typeof data.progress !== 'object') data.progress = {};
  if (!data.progress[questionId]) data.progress[questionId] = { history: [] };
  data.progress[questionId].history.push(isCorrect ? 'correct' : 'incorrect');
  data.progress[questionId].lastAnsweredAt = new Date().toISOString();
  saveProgress(data);
}

function getQuestionProgress(questionId) {
  const data = loadProgress();
  return data.progress[questionId] || { history: [] };
}

// --- 中断データ ---
// sessionStorage はプライベートモードなどで例外を投げる。中断データは
// 無くても出題そのものは成立するので、失敗は握りつぶして先へ進める。

function saveSessionSnapshot() {
  try {
    const snapshot = window.QuizLogic.buildSessionSnapshot(
      currentExamId, currentMode, sessionQuestions, currentIndex, sessionAnswers,
    );
    sessionStorage.setItem(window.QuizLogic.SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch { /* 中断データを諦める */ }
}

function loadSessionSnapshot() {
  try {
    return JSON.parse(sessionStorage.getItem(window.QuizLogic.SESSION_STORAGE_KEY));
  } catch { return null; }
}

function clearSessionSnapshot() {
  try {
    sessionStorage.removeItem(window.QuizLogic.SESSION_STORAGE_KEY);
  } catch { /* 中断データを諦める */ }
}

// --- 画面切り替え ---

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// --- スタート画面 ---

function renderStart() {
  // 新しい出題はすべてスタート画面から始まるので、ここで戻り先を捨てる
  returnStack = [];
  currentMode = 'sequential';
  showScreen('screen-start');
  document.getElementById('quiz-title').textContent = allQuestions.length
    ? window._quizTitle : '';
  document.getElementById('range-end').value = allQuestions.length;
  document.getElementById('range-start').max = allQuestions.length;
  document.getElementById('range-end').max = allQuestions.length;
  showStartMessage('');

  // サマリー表示
  const data = loadProgress();
  const { answered, rate } = window.QuizLogic.getLatestOverallStats(data.progress);
  document.getElementById('summary-text').innerHTML =
    `<strong>${allQuestions.length}</strong>問中 <strong>${answered}</strong>問回答済み ／ 正答率 <strong>${rate}%</strong>`;

  // 学習資料へのリンクは分類データを持つ試験でのみ表示する
  document.getElementById('learn-link')
    .classList.toggle('hidden', !window._quizCategories);

  // コア問題の絞り込みはコアセットを持つ試験でのみ表示する
  const coreTotal = window._quizCoreTotal;
  document.getElementById('core-only-toggle').classList.toggle('hidden', !coreTotal);
  if (coreTotal) {
    document.getElementById('core-only').checked = loadCoreOnlyPreference();
  }

  // 選択 UI を先に組み立てる。件数と統計はそこで選ばれた値を読むため。
  renderCategorySelect();
  updateRangeSummary();

  renderResumeCard('resume-card-start', currentExamId);
}

function buildCategoryOption(item) {
  const option = document.createElement('option');
  option.value = item.value;
  option.textContent = `${item.label}（${item.count}問）`;
  return option;
}

// 選択肢のラベルに出す件数は、コアのみトグルの ON/OFF を反映させる。
// 全問の件数のままだと「ドメイン1 全体（103問）」を選んだのに 54 問しか
// 出題されない、という食い違いが起きるため、トグルの変更時に組み直す。
function renderCategorySelect() {
  const wrap = document.getElementById('category-select-wrap');
  const select = document.getElementById('category-select');
  const entries = window.QuizLogic.getCategoryOptions(
    window._quizCategories,
    window.QuizLogic.filterCoreOnly(allQuestions, isCoreOnlyEnabled()),
  );

  const previous = select.value;

  wrap.classList.toggle('hidden', entries.length === 0);
  select.innerHTML = '';
  if (!entries.length) return;

  const values = [];
  for (const entry of entries) {
    if (!entry.group) {
      select.appendChild(buildCategoryOption(entry));
      values.push(entry.value);
      continue;
    }

    const optgroup = document.createElement('optgroup');
    optgroup.label = entry.group;
    for (const item of entry.options) {
      optgroup.appendChild(buildCategoryOption(item));
      values.push(item.value);
    }
    select.appendChild(optgroup);
  }

  // 組み直しでは画面上の選択を優先する。トグル操作のたびに保存値へ
  // 戻ると、選んだドメインが勝手に変わってしまうため。
  // 候補に無ければ「全範囲」へ倒す（データ再生成でタスク構成が変わり、
  // 消えたタスク ID が残って 0 問になるのを防ぐ）。
  const preferred = previous || loadCategoryPreference();
  select.value = values.includes(preferred) ? preferred : window.QuizLogic.ALL_CATEGORY;
}

// コア件数・統計行・No. 入力の有効無効をまとめて更新する。ドメイン選択と
// コアのみトグルはどちらを動かしても3つすべてに影響するため、1か所に集約する。
function updateRangeSummary() {
  const selection = getSelectedCategory();
  const isAll = selection === window.QuizLogic.ALL_CATEGORY;

  // ドメイン／タスクで絞っている間は No. 範囲を使わない。二重の絞り込みで
  // 0 問になったときに理由が読み取れなくなるため。
  ['range-start', 'range-end'].forEach((id) => {
    document.getElementById(id).disabled = !isAll;
  });
  document.getElementById('range-inputs').classList.toggle('is-disabled', !isAll);

  // トグルのラベル件数は試験全体の coreTotal ではなく、いま選んでいる範囲の中で数える
  if (window._quizCoreTotal) {
    document.getElementById('core-only-count').textContent = getScopedQuestions(true).length;
  }

  if (!window._quizCategories) return;

  const stats = window.QuizLogic.getCategoryStats(
    window._quizCategories,
    getSelectedRangeQuestions(),
    loadProgress().progress,
    selection,
  );
  const parts = [
    `${stats.count}問中 ${stats.answered}問回答済み`,
    `正答率 ${stats.rate}%`,
  ];
  if (stats.weight != null) {
    // 試験ガイドの比率はドメインにしか付かないため、タスク選択時は親ドメインを明示する
    parts.push(stats.isTask
      ? `試験比率 ${stats.weight}%（ドメイン${stats.domainId}）`
      : `試験比率 ${stats.weight}%`);
  }
  document.getElementById('category-stats').textContent = parts.join(' ／ ');
}

// 0 問になった理由を出し分ける。ドメイン／タスクの絞り込みとコアのみを
// 重ねると 0 問になり得るため、どちらの条件で消えたのかを文言で示す。
function getScopeLabel() {
  const selection = getSelectedCategory();
  if (selection === window.QuizLogic.ALL_CATEGORY) return '範囲内';
  return selection.startsWith('t:') ? 'このタスク' : 'このドメイン';
}

function showStartMessage(text) {
  const msg = document.getElementById('incorrect-only-msg');
  clearTimeout(showStartMessage.timerId);

  if (!text) {
    msg.textContent = '';
    msg.classList.add('hidden');
    return;
  }

  msg.textContent = text;
  msg.classList.remove('hidden');
  showStartMessage.timerId = setTimeout(() => msg.classList.add('hidden'), 3000);
}

function applyNumberRange(questions) {
  const startVal = parseInt(document.getElementById('range-start').value) || 1;
  const endVal = parseInt(document.getElementById('range-end').value) || allQuestions.length;
  const start = Math.max(1, Math.min(startVal, allQuestions.length));
  const end = Math.max(start, Math.min(endVal, allQuestions.length));

  return questions.filter(q => q.id >= start && q.id <= end);
}

// 出題範囲の絞り込みはこの1本に集約する。コアのみだけ引数で切り替えられるのは、
// トグルのラベル件数（コアにしたら何問になるか）を同じ経路で数えるため。
function getScopedQuestions(coreOnly) {
  const selection = getSelectedCategory();
  const byCategory = window.QuizLogic.filterByCategory(allQuestions, selection);
  // No. 範囲は「全範囲」のときだけ効かせる。ドメイン選択中は入力を disabled に
  // しているため、値が残っていても適用しない。
  const scoped = selection === window.QuizLogic.ALL_CATEGORY
    ? applyNumberRange(byCategory)
    : byCategory;
  return window.QuizLogic.filterCoreOnly(scoped, coreOnly);
}

function getSelectedRangeQuestions() {
  return getScopedQuestions(isCoreOnlyEnabled());
}

function startQuiz(mode) {
  document.getElementById('completion-message').classList.add('hidden');
  showStartMessage('');
  currentMode = mode;

  // id は 1-based
  currentCoreOnly = isCoreOnlyEnabled();
  currentCategory = getSelectedCategory();
  sessionQuestions = getSelectedRangeQuestions();
  if (sessionQuestions.length === 0) {
    showStartMessage(currentCoreOnly
      ? `${getScopeLabel()}に代表問がありません`
      : `${getScopeLabel()}に問題がありません`);
    return;
  }
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
  currentMode = 'incorrect-only';
  const data = loadProgress();
  const coreOnly = isCoreOnlyEnabled();
  currentCoreOnly = coreOnly;
  currentCategory = getSelectedCategory();
  // このモードだけは No. 範囲を見ない（不正解は試験全体から拾う）。
  // ドメイン／タスクの絞り込みは効かせる。
  const pool = window.QuizLogic.filterCoreOnly(
    window.QuizLogic.filterByCategory(allQuestions, currentCategory),
    coreOnly,
  );
  const incorrectIds = pool.filter(q => {
    const p = data.progress[q.id];
    if (!p || p.history.length === 0) return false;
    return p.history[p.history.length - 1] === 'incorrect';
  });

  if (incorrectIds.length === 0) {
    showStartMessage(coreOnly
      ? `${getScopeLabel()}の代表問に不正解はありません`
      : `${getScopeLabel()}に不正解の問題はありません`);
    return;
  }

  showStartMessage('');
  sessionQuestions = [...incorrectIds].sort(() => Math.random() - 0.5);
  currentIndex = 0;
  sessionAnswers = new Array(sessionQuestions.length).fill(null);
  renderQuiz();
  showScreen('screen-quiz');
}

function startReviewMode() {
  document.getElementById('completion-message').classList.add('hidden');
  const data = loadProgress();
  const reviewCandidates = window.QuizLogic.getReviewCandidates(
    getSelectedRangeQuestions(),
    data.progress,
  );

  if (reviewCandidates.length === 0) {
    showStartMessage(isCoreOnlyEnabled()
      ? `${getScopeLabel()}の代表問に回答済みの復習対象がありません`
      : `${getScopeLabel()}に回答済みの復習対象がありません`);
    return;
  }

  showStartMessage('');
  currentMode = 'review';
  currentCoreOnly = isCoreOnlyEnabled();
  currentCategory = getSelectedCategory();
  sessionQuestions = reviewCandidates.map((item) => item.question);
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
  if (currentIndex === 0 && returnStack.length) {
    returnToOrigin();
    return;
  }
  if (currentIndex <= 0) return;
  currentIndex--;
  renderQuiz();
}

function goToNextQuestion() {
  const nextState = window.QuizLogic.getNextQuestionState(
    currentIndex, sessionQuestions.length, getReturnQuestionId(),
  );
  if (nextState.isLast && returnStack.length) {
    returnToOrigin();
    return;
  }
  if (nextState.isLast) {
    clearSessionSnapshot();
    renderStart();
    showScreen('screen-start');
    return;
  }

  currentIndex++;
  renderQuiz();
}

function updatePrevQuestionButton() {
  const button = document.getElementById('btn-prev');
  const returnId = currentIndex === 0 ? getReturnQuestionId() : null;
  button.textContent = returnId === null ? '◀ 戻る' : `◀ #${returnId} に戻る`;
  button.disabled = currentIndex === 0 && returnId === null;
}

function updateNextQuestionButtons() {
  const nextState = window.QuizLogic.getNextQuestionState(
    currentIndex, sessionQuestions.length, getReturnQuestionId(),
  );

  ['btn-next-top', 'btn-next'].forEach((id) => {
    const button = document.getElementById(id);
    button.textContent = nextState.label;
    button.onclick = goToNextQuestion;
  });
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

function isAnsweredState(answerState) {
  return Boolean(answerState && answerState.isSubmitted);
}

// 出題中の絞り込みをバッジで短く示す。ドメインは 'ドメイン1'、
// タスクは '1.5'。全範囲のときは何も足さない。
function getCategoryBadgeLabel(selection) {
  if (!selection || selection === window.QuizLogic.ALL_CATEGORY) return '';
  const [kind, id] = String(selection).split(':');
  if (!id) return '';
  return kind === 'd' ? `ドメイン${id}` : id;
}

function updateModeBadge() {
  const labels = [];
  if (currentMode === 'review') labels.push('復習モード');
  const categoryLabel = getCategoryBadgeLabel(currentCategory);
  if (categoryLabel) labels.push(categoryLabel);
  if (currentCoreOnly) labels.push('コアのみ');

  const badge = document.getElementById('quiz-mode-badge');
  badge.textContent = labels.join(' ／ ');
  badge.classList.toggle('hidden', labels.length === 0);
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
  renderCoreInfoForQuestion(q);
  renderLearnLinkForQuestion(q);
  document.getElementById('explanation-panel').classList.remove('hidden');
  document.getElementById('btn-skip').classList.add('hidden');
  document.getElementById('btn-submit').classList.add('hidden');
  document.getElementById('selection-hint').classList.add('hidden');

  const navArea = document.getElementById('nav-area');
  navArea.classList.remove('hidden');
  document.getElementById('btn-next-top').classList.remove('hidden');
  updateNextQuestionButtons();
}

function renderPendingAnswer(q, selectedLabels) {
  document.getElementById('explanation-panel').classList.add('hidden');
  document.getElementById('nav-area').classList.add('hidden');
  document.getElementById('btn-next-top').classList.add('hidden');
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
    clearSessionSnapshot();
    renderStart();
    showScreen('screen-start');
    showCompletionMessage();
    return;
  }
  saveSessionSnapshot();

  const q = sessionQuestions[currentIndex];
  const answerState = sessionAnswers[currentIndex];
  const selectedLabels = answerState?.selected || [];
  answered = isAnsweredState(answerState);

  document.getElementById('quiz-counter').textContent =
    `問題 ${q.id} （${currentIndex + 1} / ${sessionQuestions.length}）`;
  updateModeBadge();

  updatePrevQuestionButton();
  document.getElementById('question-text').innerHTML = window.QuizLogic.formatQuestionText(q.question);

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

  if (pendingScrollToExplanation) {
    pendingScrollToExplanation = false;
    scrollToExplanation();
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

// --- 学習資料へのリンク ---
// categories を持つ試験（現状 API2 のみ）でだけ出す。タスク ID の "1.3" が
// learn/1-3.html に対応する。

function taskIdToLearnHref(taskId) {
  return `learn/${String(taskId).replace('.', '-')}.html`;
}

function findTaskTitleJa(taskId) {
  const domains = (window._quizCategories && window._quizCategories.domains) || [];
  for (const domain of domains) {
    for (const task of (domain.tasks || [])) {
      if (task.id === taskId) return task.titleJa;
    }
  }
  return null;
}

function renderLearnLinkForQuestion(q) {
  const box = document.getElementById('exp-learn-link');
  const titleJa = q.category ? findTaskTitleJa(q.category) : null;

  if (!titleJa) {
    box.innerHTML = '';
    box.classList.add('hidden');
    return;
  }

  const label = `📘 このタスクの学習資料を読む — ${q.category} ${window.QuizLogic.escapeHtml(titleJa)}`;
  box.innerHTML = `<a class="btn btn-secondary" href="${taskIdToLearnHref(q.category)}">${label}</a>`;
  box.classList.remove('hidden');
}

// 知識点と、同じ知識点を問う問題への導線。コアセットを持たない試験では何も出さない。
function renderCoreInfoForQuestion(q) {
  const box = document.getElementById('exp-core-info');
  const esc = window.QuizLogic.escapeHtml;
  box.innerHTML = '';

  if (q.core === true) {
    let html = `<p><strong>🎯 知識点:</strong> ${esc(q.coreLabel)}</p>`;
    if (q.related && q.related.length) {
      const buttons = q.related
        .map((id) => `<button type="button" data-jump="${id}">#${id}</button>`)
        .join('');
      html += `<p class="exp-core-related"><strong>同系問:</strong> ${buttons}</p>`;
    } else {
      html += '<p>この知識点を問う問題は他にありません。</p>';
    }
    box.innerHTML = html;
  } else if (q.coreOf) {
    box.innerHTML = '<p>この問題は代表問 '
      + `<span class="exp-core-related"><button type="button" data-jump="${q.coreOf}">#${q.coreOf}</button></span>`
      + ' と同じ知識点です。</p>';
  } else {
    box.classList.add('hidden');
    return;
  }

  box.querySelectorAll('button[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => jumpToRelatedQuestion(Number(btn.dataset.jump)));
  });
  box.classList.remove('hidden');
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

// 進捗一覧の「解く」から。今の出題を離れて新しく始めるので戻り先は持たない
function jumpToQuestion(qid) {
  returnStack = [];
  openSingleQuestion(qid);
}

// 解説の同系問リンクから。解説を読んでいる途中なので、今の出題へ戻れるようにしておく
function jumpToRelatedQuestion(qid) {
  returnStack.push({
    mode: currentMode,
    coreOnly: currentCoreOnly,
    category: currentCategory,
    questions: sessionQuestions,
    index: currentIndex,
    answers: sessionAnswers,
  });
  openSingleQuestion(qid);
  // 解説の末尾から飛ぶので、そのままだと飛んだ先の問題文が画面外に残る
  window.scrollTo(0, 0);
}

function getReturnQuestionId() {
  const origin = returnStack[returnStack.length - 1];
  return origin ? origin.questions[origin.index].id : null;
}

// 飛ぶ前の出題を回答状態ごと戻す。読んでいた解説の位置へスクロールする
function returnToOrigin() {
  const origin = returnStack.pop();
  if (!origin) return;

  currentMode = origin.mode;
  currentCoreOnly = origin.coreOnly;
  currentCategory = origin.category;
  sessionQuestions = origin.questions;
  currentIndex = origin.index;
  sessionAnswers = origin.answers;
  pendingScrollToExplanation = true;
  renderQuiz();
}

function openSingleQuestion(qid) {
  // 指定問題を先頭にして順番通りモードで開始
  currentMode = 'sequential';
  currentCoreOnly = false;
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

// --- 中断データからの復帰 ---
const RESUME_HASH = '#resume';

// 復帰した直後の 1 回だけ解説パネルへスクロールする。読者は解説の途中から
// 学習資料へ抜けているので、問題文の頭に戻されると読んでいた場所を見失う。
let pendingScrollToExplanation = false;

function scrollToExplanation() {
  const panel = document.getElementById('explanation-panel');
  if (panel && !panel.classList.contains('hidden')) {
    panel.scrollIntoView({ block: 'start' });
  }
}

async function resumeFromSnapshot(snapshot) {
  const described = window.QuizLogic.describeSnapshot(snapshot);
  if (!described) return false;

  const exams = (window._indexData && window._indexData.exams) || [];
  if (!exams.some((exam) => exam.id === described.examId)) return false;

  // 同じ試験が既に読み込まれているなら取り直さない。スタート画面の復帰カードは
  // その試験のデータで検証してから出しているので、ここで再取得すると
  // 一時的な通信失敗だけで有効な中断データを捨てることになる。
  if (currentExamId !== described.examId
      && !(await loadExamData(described.examId))) {
    return false;
  }

  const restored = window.QuizLogic.restoreSessionSnapshot(snapshot, allQuestions);
  if (!restored) {
    // currentExamId / allQuestions は既に書き換え済みなので、他のセッション状態も
    // 揃えておく（この経路では再描画しないため実害は無いが、不変条件を保つ）
    sessionQuestions = [];
    currentIndex = 0;
    sessionAnswers = [];
    return false;
  }

  currentMode = restored.mode;
  sessionQuestions = restored.questions;
  currentIndex = restored.index;
  sessionAnswers = restored.answers;

  pendingScrollToExplanation = true;
  // #screen-quiz は hidden の間 display:none で、scrollIntoView は
  // 非表示祖先の中では何もしない。先に画面を表示してから描画する。
  showScreen('screen-quiz');
  renderQuiz();
  return true;
}

// 復帰カード。expectedExamId が null なら試験を問わず出し、文言に試験名を含める
//（試験選択画面。AIP と API2 はほぼ同名なので試験名が無いと区別できない）。
// 文字列を渡した場合はその試験の中断データのときだけ出す（スタート画面）。
function renderResumeCard(cardId, expectedExamId) {
  const card = document.getElementById(cardId);
  const snapshot = loadSessionSnapshot();
  const described = window.QuizLogic.describeSnapshot(snapshot);
  const exams = (window._indexData && window._indexData.exams) || [];
  const exam = described ? exams.find((item) => item.id === described.examId) : null;
  const wanted = expectedExamId === null || (described && described.examId === expectedExamId);

  // スタート画面は試験データを読み込み済みなので、問題 ID が現在のデータに
  // 存在するかまで確かめる。試験選択画面はまだデータを持たないので形だけを見て、
  // 押された時点で復帰に失敗したら中断データを捨てる（下の go ハンドラ）。
  const restorable = expectedExamId === null
    || Boolean(window.QuizLogic.restoreSessionSnapshot(snapshot, allQuestions));

  if (!described || !exam || !wanted || !restorable) {
    card.innerHTML = '';
    card.classList.add('hidden');
    return;
  }

  const where = expectedExamId === null
    ? `${window.QuizLogic.escapeHtml(exam.title)} ／ 問題 ${described.questionId}`
    : `問題 ${described.questionId}`;

  card.innerHTML =
    `<button class="btn btn-primary btn-sm resume-card-go">` +
    `▶ 中断した出題に戻る — ${where}（${described.position}/${described.total}問目）</button>` +
    `<button class="btn btn-secondary btn-sm resume-card-dismiss">✕</button>`;
  card.classList.remove('hidden');

  card.querySelector('.resume-card-go').addEventListener('click', async () => {
    if (await resumeFromSnapshot(loadSessionSnapshot())) return;

    // 復帰できない中断データは残しておいても押すたびに黙って失敗するだけなので捨てる
    clearSessionSnapshot();
    renderSelectScreen(window._indexData);
  });
  card.querySelector('.resume-card-dismiss').addEventListener('click', () => {
    clearSessionSnapshot();
    card.innerHTML = '';
    card.classList.add('hidden');
  });
}

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

  renderResumeCard('resume-card-select', null);
}

// 試験データの読み込みだけを行う。画面遷移は呼び出し側の責務。
// スタート画面へ進む selectExam と、問題画面へ直行する復帰の両方から使う。
async function loadExamData(examId) {
  try {
    const res = await fetch(`data/${examId}.json`);
    const data = await res.json();
    currentExamId = examId;
    allQuestions = data.questions;
    window._quizTitle = data.title;
    window._quizCategories = data.categories || null;
    window._quizCoreTotal = data.coreTotal || null;

    // バージョン表示
    const ver = data.version || '';
    if (ver.length >= 14) {
      const formatted = `Build: ${ver.slice(0,4)}-${ver.slice(4,6)}-${ver.slice(6,8)} ${ver.slice(8,10)}:${ver.slice(10,12)}`;
      document.getElementById('app-version').textContent = formatted;
    }
    return true;
  } catch (e) {
    console.error('Failed to load exam data:', e);
    currentExamId = null;
    return false;
  }
}

async function selectExam(examId) {
  if (!(await loadExamData(examId))) {
    alert('試験データの読み込みに失敗しました。再度お試しください。');
    return;
  }
  renderStart();
}

async function init() {
  migrateOldProgress();

  const res = await fetch('data/index.json');
  const indexData = await res.json();
  window._indexData = indexData;

  // イベントハンドラは、復帰で問題画面へ直行する場合でも操作可能でなければ
  // ならないため、選択画面の描画・復帰の試行より先に登録する。
  document.getElementById('btn-sequential').addEventListener('click', () => startQuiz('sequential'));
  document.getElementById('btn-random').addEventListener('click', () => startQuiz('random'));
  document.getElementById('btn-incorrect-only').addEventListener('click', startIncorrectOnly);
  document.getElementById('btn-review').addEventListener('click', startReviewMode);
  document.getElementById('core-only').addEventListener('change', (e) => {
    saveCoreOnlyPreference(e.target.checked);
    renderCategorySelect();
    updateRangeSummary();
    showStartMessage('');
  });
  document.getElementById('category-select').addEventListener('change', (e) => {
    saveCategoryPreference(e.target.value);
    updateRangeSummary();
    showStartMessage('');
  });
  // No. 範囲を触っても統計行が実際の出題対象を示すようにする
  ['range-start', 'range-end'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateRangeSummary);
  });
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

  // ハッシュは先に消す。#resume の付いた URL をブックマークされると
  // 後日開いたときに意味が変わるため。replaceState なので履歴は増えず、
  // ブラウザバックで学習ページへ戻る動きは保たれる。
  let resumed = false;
  if (location.hash === RESUME_HASH) {
    history.replaceState(null, '', location.pathname + location.search);
    resumed = await resumeFromSnapshot(loadSessionSnapshot());
  }

  // 復帰に失敗した（または #resume が無かった）場合だけ試験選択画面を描画する。
  // 復帰が成功した経路では選択画面を経由せず問題画面へ直行するため、
  // ここで描画すると一瞬でも試験一覧がちらついてしまう。
  if (!resumed) {
    renderSelectScreen(indexData);
  }
}

init();
