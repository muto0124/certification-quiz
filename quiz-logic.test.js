const assert = require('node:assert/strict');

const {
  escapeHtml,
  evaluateAnswer,
  filterByCategory,
  filterCoreOnly,
  formatQuestionText,
  getCategoryOptions,
  getCategoryStats,
  getLatestOverallStats,
  getNextQuestionState,
  getReviewCandidates,
  getReviewQuestionIds,
  getAnswerLabels,
  isMultiAnswerQuestion,
  toggleSelection,
  SESSION_STORAGE_KEY,
  buildSessionSnapshot,
  describeSnapshot,
  restoreSessionSnapshot,
} = require('./quiz-logic.js');

assert.equal(isMultiAnswerQuestion({ answer: 'BD' }), true);
assert.equal(isMultiAnswerQuestion({ answer: 'A' }), false);

assert.deepEqual(getAnswerLabels('DA'), ['A', 'D']);

assert.equal(evaluateAnswer('BD', ['B']), false);
assert.equal(evaluateAnswer('BD', ['B', 'D']), true);
assert.equal(evaluateAnswer('BD', ['D', 'B']), true);
assert.equal(evaluateAnswer('BD', ['B', 'C', 'D']), false);

assert.deepEqual(toggleSelection([], 'B'), ['B']);
assert.deepEqual(toggleSelection(['B'], 'D'), ['B', 'D']);
assert.deepEqual(toggleSelection(['B', 'D'], 'B'), ['D']);

assert.deepEqual(getNextQuestionState(0, 3), {
  isLast: false,
  label: '次の問題 →',
});

assert.deepEqual(getNextQuestionState(2, 3), {
  isLast: true,
  label: 'スタートに戻る',
});

assert.deepEqual(getLatestOverallStats({}), {
  answered: 0,
  latestCorrect: 0,
  rate: 0,
});

assert.deepEqual(
  getLatestOverallStats({
    1: { history: ['incorrect', 'correct'] },
    2: { history: ['correct', 'incorrect'] },
    3: { history: [] },
  }),
  {
    answered: 2,
    latestCorrect: 1,
    rate: 50,
  },
);

const reviewQuestions = [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
];

const reviewProgress = {
  1: {
    history: ['correct', 'incorrect'],
    lastAnsweredAt: '2026-03-19T00:00:00.000Z',
  },
  2: {
    history: ['correct', 'correct', 'incorrect'],
    lastAnsweredAt: '2026-03-01T00:00:00.000Z',
  },
  3: {
    history: ['incorrect'],
    lastAnsweredAt: '2026-03-05T00:00:00.000Z',
  },
  4: {
    history: [],
  },
};

assert.deepEqual(
  getReviewQuestionIds(reviewQuestions, reviewProgress, {
    now: '2026-03-21T00:00:00.000Z',
  }),
  [3, 2, 1],
);

assert.deepEqual(
  getReviewQuestionIds(reviewQuestions, {
    1: { history: [] },
  }, {
    now: '2026-03-21T00:00:00.000Z',
  }),
  [],
);

assert.deepEqual(
  getReviewCandidates([
    { id: 10 },
  ], {
    10: {
      history: ['correct'],
    },
  }, {
    now: '2026-03-21T00:00:00.000Z',
  }).map((item) => item.question.id),
  [10],
);

// --- formatQuestionText: 中黒（・）はインライン区切りと箇条書きを区別する ---

// インライン区切り（語・語）は箇条書きにしない（AIP No.1 の回帰防止）
assert.equal(
  formatQuestionText('偏見を検出・測定するため、公平性メトリクスを収集・監視したい。'),
  '偏見を検出・測定するため、公平性メトリクスを収集・監視したい。',
);
assert.ok(!formatQuestionText('リトライ・フォールバック機構で設定する。').includes('<ul>'));

// • は常に箇条書き。最後の項目内の「。」以降は後続文として分離する
assert.equal(
  formatQuestionText('要件は次のとおり。 • 項目A。 • 項目B。どうすればよいか。'),
  '要件は次のとおり。<ul><li>項目A。</li><li>項目B。</li></ul>どうすればよいか。',
);

