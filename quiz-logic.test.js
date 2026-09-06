const assert = require('node:assert/strict');

const {
  escapeHtml,
  evaluateAnswer,
  formatQuestionText,
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

console.log('quiz-logic tests passed');
