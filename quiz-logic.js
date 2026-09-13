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

  // 知識点ごとの代表問（core: true）だけに絞る。
  // 判定は「core キーを持つか」で行う。「core: true が1つ以上あるか」で判定すると、
  // 範囲内にたまたま代表問が無いときにも絞り込みを諦めてしまい、コアのみを指定した
  // はずが同系問まで出てしまう。代表問が無い場合は空を返し、呼び出し側でメッセージを出す。
  function filterCoreOnly(questions, enabled) {
    if (!enabled) return questions;
    const hasCoreData = questions.some((question) => typeof question.core === 'boolean');
    if (!hasCoreData) return questions;
    return questions.filter((question) => question.core === true);
  }

  // --- ドメイン／タスク単位の絞り込み ---
  // 選択値は 'all' | 'd:{ドメインID}' | 't:{タスクID}' の 1 文字列で持つ。
  // 単一選択なので状態が1つで済み、localStorage への保存もそのまま書ける。
  const ALL_CATEGORY = 'all';

  function getDomainList(categories) {
    return (categories && Array.isArray(categories.domains)) ? categories.domains : [];
  }

  function filterByCategory(questions, selection) {
    const list = questions || [];
    if (!selection || selection === ALL_CATEGORY) return list;

    const [kind, id] = String(selection).split(':');
    if (!id) return list;

    if (kind === 't') return list.filter((question) => question.category === id);

    // ドメイン判定を startsWith(id + '.') で行うのは、ID が多桁になったときに
    // '11.1' がドメイン '1' に含まれてしまう事故を避けるため。
    if (kind === 'd') {
      return list.filter((question) => typeof question.category === 'string'
        && (question.category === id || question.category.startsWith(`${id}.`)));
    }

    return list;
  }

  function getCategoryOptions(categories, questions) {
    const domains = getDomainList(categories);
    if (!domains.length) return [];

    const list = questions || [];
    const options = [{ value: ALL_CATEGORY, label: '全範囲', count: list.length }];

    for (const domain of domains) {
      const inner = [{
        value: `d:${domain.id}`,
        label: `ドメイン${domain.id} 全体`,
        count: filterByCategory(list, `d:${domain.id}`).length,
      }];

      for (const task of (domain.tasks || [])) {
        inner.push({
          value: `t:${task.id}`,
          label: `${task.id} ${task.titleJa}`,
          count: filterByCategory(list, `t:${task.id}`).length,
        });
      }

      options.push({
        group: `ドメイン${domain.id} ${domain.titleJa}（${domain.weight}%）`,
        options: inner,
      });
    }

    return options;
  }

  // 試験ガイドの weight はドメインにしか付かないため、タスク選択でも
  // 親ドメインの weight を返し、タスクかどうかは isTask で区別させる。
  function findDomainForSelection(categories, selection) {
    if (!selection || selection === ALL_CATEGORY) return null;

    const [kind, id] = String(selection).split(':');
    if (!id) return null;

    const domains = getDomainList(categories);
    if (kind === 'd') return domains.find((domain) => domain.id === id) || null;
    if (kind === 't') {
      return domains.find((domain) => (domain.tasks || [])
        .some((task) => task.id === id)) || null;
    }
    return null;
  }

  // 絞り込み済みの配列を受け取り、その集合を説明するだけに徹する。絞り込み自体は
  // 呼び出し側（app.js の1本の経路）が行う。ここで再度絞ると、No. 範囲やコアの
  // 条件が二重に効いて「表示は 268 問なのに出題は 50 問」のようなずれが起きる。
  function getCategoryStats(categories, scopedQuestions, progress, selection) {
    const scoped = scopedQuestions || [];
    const stats = getLatestOverallStats(progress, scoped.map((question) => question.id));
    const domain = findDomainForSelection(categories, selection);

    return {
      count: scoped.length,
      answered: stats.answered,
      rate: stats.rate,
      weight: domain ? domain.weight : null,
      domainId: domain ? domain.id : null,
      isTask: String(selection || '').startsWith('t:'),
    };
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

  function formatSentences(text) {
    // HTMLエスケープ後、全角文末記号（。！？）＋直後の閉じ括弧類の後ろに、
    // まだ文が続く場合のみ <br> を挿入する（＝文と文の間だけ改行）。
    // 半角 . ? ! は対象外（ARN・バージョン番号・コード・URL を壊さないため）。
    return escapeHtml(text).replace(/([。！？]+[」』）"'”’]*)\s*(?=\S)/gu, '$1<br>');
  }

  function formatQuestionText(text) {
    // • は常に箇条書きマーカー。・（中黒）は「検出・測定」のように語と語を
    // つなぐインライン区切りとして多用されるため、直前が文字／数字でない場合
    // （＝空白・句読点・括弧の後、または行頭）のみ箇条書きとみなす。
    const bulletRe = /•|(?<![\p{L}\p{N}])・/u;
    if (!bulletRe.test(text)) {
      return formatSentences(text);
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
    if (prefix) html += formatSentences(prefix);
    html += '<ul>' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>';
    if (suffix) html += formatSentences(suffix);
    return html;
  }

  // questionIds を渡すとその問題だけを対象にする。省略時は progress 全体。
  // スタート画面のサマリーとドメイン別の統計で「各問の最新の回答」という
  // 同じ定義を共有するため、集計の実体はこの1つに寄せている。
  function getLatestOverallStats(progress, questionIds) {
    const source = progress || {};
    const entries = Array.isArray(questionIds)
      ? questionIds.map((id) => source[id])
      : Object.values(source);
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

  // --- 中断データ ---
  // 出題セッションを sessionStorage に置ける形へ落とす。問題オブジェクトそのものではなく
  // ID の配列で持ち、復帰時に allQuestions から引き直す。問題データを再生成して
  // 中身が変わったとき、古い問題文のまま復帰してしまうのを防ぐため。
  const SESSION_STORAGE_KEY = 'quiz_session';

  function buildSessionSnapshot(examId, mode, questions, index, answers) {
    return {
      examId,
      mode,
      questionIds: (questions || []).map((question) => question.id),
      index,
      answers: (answers || []).map((answer) => (answer ? {
        selected: getAnswerLabels(answer.selected),
        isCorrect: Boolean(answer.isCorrect),
        isSubmitted: Boolean(answer.isSubmitted),
      } : null)),
    };
  }

  function describeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    const { examId, questionIds, index, answers } = snapshot;

    if (typeof examId !== 'string' || !examId) return null;
    if (!Array.isArray(questionIds) || questionIds.length === 0) return null;
    if (!questionIds.every((id) => Number.isFinite(id))) return null;
    if (!Array.isArray(answers) || answers.length !== questionIds.length) return null;
    if (!Number.isInteger(index) || index < 0 || index >= questionIds.length) return null;

    return {
      examId,
      questionId: questionIds[index],
      position: index + 1,
      total: questionIds.length,
    };
  }

  function restoreSessionSnapshot(snapshot, allQuestions) {
    const described = describeSnapshot(snapshot);
    if (!described) {
      return null;
    }

    const byId = new Map((allQuestions || []).map((question) => [question.id, question]));
    const questions = [];

    for (const id of snapshot.questionIds) {
      const question = byId.get(id);
      if (!question) return null;
      questions.push(question);
    }

    return {
      examId: described.examId,
      mode: typeof snapshot.mode === 'string' ? snapshot.mode : 'sequential',
      questions,
      index: snapshot.index,
      answers: snapshot.answers.map((answer) => (answer ? { ...answer } : null)),
    };
  }

  return {
    ALL_CATEGORY,
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
  };
});
