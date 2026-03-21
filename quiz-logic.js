(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.QuizLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_REVIEW_WEIGHTS = {
    accuracy: 0.6,
    stale: 0.4,
    maxAgeDays: 14,
  };

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

  function getProgressMeta(progressEntry) {
    const history = progressEntry && Array.isArray(progressEntry.history)
      ? progressEntry.history
      : [];
    const parsedLastAnsweredAt = progressEntry && typeof progressEntry.lastAnsweredAt === 'string'
      ? Date.parse(progressEntry.lastAnsweredAt)
      : Number.NaN;

    return {
      history,
      lastAnsweredAt: Number.isFinite(parsedLastAnsweredAt)
        ? parsedLastAnsweredAt
        : Number.NaN,
    };
  }

  function getAccuracyScore(history) {
    if (!history.length) {
      return null;
    }

    const correct = history.filter((value) => value === 'correct').length;
    return 1 - (correct / history.length);
  }

  function getStaleScore(lastAnsweredAt, nowMs, maxAgeDays) {
    if (!Number.isFinite(lastAnsweredAt)) {
      return 1;
    }

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - lastAnsweredAt);
    return Math.min(1, elapsedMs / maxAgeMs);
  }

  function getReviewCandidates(questions, progress, options = {}) {
    const nowMs = Number.isFinite(options.now)
      ? options.now
      : Date.parse(options.now || '') || Date.now();
    const accuracyWeight = options.accuracyWeight ?? DEFAULT_REVIEW_WEIGHTS.accuracy;
    const staleWeight = options.staleWeight ?? DEFAULT_REVIEW_WEIGHTS.stale;
    const maxAgeDays = options.maxAgeDays ?? DEFAULT_REVIEW_WEIGHTS.maxAgeDays;

    return (questions || [])
      .map((question) => {
        const { history, lastAnsweredAt } = getProgressMeta((progress || {})[question.id]);
        if (!history.length) {
          return null;
        }

        const accuracyScore = getAccuracyScore(history);
        const staleScore = getStaleScore(lastAnsweredAt, nowMs, maxAgeDays);
        const reviewScore = (accuracyScore * accuracyWeight) + (staleScore * staleWeight);

        return {
          question,
          reviewScore,
          accuracyScore,
          staleScore,
          lastAnsweredAt: Number.isFinite(lastAnsweredAt) ? lastAnsweredAt : Number.NEGATIVE_INFINITY,
        };
      })
      .filter(Boolean)
      .sort((left, right) => (
        (right.reviewScore - left.reviewScore)
        || (left.lastAnsweredAt - right.lastAnsweredAt)
        || (left.question.id - right.question.id)
      ));
  }

  function getReviewQuestionIds(questions, progress, options = {}) {
    return getReviewCandidates(questions, progress, options)
      .map((item) => item.question.id);
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
    getReviewCandidates,
    getReviewQuestionIds,
    getAnswerLabels,
    isMultiAnswerQuestion,
    toggleSelection,
  };
});
