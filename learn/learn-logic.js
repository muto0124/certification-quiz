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
  // マップページの定義。ページを作った順に足す。tasks は各ページの data-tasks と一致させる
  const MAPS = [
    { id: 'map-rag', title: '検索経路', subtitle: '文書が答えになるまで', tasks: ['1.3', '1.4', '1.5'] },
    { id: 'map-agent', title: 'エージェントとツール連携', subtitle: 'モデルが外に手を伸ばす', tasks: ['1.6', '2.1', '2.3', '2.5'] },
    { id: 'map-invoke', title: '呼び出しと推論基盤', subtitle: 'リクエストがモデルに届くまで', tasks: ['1.2', '2.2', '2.4', '4.1', '4.2'] },
    { id: 'map-guard', title: '安全と統制の関門', subtitle: 'どこで何を止めるか', tasks: ['3.1', '3.2', '3.3', '3.4'] },
    { id: 'map-ops', title: '観測と評価の配線', subtitle: '壊れたとき何を見るか', tasks: ['4.3', '5.1', '5.2'] },
  ];

  function getMaps() {
    return MAPS.map(m => ({ id: m.id, title: m.title, subtitle: m.subtitle, tasks: [...m.tasks] }));
  }

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

    { label: 'Prompt Management', match: ['Prompt Management'], map: ['map-agent'] },
    { label: 'Prompt Flows', match: ['Prompt Flows'], map: ['map-agent'] },
    { label: 'Bedrock Agents', match: ['Bedrock Agents'], map: ['map-agent'] },
    { label: 'Step Functions', match: ['Step Functions'], map: ['map-agent'] },
    { label: 'アクショングループ', match: ['アクショングループ'], map: ['map-agent'] },
    { label: 'MCP', match: ['MCP'], map: ['map-agent'] },
    { label: 'STDIO', match: ['STDIO'], map: ['map-agent'] },
    { label: 'Streamable HTTP', match: ['Streamable HTTP'], map: ['map-agent'] },
    { label: 'AgentCore', match: ['AgentCore'], map: ['map-agent'] },
    { label: 'Strands', match: ['Strands'], map: ['map-agent'] },
    { label: 'DynamoDB', match: ['DynamoDB'], map: ['map-agent'] },
    { label: 'Q Business', match: ['Q Business'], map: ['map-agent'] },

    { label: 'API Gateway', match: ['API Gateway'], map: ['map-agent', 'map-invoke'] },
    { label: 'Lambda', match: ['Lambda'], map: ['map-agent', 'map-invoke'] },
    { label: 'AppSync', match: ['AppSync'], map: ['map-invoke'] },
    { label: 'Amplify', match: ['Amplify'], map: ['map-invoke'] },
    { label: 'ECS', match: ['ECS'], map: ['map-invoke'] },
    { label: 'AppConfig', match: ['AppConfig'], map: ['map-invoke'] },
    { label: 'Converse', match: ['Converse'], map: ['map-invoke'] },
    { label: 'ConverseStream', match: ['ConverseStream'], map: ['map-invoke'] },
    { label: 'InvokeModel', match: ['InvokeModel'], map: ['map-invoke'] },
    { label: 'InvokeModelWithResponseStream', match: ['InvokeModelWithResponseStream'], map: ['map-invoke'] },
    { label: '推論プロファイル', match: ['推論プロファイル'], map: ['map-invoke'] },
    { label: 'オンデマンド', match: ['オンデマンド'], map: ['map-invoke'] },
    { label: 'プロビジョンドスループット', match: ['プロビジョンドスループット', 'Provisioned Throughput'], map: ['map-invoke'] },
    { label: 'バッチ推論', match: ['Batch inference', 'バッチ推論'], map: ['map-invoke'] },
    { label: 'プロンプトキャッシュ', match: ['prompt caching', 'プロンプトキャッシュ'], map: ['map-invoke'] },
    { label: 'intelligent prompt routing', match: ['intelligent prompt routing'], map: ['map-invoke'] },
    { label: 'Nova', match: ['Nova'], map: ['map-invoke'] },

    { label: 'AWS WAF', match: ['AWS WAF'], map: ['map-guard'] },
    { label: 'Cognito', match: ['Cognito'], map: ['map-guard'] },
    { label: 'Bedrock Guardrails', match: ['Bedrock Guardrails'], map: ['map-guard'] },
    { label: 'Comprehend', match: ['Comprehend'], map: ['map-guard'] },
    { label: 'ApplyGuardrail', match: ['ApplyGuardrail'], map: ['map-guard'] },
    { label: 'KMS', match: ['KMS'], map: ['map-guard'] },
    { label: 'Macie', match: ['Macie'], map: ['map-guard'] },
    { label: 'Lake Formation', match: ['Lake Formation'], map: ['map-guard'] },
    { label: 'PrivateLink', match: ['PrivateLink'], map: ['map-guard'] },
    { label: 'SCP', match: ['SCP'], map: ['map-guard'] },
    { label: 'IAM', match: ['IAM'], map: ['map-guard'] },

    { label: 'CloudWatch Logs', match: ['CloudWatch Logs'], map: ['map-ops'] },
    { label: 'CloudTrail', match: ['CloudTrail'], map: ['map-ops'] },
    { label: 'CloudWatch アラーム', match: ['CloudWatch アラーム'], map: ['map-ops'] },
    { label: 'Logs Insights', match: ['Logs Insights'], map: ['map-ops'] },
    { label: 'Athena', match: ['Athena'], map: ['map-ops'] },
    { label: 'X-Ray', match: ['X-Ray'], map: ['map-ops'] },
    { label: 'モデル評価', match: ['モデル評価'], map: ['map-ops'] },
    { label: 'LLM-as-a-judge', match: ['LLM-as-a-judge'], map: ['map-ops'] },
    { label: 'Clarify', match: ['Clarify'], map: ['map-ops'] },
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
    getMaps,
  };
});
