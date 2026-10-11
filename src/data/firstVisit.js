export const QUESTIONNAIRE_VERSION = 2;
export const DRAFT_KEY = 'qingying:first-visit:v2';
const MAX_AGE_MS = 60 * 60 * 1000;

export const questions = [
  { id: 'q1', topic: '金融知识', title: '你如何评价目前对个人理财的了解？', options: [
    ['beginner', '初学者 · 我对理财知之甚少'], ['basic', '基础 · 我知道一些概念，但不常练习'],
    ['intermediate', '中级 · 我会维护预算并跟踪费用'], ['advanced', '高级 · 我有应急储蓄，也会关注投资和债务'] ] },
  { id: 'q2', topic: '应急准备', title: '你有专门用于突发情况的应急储蓄吗？', hint: '它可以和其他储蓄分开考虑。', options: [
    ['none', '目前没有积蓄'], ['savings_no_fund', '有储蓄，但没有单独的应急资金'],
    ['lt1', '有，但不到一个月的开销'], ['1to2', '约能覆盖 1—2 个月开销'],
    ['3to6', '约能覆盖 3—6 个月开销'], ['gt6', '超过 6 个月开销'] ] },
  { id: 'q3', topic: '应急准备', title: '你每月定期储蓄约占收入的多少？', hint: '包括应急、目标等各类储蓄。', options: [
    ['p0', '0% · 暂不定期存钱'], ['p1to5', '1—5%'], ['p6to10', '6—10%'],
    ['p11to15', '11—15%'], ['p16to20', '16—20%'], ['p20plus', '超过 20%'] ] },
  { id: 'q4', topic: '消费习惯', title: '你多久会回看和分析自己的开支？', hint: '回看是知道钱去了哪里，不只是检查余额。', options: [
    ['never', '从来没有'], ['rarely', '很少 · 买东西时才检查余额'],
    ['monthly', '有时 · 每月看一次账单'], ['weekly', '定期 · 每周检查费用'],
    ['daily', '每天记录并分类费用'] ] },
  { id: 'q5', topic: '消费习惯', title: '你花钱超过原计划的频率是多少？', options: [
    ['always', '几乎总是'], ['often', '经常 · 每月数次'], ['sometimes', '有时 · 一两个月一次'],
    ['rarely', '很少 · 通常会按计划来'], ['never', '从来没有'] ] },
  { id: 'q6', topic: '消费习惯', title: '一般到月末，你通常还剩下多少？', options: [
    ['short', '没有，有时还不够'], ['p0to5', '约收入的 0—5%'], ['p5to10', '约收入的 5—10%'],
    ['p10to15', '约收入的 10—15%'], ['p15to25', '约收入的 15—25%'], ['p25plus', '超过收入的 25%'] ] },
  { id: 'q7', topic: '债务管理', title: '你目前是否有贷款或尚未还清的信用卡？', hint: '这一题暂不计住房贷款。', options: [
    ['over50', '有，超过年收入的 50%'], ['p30to50', '有，占年收入的 30—50%'],
    ['under30', '有，低于年收入的 30%'], ['mortgage_only', '仅有住房贷款'], ['none', '没有债务'] ] },
  { id: 'q8', topic: '债务管理', title: '如果有债务，你按期还款会有困难吗？', options: [
    ['late', '经常拖欠'], ['minimum', '只能付最低还款额'], ['struggle', '有时吃力，但能应付'],
    ['ontime', '按时还款没有困难'], ['na', '不适用 · 没有相关债务'] ] },
  { id: 'q9', topic: '债务管理', title: '每月收入中，约有多少用于偿还债务？', options: [
    ['over50', '超过 50%'], ['p40to50', '40—50%'], ['p30to39', '30—39%'],
    ['p20to29', '20—29%'], ['under20', '低于 20%'], ['none', '没有相关债务'] ] },
  { id: 'q10', topic: '收入和支出', title: '你每月的净收入或可支配生活费约是多少？', max: 1000000 },
  { id: 'q11', topic: '收入和支出', title: '你每月的日常开销大概是多少？', hint: '包括住宿、食物、交通等。', max: 1000000 },
  { id: 'q12', topic: '流动储蓄', title: '你目前单独留出的应急储蓄有多少？', hint: '如果没有，可以填 0。', max: 10000000 },
];

export const emptyAnswers = () => Object.fromEntries(questions.map(q => [q.id, null]));

const newId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else throw new Error('当前浏览器无法安全创建问卷标识');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const freshDraft = () => ({ version: QUESTIONNAIRE_VERSION, submission_id: newId(),
  answers: emptyAnswers(), step: 0, complete: false, updated_at: Date.now() });

export const clearDraft = () => sessionStorage.removeItem(DRAFT_KEY);
export const readDraft = () => {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (draft?.version === QUESTIONNAIRE_VERSION && draft.answers && draft.submission_id &&
        Date.now() - draft.updated_at < MAX_AGE_MS) return draft;
  } catch (_) { /* Start afresh when a stale draft cannot be parsed. */ }
  clearDraft();
  return null;
};
export const writeDraft = draft => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updated_at: Date.now() }));
export const normalizedAnswers = answers => Object.fromEntries(questions.map(q => [q.id,
  q.max && answers[q.id] !== null && answers[q.id] !== '' ? Number(answers[q.id]) : (answers[q.id] || null)]));

export const previewSummary = answers => {
  const knowledge = { beginner: '你目前觉得自己刚开始了解个人理财', basic: '你了解一些基础概念，希望进一步练习',
    intermediate: '你已尝试维护预算并跟踪开支', advanced: '你自述已有较多理财实践' };
  const tracking = { never: '你还没有开始回看开支', rarely: '你目前较少回看开支', monthly: '你大约每月回看一次开支',
    weekly: '你大约每周回看一次开支', daily: '你经常记录和分类开支' };
  const buffer = { none: '你目前没有储蓄', savings_no_fund: '你有储蓄，但尚未单独留出应急资金',
    lt1: '你的应急储蓄还不到一个月开支', '1to2': '你的应急储蓄约覆盖 1—2 个月开支',
    '3to6': '你的应急储蓄约覆盖 3—6 个月开支', gt6: '你的应急储蓄超过 6 个月开支' };
  let focus = '安排收支', reason = '先从了解收支和必要开支开始', topic = 'budget';
  if (['late', 'minimum'].includes(answers.q8)) reason = '你提到还款安排可能需要优先核对';
  else if (['none', 'savings_no_fund', 'lt1'].includes(answers.q2)) {
    focus = '留有余地'; reason = '你提到应急准备可以先梳理'; topic = 'buffer';
  } else if (['never', 'rarely'].includes(answers.q4)) reason = '你提到目前较少回看开支';
  else if (['always', 'often'].includes(answers.q5)) {
    focus = '理解取舍'; reason = '你提到实际开支有时超过计划'; topic = 'choice';
  }
  return { knowledge: knowledge[answers.q1] || '你暂未填写理财了解程度',
    tracking: tracking[answers.q4] || '你暂未填写回看开支的频率',
    buffer: buffer[answers.q2] || '你暂未填写应急储蓄情况',
    focus, reason, topic, basis: '仅依据本次问卷自述，尚不是客观财商能力测验。' };
};
