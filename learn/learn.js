// 学習ページ共通スクリプト。DOM 操作と Service Worker 登録のみを担う。
// 集計は learn-logic.js の純関数に委ねる。

// 学習ページを直接開いた読者にもオフライン閲覧を提供する。
// 登録は冪等なので quiz/index.html 側の登録と重複しても害はない。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

function taskIdToHref(taskId) {
  return taskId.replace('.', '-') + '.html';
}

async function loadExamData(examId) {
  const res = await fetch(`../data/${examId}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderTaskPage(examData, taskId) {
  const stats = window.LearnLogic.getTaskStats(examData, taskId);
  if (!stats) throw new Error(`unknown task: ${taskId}`);

  const meta = document.getElementById('learn-meta');
  if (meta) {
    meta.textContent =
      `この問題集で ${stats.count} 問（${stats.share}%） ／ ` +
      `ドメイン ${stats.domainId} ${stats.domainTitleJa} は公式比率 ${stats.domainWeight}%`;
    meta.hidden = false;
  }

  const ids = window.LearnLogic.getTaskQuestionIds(examData, taskId);
  const qids = document.getElementById('learn-qids');
  if (qids) {
    qids.textContent = ids.length ? ids.join(', ') : '（このタスクに分類された問題はありません）';
  }
  const qidsSection = document.getElementById('learn-qids-section');
  if (qidsSection) qidsSection.hidden = false;
}

function renderMapPage(examData, taskIds) {
  const stats = window.LearnLogic.getTasksStats(examData, taskIds);
  if (!stats) throw new Error(`unknown tasks: ${taskIds.join(',')}`);

  const meta = document.getElementById('learn-meta');
  if (meta) {
    meta.textContent =
      `この問題集で ${stats.count} 問（${stats.share}%） ／ ` +
      `タスク ${stats.taskIds.join('・')}`;
    meta.hidden = false;
  }

  const ids = window.LearnLogic.getTasksQuestionIds(examData, taskIds);
  const qids = document.getElementById('learn-qids');
  if (qids) {
    qids.textContent = ids.length ? ids.join(', ') : '（該当する問題はありません）';
  }
  const qidsSection = document.getElementById('learn-qids-section');
  if (qidsSection) qidsSection.hidden = false;
}

function renderIndexPage(examData) {
  const root = document.getElementById('learn-index');
  if (!root) return;

  const domains = examData.categories.domains;
  root.innerHTML = domains.map(domain => {
    const items = domain.tasks.map(task => {
      const stats = window.LearnLogic.getTaskStats(examData, task.id);
      const href = taskIdToHref(task.id);
      return `<li><a href="${href}">${task.id} ${task.titleJa}</a>` +
             ` <span class="learn-index-count">${stats.count}問</span></li>`;
    }).join('');
    return `<div class="learn-card learn-index-domain">` +
           `<h2>ドメイン ${domain.id} ${domain.titleJa}` +
           ` <span class="learn-index-count">公式 ${domain.weight}%</span></h2>` +
           `<ul class="learn-index-list">${items}</ul></div>`;
  }).join('');
}

(async function init() {
  const body = document.body;
  const examId = body.dataset.exam;
  if (!examId) return;

  try {
    const examData = await loadExamData(examId);
    if (body.dataset.task) {
      renderTaskPage(examData, body.dataset.task);
    } else if (body.dataset.tasks) {
      renderMapPage(examData, body.dataset.tasks.split(',').map(s => s.trim()));
    } else {
      renderIndexPage(examData);
    }
  } catch (e) {
    // データが読めなくても手書き部分は読めるようにする
    console.error('learn: failed to load exam data', e);
    const fallback = document.getElementById('learn-fallback');
    if (fallback) fallback.hidden = false;
  }
})();
