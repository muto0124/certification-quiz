const assert = require('node:assert/strict');

const {
  evaluateAnswer,
  getLatestOverallStats,
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

console.log('quiz-logic tests passed');
