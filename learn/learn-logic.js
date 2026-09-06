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

  function getTasksStats(examData, taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) return null;

    const stats = taskIds.map(id => getTaskStats(examData, id));
    if (stats.some(s => s === null)) return null;

    const total = ((examData && examData.questions) || []).length;
    const count = stats.reduce((sum, s) => sum + s.count, 0);
    const share = total ? Math.round((count / total) * 1000) / 10 : 0;

    return { taskIds: stats.map(s => s.taskId), count, share };
  }

  function getTasksQuestionIds(examData, taskIds) {
    if (!Array.isArray(taskIds)) return [];

    const seen = new Set();
    for (const id of taskIds) {
      for (const qid of getTaskQuestionIds(examData, id)) seen.add(qid);
    }
    return [...seen].sort((a, b) => a - b);
  }

  return {
    getKnownTaskIds, getTaskStats, getTaskQuestionIds,
    getTasksStats, getTasksQuestionIds,
  };
});
