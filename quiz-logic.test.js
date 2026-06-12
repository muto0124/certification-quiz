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

// HTML エスケープ
assert.equal(escapeHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');

console.log('quiz-logic tests passed');
