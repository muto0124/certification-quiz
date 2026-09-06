(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.LearnLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 図に出すサービスの単一の出所。label は逆引き欄の表示、match はテストの照合に使う。
  // 図は日本語、実データの主表記は英語なので両者を分ける
  //（例: 「リランカー」は API2.json に 4 件、「Rerank」は 129 件）
  const SERVICES = [
    { label: 'Bedrock Data Automation', match: ['Bedrock Data Automation'], map: ['map-rag'] },
    { label: 'Textract', match: ['Textract'], map: ['map-rag'] },
    { label: 'Transcribe', match: ['Transcribe'], map: ['map-rag'] },
    { label: 'Titan Embeddings', match: ['Titan Embed'], map: ['map-rag'] },
    { label: 'OpenSearch Serverless', match: ['OpenSearch Serverless'], map: ['map-rag'] },
    { label: 'S3 Vectors', match: ['S3 Vectors'], map: ['map-rag'] },
    { label: 'Aurora pgvector', match: ['pgvector'], map: ['map-rag'] },
    { label: 'Neptune Analytics', match: ['Neptune Analytics'], map: ['map-rag'] },
    { label: 'Kendra', match: ['Kendra'], map: ['map-rag'] },
    { label: 'ハイブリッド検索', match: ['hybrid', 'ハイブリッド'], map: ['map-rag'] },
    { label: 'リランカー', match: ['rerank', 'リランカー'], map: ['map-rag'] },
    { label: 'メタデータフィルター', match: ['メタデータフィルタ'], map: ['map-rag'] },
    { label: 'クエリ分解', match: ['query decomposition', 'クエリ分解'], map: ['map-rag'] },
    { label: 'RetrieveAndGenerate', match: ['RetrieveAndGenerate'], map: ['map-rag'] },
  ];

  function getAllServices() {
    return SERVICES.map(s => ({ label: s.label, match: [...s.match], map: [...s.map] }));
  }

  function getServicesForMap(mapId) {
    return getAllServices().filter(s => s.map.includes(mapId));
  }

  function findServices(query) {
    const q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return [];
    return getAllServices().filter(s => s.label.toLowerCase().includes(q));
  }

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
    getAllServices, getServicesForMap, findServices,
  };
});
