const assert = require('node:assert/strict');

const {
  evaluateAnswer,
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

console.log('quiz-logic tests passed');
