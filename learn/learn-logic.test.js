const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getKnownTaskIds,
  getTaskStats,
  getTaskQuestionIds,
} = require('./learn-logic.js');

// --- テスト用の最小データ ---
const sample = {
  categories: {
    domains: [
      {
        id: '1', weight: 31, title: 'D1', titleJa: 'ドメイン1',
        tasks: [
          { id: '1.1', title: 'T11', titleJa: 'タスク1.1' },
          { id: '1.2', title: 'T12', titleJa: 'タスク1.2' },
        ],
      },
      {
        id: '2', weight: 26, title: 'D2', titleJa: 'ドメイン2',
        tasks: [{ id: '2.1', title: 'T21', titleJa: 'タスク2.1' }],
      },
    ],
  },
  questions: [
    { id: 3, category: '1.1' },
    { id: 1, category: '1.1' },
    { id: 2, category: '2.1' },
    { id: 4, category: '2.1' },
  ],
};

// タスクIDは宣言順
assert.deepEqual(getKnownTaskIds(sample), ['1.1', '1.2', '2.1']);
assert.deepEqual(getKnownTaskIds({ questions: [] }), []);

// 統計
const s = getTaskStats(sample, '1.1');
assert.equal(s.taskId, '1.1');
assert.equal(s.taskTitleJa, 'タスク1.1');
assert.equal(s.domainId, '1');
assert.equal(s.domainTitleJa, 'ドメイン1');
assert.equal(s.domainWeight, 31);
assert.equal(s.count, 2);
assert.equal(s.share, 50);

// 問題が 0 件のタスクも統計は返す
assert.equal(getTaskStats(sample, '1.2').count, 0);
assert.equal(getTaskStats(sample, '1.2').share, 0);

// 未知のタスクIDは null
assert.equal(getTaskStats(sample, '9.9'), null);
assert.equal(getTaskStats({ questions: [] }, '1.1'), null);

// 問題番号は昇順
assert.deepEqual(getTaskQuestionIds(sample, '1.1'), [1, 3]);
assert.deepEqual(getTaskQuestionIds(sample, '9.9'), []);

// share は小数第1位に丸める（44 / 268 = 16.417... -> 16.4）
const big = {
  categories: { domains: [{ id: '1', weight: 31, title: 'D', titleJa: 'D', tasks: [{ id: '1.5', title: 'T', titleJa: 'T' }] }] },
  questions: Array.from({ length: 268 }, (_, i) => ({ id: i + 1, category: i < 44 ? '1.5' : '9.9' })),
};
assert.equal(getTaskStats(big, '1.5').share, 16.4);

// --- 整合テスト: 全ページの data-exam / data-task が実データと一致すること ---
const learnDir = __dirname;
const pages = fs.readdirSync(learnDir)
  .filter(f => f.endsWith('.html') && f !== 'index.html');

assert.ok(pages.length > 0, '学習ページが 1 つも見つかりません');

const examCache = {};
function loadExam(examId) {
  if (!examCache[examId]) {
    const p = path.join(learnDir, '..', 'data', `${examId}.json`);
    examCache[examId] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return examCache[examId];
}

for (const file of pages) {
  const html = fs.readFileSync(path.join(learnDir, file), 'utf8');
  const body = html.match(/<body([^>]*)>/);
  assert.ok(body, `${file}: <body> タグが見つかりません`);

  const exam = body[1].match(/data-exam="([^"]+)"/);
  const task = body[1].match(/data-task="([^"]+)"/);
  assert.ok(exam, `${file}: data-exam がありません`);
  assert.ok(task, `${file}: data-task がありません`);

  const known = getKnownTaskIds(loadExam(exam[1]));
  assert.ok(
    known.includes(task[1]),
    `${file}: data-task="${task[1]}" は ${exam[1]} に存在しないタスクIDです`
  );

  // ファイル名とタスクIDが対応していること（1.5 -> 1-5.html）
  assert.equal(
    file, task[1].replace('.', '-') + '.html',
    `${file}: ファイル名が data-task="${task[1]}" と対応していません`
  );
}

console.log('learn-logic tests passed');
