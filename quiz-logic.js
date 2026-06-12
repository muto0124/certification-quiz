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

  function getNextQuestionState(currentIndex, totalQuestions) {
    const isLast = totalQuestions > 0 && currentIndex === totalQuestions - 1;

    return {
      isLast,
      label: isLast ? 'スタートに戻る' : '次の問題 →',
    };
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

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatQuestionText(text) {
    // • は常に箇条書きマーカー。・（中黒）は「検出・測定」のように語と語を
    // つなぐインライン区切りとして多用されるため、直前が文字／数字でない場合
    // （＝空白・句読点・括弧の後、または行頭）のみ箇条書きとみなす。
    const bulletRe = /•|(?<![\p{L}\p{N}])・/u;
    if (!bulletRe.test(text)) {
      return escapeHtml(text);
    }
    const firstIdx = text.search(bulletRe);
    const prefix = text.substring(0, firstIdx).trim();
    const bulletPart = text.substring(firstIdx);
    const items = bulletPart.split(bulletRe).map((s) => s.trim()).filter((s) => s.length > 0);

    // 最後のセグメントから後続テキスト（箇条書き外の文章）を分離
    let suffix = '';
    if (items.length > 0) {
      const last = items[items.length - 1];
      const periodIdx = last.indexOf('。');
      if (periodIdx !== -1 && periodIdx < last.length - 1) {
        // 「。」の後にテキストが続く → 後続文として分離
        items[items.length - 1] = last.substring(0, periodIdx + 1);
        suffix = last.substring(periodIdx + 1).trim();
      } else if (periodIdx === -1) {
        // 「。」なし → 質問パターンで分割を試行
        const qMatch = last.match(/(何を|どう|どの|どのように|この|これらの).*$/);
        if (qMatch && qMatch.index > 0) {
          items[items.length - 1] = last.substring(0, qMatch.index).trim();
          suffix = qMatch[0].trim();
        }
      }
    }

    let html = '';
    if (prefix) html += escapeHtml(prefix);
    html += '<ul>' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>';
    if (suffix) html += escapeHtml(suffix);
    return html;
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
  };
});
