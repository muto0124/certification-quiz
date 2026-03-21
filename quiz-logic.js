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

  function getLatestOverallStats(progress) {
    const entries = Object.values(progress || {});
    const answered = entries.filter((item) => {
      const history = item && Array.isArray(item.history) ? item.history : [];
      return history.length > 0;
    }).length;

    const latestCorrect = entries.filter((item) => {
      const history = item && Array.isArray(item.history) ? item.history : [];
      return history.length > 0 && history[history.length - 1] === 'correct';
    }).length;

    const rate = answered ? Math.round((latestCorrect / answered) * 100) : 0;

    return { answered, latestCorrect, rate };
  }

  return {
    evaluateAnswer,
    getLatestOverallStats,
    getAnswerLabels,
    isMultiAnswerQuestion,
    toggleSelection,
  };
});
