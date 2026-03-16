(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.QuizLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getAnswerLabels(value) {
    const rawLabels = Array.isArray(value)
      ? value
      : String(value || '').split('');

    return [...new Set(rawLabels.filter(Boolean))].sort();
  }

  function isMultiAnswerQuestion(question) {
    return getAnswerLabels(question && question.answer).length > 1;
  }

  function evaluateAnswer(answer, selectedLabels) {
    const expected = getAnswerLabels(answer);
    const selected = getAnswerLabels(selectedLabels);

    if (expected.length !== selected.length) {
      return false;
    }

    return expected.every((label, index) => label === selected[index]);
  }

  function toggleSelection(selectedLabels, label) {
    const selected = new Set(getAnswerLabels(selectedLabels));

    if (selected.has(label)) {
      selected.delete(label);
    } else {
      selected.add(label);
    }

    return [...selected].sort();
  }

  return {
    evaluateAnswer,
    getAnswerLabels,
    isMultiAnswerQuestion,
    toggleSelection,
  };
});