// 空白後の ・ は箇条書き（google_database の問題形式）
assert.equal(
  formatQuestionText('次の構成です。 ・項目A ・項目B'),
  '次の構成です。<ul><li>項目A</li><li>項目B</li></ul>',
);

// 句点直後の ・ は箇条書き（google_network の問題形式）。直前の「。」は保持する
assert.equal(
  formatQuestionText('前提です。・各組織は共有する。・両方が有効。'),
  '前提です。<ul><li>各組織は共有する。</li><li>両方が有効。</li></ul>',
);

// --- formatQuestionText: 文単位（句点ごと）の改行 ---

// 複数文は文と文の間に <br> を挿入する
assert.equal(
  formatQuestionText('文1である。文2である。最後はどれか。'),
  '文1である。<br>文2である。<br>最後はどれか。',
);

// 末尾の文末記号には <br> を付けない（単一文は不変）
assert.equal(formatQuestionText('一文だけである。'), '一文だけである。');

// 半角ピリオド（バージョン番号）では改行しない
assert.equal(
  formatQuestionText('モデルはamazon.nova-pro-v1:0を使う。次に設定する。'),
  'モデルはamazon.nova-pro-v1:0を使う。<br>次に設定する。',
);

// 引用文「。」は閉じ括弧を取り込んでから改行（引用を途中で割らない）
assert.equal(
  formatQuestionText('「エラー。」と表示される。対応する。'),
  '「エラー。」<br>と表示される。<br>対応する。',
);

// 箇条書きの prefix が複数文のとき、prefix 内で <br> 分割される
assert.equal(
  formatQuestionText('前提1。前提2。次の構成です。 ・項目A ・項目B'),
  '前提1。<br>前提2。<br>次の構成です。<ul><li>項目A</li><li>項目B</li></ul>',
);

// HTML エスケープ
assert.equal(escapeHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');

// --- 中断データ ---

assert.equal(SESSION_STORAGE_KEY, 'quiz_session');

const sampleQuestions = [{ id: 12 }, { id: 13 }, { id: 14 }];
const sampleAnswers = [
  { selected: ['A'], isCorrect: true, isSubmitted: true },
  null,
  null,
];
const snapshot = buildSessionSnapshot('API2', 'sequential', sampleQuestions, 1, sampleAnswers);

assert.equal(snapshot.examId, 'API2');
assert.equal(snapshot.mode, 'sequential');
assert.deepEqual(snapshot.questionIds, [12, 13, 14]);
assert.equal(snapshot.index, 1);
assert.equal(snapshot.answers.length, 3);
assert.deepEqual(snapshot.answers[0], { selected: ['A'], isCorrect: true, isSubmitted: true });
assert.equal(snapshot.answers[1], null);

// JSON を往復しても壊れない（sessionStorage に入れて出す経路の代理）
assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);

// describeSnapshot は形だけを見る
assert.deepEqual(describeSnapshot(snapshot), {
  examId: 'API2', questionId: 13, position: 2, total: 3,
});
assert.equal(describeSnapshot(null), null);
assert.equal(describeSnapshot('quiz_session'), null);
assert.equal(describeSnapshot({ ...snapshot, examId: '' }), null);
assert.equal(describeSnapshot({ ...snapshot, questionIds: [] }), null);
assert.equal(describeSnapshot({ ...snapshot, index: 3 }), null);
assert.equal(describeSnapshot({ ...snapshot, index: -1 }), null);
assert.equal(describeSnapshot({ ...snapshot, index: 1.5 }), null);
assert.equal(describeSnapshot({ ...snapshot, answers: [null] }), null);
assert.equal(describeSnapshot({ ...snapshot, questionIds: [12, 'x', 14] }), null);
assert.equal(describeSnapshot({ ...snapshot, questionIds: [12, NaN, 14] }), null);

