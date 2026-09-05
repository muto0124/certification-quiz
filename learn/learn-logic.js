(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.LearnLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getDomains(examData) {
    const cat = examData && examData.categories;
    return (cat && Array.isArray(cat.domains)) ? cat.domains : [];
  }

  function findTask(examData, taskId) {
    for (const domain of getDomains(examData)) {
      for (const task of (domain.tasks || [])) {
        if (task.id === taskId) return { domain, task };
      }
    }
    return null;
  }

  function getKnownTaskIds(examData) {
    const ids = [];
    for (const domain of getDomains(examData)) {
      for (const task of (domain.tasks || [])) ids.push(task.id);
    }
    return ids;
  }

  function getTaskQuestionIds(examData, taskId) {
    const questions = (examData && examData.questions) || [];
    return questions
      .filter(q => q.category === taskId)
      .map(q => q.id)
      .sort((a, b) => a - b);
  }

  function getTaskStats(examData, taskId) {
    const found = findTask(examData, taskId);
    if (!found) return null;

    const total = ((examData && examData.questions) || []).length;
    const count = getTaskQuestionIds(examData, taskId).length;
    const share = total ? Math.round((count / total) * 1000) / 10 : 0;

    return {
      taskId: found.task.id,
      taskTitleJa: found.task.titleJa,
      domainId: found.domain.id,
      domainTitleJa: found.domain.titleJa,
      domainWeight: found.domain.weight,
      count,
      share,
    };
  }

  return { getKnownTaskIds, getTaskStats, getTaskQuestionIds };
});
