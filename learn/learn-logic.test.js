const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getKnownTaskIds,
  getTaskStats,
  getTaskQuestionIds,
  getTasksStats,
  getTasksQuestionIds,
  getAllServices,
  getServicesForMap,
  findServices,
  getMaps,
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

// --- 複数タスクの合算 ---

// 合算した問題数と構成比を返す
assert.deepEqual(getTasksStats(sample, ['1.1', '2.1']), {
  taskIds: ['1.1', '2.1'], count: 4, share: 100,
});

// 問題が 0 件のタスクを含んでも合算できる
assert.deepEqual(getTasksStats(sample, ['1.1', '1.2']), {
  taskIds: ['1.1', '1.2'], count: 2, share: 50,
});

// 未知のタスクIDが 1 つでも混じれば null
assert.equal(getTasksStats(sample, ['1.1', '9.9']), null);

// 空配列と非配列は null（data-tasks の書き忘れを黙って通さない）
assert.equal(getTasksStats(sample, []), null);
assert.equal(getTasksStats(sample, undefined), null);

// 問題番号は昇順・重複なし
assert.deepEqual(getTasksQuestionIds(sample, ['1.1', '2.1']), [1, 2, 3, 4]);
assert.deepEqual(getTasksQuestionIds(sample, ['1.1', '1.1']), [1, 3]);
assert.deepEqual(getTasksQuestionIds(sample, []), []);
assert.deepEqual(getTasksQuestionIds(sample, ['9.9']), []);

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
  assert.ok(exam, `${file}: data-exam がありません`);
  const known = getKnownTaskIds(loadExam(exam[1]));

  // data-tasks="..." は data-task="..." の正規表現に一致しない（task の直後が s のため）
  const task = body[1].match(/data-task="([^"]+)"/);
  const tasks = body[1].match(/data-tasks="([^"]+)"/);
  assert.ok(task || tasks, `${file}: data-task も data-tasks もありません`);

  if (tasks) {
    assert.ok(file.startsWith('map-'), `${file}: data-tasks はマップページ（map-*.html）専用です`);
    const ids = tasks[1].split(',').map(s => s.trim());
    assert.ok(ids.length > 0, `${file}: data-tasks が空です`);
    for (const id of ids) {
      assert.ok(known.includes(id), `${file}: data-tasks の "${id}" は ${exam[1]} に存在しないタスクIDです`);
    }
  } else {
    assert.ok(!file.startsWith('map-'), `${file}: マップページは data-task でなく data-tasks を使ってください`);
    assert.ok(known.includes(task[1]), `${file}: data-task="${task[1]}" は ${exam[1]} に存在しないタスクIDです`);
    assert.equal(
      file, task[1].replace('.', '-') + '.html',
      `${file}: ファイル名が data-task="${task[1]}" と対応していません`
    );
  }
}

// マップページが 1 枚以上あること
assert.ok(
  pages.some(f => f.startsWith('map-')),
  'マップページ（map-*.html）が 1 つも見つかりません'
);

// --- サービス定数 ---

const services = getAllServices();
assert.ok(services.length > 0, 'サービス定数が空です');

for (const s of services) {
  assert.ok(typeof s.label === 'string' && s.label.length > 0, `label が不正: ${JSON.stringify(s)}`);
  assert.ok(Array.isArray(s.match) && s.match.length > 0, `${s.label}: match が空です`);
  assert.ok(Array.isArray(s.map) && s.map.length > 0, `${s.label}: map が空です`);
}

// 表示名は重複しない（逆引き欄で同じ行が二重に出る事故を防ぐ）
const labels = services.map(s => s.label);
assert.equal(new Set(labels).size, labels.length, 'サービス定数の label が重複しています');

// 検査1: match のいずれかが実データ（API2.json）に現れる
const api2Text = JSON.stringify(loadExam('API2')).toLowerCase();
for (const s of services) {
  const hit = s.match.some(m => api2Text.includes(m.toLowerCase()));
  assert.ok(hit, `サービス定数 "${s.label}": match ${JSON.stringify(s.match)} が API2.json に見つかりません`);
}

// 検査2: label が所属マップの HTML に現れる
for (const s of services) {
  for (const mapId of s.map) {
    const file = path.join(learnDir, `${mapId}.html`);
    assert.ok(fs.existsSync(file), `サービス定数 "${s.label}" が存在しないマップ ${mapId} を指しています`);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(s.label), `${mapId}.html: 定数の "${s.label}" が本文にありません`);
  }
}

// マップ単位の取り出し
assert.ok(getServicesForMap('map-rag').length > 0, 'map-rag のサービスが 0 件です');
assert.deepEqual(getServicesForMap('map-nonexistent'), []);

// 逆引きは label の部分一致、大文字小文字を無視
assert.deepEqual(findServices('kendra').map(s => s.label), ['Kendra']);
assert.deepEqual(findServices('KENDRA').map(s => s.label), ['Kendra']);
assert.ok(findServices('リランカー').some(s => s.label === 'リランカー'));
assert.deepEqual(findServices(''), []);
assert.deepEqual(findServices('   '), []);
assert.deepEqual(findServices(undefined), []);
assert.deepEqual(findServices('該当なしのはず'), []);

// --- マップ定義 ---

const maps = getMaps();
assert.ok(maps.length > 0, 'マップ定義が空です');

const api2Tasks = getKnownTaskIds(loadExam('API2'));
for (const m of maps) {
  // ページが実在する
  const file = path.join(learnDir, `${m.id}.html`);
  assert.ok(fs.existsSync(file), `マップ定義 "${m.id}" に対応する HTML がありません`);

  assert.ok(m.title && m.subtitle, `${m.id}: title か subtitle が空です`);

  // 定義のタスクが実データに存在する
  for (const t of m.tasks) {
    assert.ok(api2Tasks.includes(t), `${m.id}: タスク "${t}" は API2 に存在しません`);
  }

  // 定義のタスクとページの data-tasks が一致する（ずれを防ぐ）
  const html = fs.readFileSync(file, 'utf8');
  const attr = html.match(/<body[^>]*data-tasks="([^"]+)"/);
  assert.ok(attr, `${m.id}.html: data-tasks がありません`);
  assert.deepEqual(
    attr[1].split(',').map(s => s.trim()), m.tasks,
    `${m.id}: 定数の tasks と HTML の data-tasks が食い違っています`
  );
}

// マップ ID は重複しない
const mapIds = maps.map(m => m.id);
assert.equal(new Set(mapIds).size, mapIds.length, 'マップ ID が重複しています');

// サービス定数が指すマップは、すべてマップ定義に存在する
for (const s of getAllServices()) {
  for (const mapId of s.map) {
    assert.ok(mapIds.includes(mapId), `サービス "${s.label}" が未定義のマップ ${mapId} を指しています`);
  }
}

console.log('learn-logic tests passed');