// restoreSessionSnapshot は問題オブジェクトを引き直す
const restored = restoreSessionSnapshot(snapshot, sampleQuestions);
assert.deepEqual(restored.questions.map((q) => q.id), [12, 13, 14]);
assert.equal(restored.questions[0], sampleQuestions[0]);
assert.equal(restored.examId, 'API2');
assert.equal(restored.mode, 'sequential');
assert.equal(restored.index, 1);
assert.equal(restored.answers[0].isCorrect, true);
assert.equal(restored.answers[1], null);

// 出題順が入れ替わっていても、その順で引き直す
const shuffled = buildSessionSnapshot('API2', 'random', [{ id: 14 }, { id: 12 }], 0, [null, null]);
assert.deepEqual(
  restoreSessionSnapshot(shuffled, sampleQuestions).questions.map((q) => q.id),
  [14, 12],
);

// 問題データを差し替えて ID が欠けたら復帰しない
assert.equal(restoreSessionSnapshot(snapshot, [{ id: 12 }, { id: 13 }]), null);
assert.equal(restoreSessionSnapshot(snapshot, []), null);
assert.equal(restoreSessionSnapshot(null, sampleQuestions), null);

// mode が壊れていても既定値で復帰する
assert.equal(restoreSessionSnapshot({ ...snapshot, mode: 42 }, sampleQuestions).mode, 'sequential');

// --- filterCoreOnly ---

const coreSample = [
  { id: 1, core: true, coreLabel: 'ハイブリッド検索', related: [2, 3] },
  { id: 2, core: false, coreOf: 1 },
  { id: 3, core: false, coreOf: 1 },
  { id: 4, core: true, coreLabel: 'prompt caching', related: [] },
];

// 無効なら入力をそのまま返す
assert.deepEqual(filterCoreOnly(coreSample, false).map((q) => q.id), [1, 2, 3, 4]);

// 有効なら代表問だけ返す
assert.deepEqual(filterCoreOnly(coreSample, true).map((q) => q.id), [1, 4]);

// core キーを持たない試験では、有効でもフィルタを適用しない（空にしない）
const noCoreSample = [{ id: 1 }, { id: 2 }];
assert.deepEqual(filterCoreOnly(noCoreSample, true).map((q) => q.id), [1, 2]);

// コアセットを持つ試験で、範囲内に代表問が無ければ空を返す。
// 「core: true が1件も無い」を「コアセットが無い」と取り違えると、
// コアのみ指定なのに同系問題が出てしまう。
assert.deepEqual(filterCoreOnly(coreSample.slice(1, 3), true), []);

// 空配列は空のまま
assert.deepEqual(filterCoreOnly([], true), []);

// --- ドメイン／タスク単位の絞り込み ---

const CATS = {
  domains: [
    {
      id: '1',
      weight: 31,
      titleJa: 'ドメイン1',
      tasks: [{ id: '1.1', titleJa: 'タスク1.1' }, { id: '1.2', titleJa: 'タスク1.2' }],
    },
    { id: '2', weight: 26, titleJa: 'ドメイン2', tasks: [{ id: '2.1', titleJa: 'タスク2.1' }] },
  ],
};
const CQS = [
  { id: 1, category: '1.1', core: true },
  { id: 2, category: '1.1', core: false },
  { id: 3, category: '1.2', core: true },
  { id: 4, category: '2.1', core: false },
  { id: 5 },  // 未分類
];

// 全範囲は未分類も含めて素通し
assert.deepEqual(filterByCategory(CQS, 'all').map((q) => q.id), [1, 2, 3, 4, 5]);

// 選択が無い（未初期化）場合も素通しにして、出題自体は成立させる
assert.deepEqual(filterByCategory(CQS, null).map((q) => q.id), [1, 2, 3, 4, 5]);

// ドメインは配下のタスクをまとめる。未分類は含めない
assert.deepEqual(filterByCategory(CQS, 'd:1').map((q) => q.id), [1, 2, 3]);
assert.deepEqual(filterByCategory(CQS, 'd:2').map((q) => q.id), [4]);

