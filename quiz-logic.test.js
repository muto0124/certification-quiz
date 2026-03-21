const assert = require('node:assert/strict');

const {
  evaluateAnswer,
  getLatestOverallStats,
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

console.log('quiz-logic tests passed');