// タスクは完全一致
assert.deepEqual(filterByCategory(CQS, 't:1.1').map((q) => q.id), [1, 2]);

// 失効した選択値は空を返す（呼び出し側が「全範囲」へ倒す）
assert.deepEqual(filterByCategory(CQS, 't:9.9').map((q) => q.id), []);

// ドメイン ID が多桁になっても前方一致で誤爆しない
assert.deepEqual(
  filterByCategory([{ id: 1, category: '11.1' }, { id: 2, category: '1.1' }], 'd:1')
    .map((q) => q.id),
  [2],
);

// 選択肢は「全範囲」＋ドメインごとの optgroup
const opts = getCategoryOptions(CATS, CQS);
assert.deepEqual(opts[0], { value: 'all', label: '全範囲', count: 5 });
assert.equal(opts.length, 3);
assert.equal(opts[1].group, 'ドメイン1 ドメイン1（31%）');
assert.deepEqual(opts[1].options.map((o) => o.value), ['d:1', 't:1.1', 't:1.2']);
assert.equal(opts[1].options[0].label, 'ドメイン1 全体');
assert.equal(opts[1].options[0].count, 3);
assert.equal(opts[1].options[1].label, '1.1 タスク1.1');
assert.equal(opts[1].options[1].count, 2);
assert.equal(opts[2].options[0].count, 1);

// categories を持たない試験では選択肢を作らない
assert.deepEqual(getCategoryOptions(null, CQS), []);

const CPROG = {
  1: { history: ['correct'] },
  2: { history: ['correct', 'incorrect'] },
  3: { history: ['incorrect', 'correct'] },
};

// 絞り込み済みの配列を渡す（絞り込みは呼び出し側の責務）
const D1 = filterByCategory(CQS, 'd:1');

// ドメイン1（全問）: 3問回答済み、最新が正解は 1 と 3 の 2 問
assert.deepEqual(getCategoryStats(CATS, D1, CPROG, 'd:1'), {
  count: 3, answered: 3, rate: 67, weight: 31, domainId: '1', isTask: false,
});

// ドメイン1（コアのみ）: 対象は 1 と 3 の 2 問
assert.deepEqual(getCategoryStats(CATS, filterCoreOnly(D1, true), CPROG, 'd:1'), {
  count: 2, answered: 2, rate: 100, weight: 31, domainId: '1', isTask: false,
});

// タスクは親ドメインの weight を返す
assert.deepEqual(getCategoryStats(CATS, filterByCategory(CQS, 't:1.1'), CPROG, 't:1.1'), {
  count: 2, answered: 2, rate: 50, weight: 31, domainId: '1', isTask: true,
});

// 全範囲は weight を持たない
assert.deepEqual(getCategoryStats(CATS, CQS, CPROG, 'all'), {
  count: 5, answered: 3, rate: 67, weight: null, domainId: null, isTask: false,
});

// 未回答だけの範囲でも 0% を返して落ちない
assert.deepEqual(getCategoryStats(CATS, filterByCategory(CQS, 'd:2'), CPROG, 'd:2'), {
  count: 1, answered: 0, rate: 0, weight: 26, domainId: '2', isTask: false,
});

// No. 範囲で更に絞った集合でも、渡された集合をそのまま説明する
assert.deepEqual(getCategoryStats(CATS, CQS.slice(0, 2), CPROG, 'all'), {
  count: 2, answered: 2, rate: 50, weight: null, domainId: null, isTask: false,
});

// --- 統計の対象を絞れる（第2引数） ---

// 省略時は従来どおり progress 全体を見る
assert.deepEqual(getLatestOverallStats(CPROG), { answered: 3, latestCorrect: 2, rate: 67 });

// questionIds で対象を絞る
assert.deepEqual(getLatestOverallStats(CPROG, [1, 2]), { answered: 2, latestCorrect: 1, rate: 50 });

// 対象が空なら 0 件
assert.deepEqual(getLatestOverallStats(CPROG, []), { answered: 0, latestCorrect: 0, rate: 0 });

console.log('quiz-logic tests passed');
