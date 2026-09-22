// ============================================================
// billParser.js —— 口述/文本账单抽取器（规则引擎）
//
// 把"昨天下午在蜜雪冰城买了一杯柠檬水，一共27块，手机付的"
// 解析成：金额 27、商户 蜜雪冰城、商品 [柠檬水]、类别 饮品、备注 昨天下午/手机付的。
//
// 设计原则：
// 1. 确定性规则（正则 + 关键词），不依赖外部 AI 服务，可本地测试；
// 2. 金额识别分强弱两级——带"元/块"的单位词是强候选，裸数字是弱候选，
//    避免把"下午3点""3个包子"里的数字误当金额；
// 3. 识别不到金额或识别到多个金额时，通过 amounts 列表交给用户处理，
//    组件层负责"让用户选择"或"提示补充"。
// ============================================================

// ---- 金额识别 ----

// 金额单位词：跟在这些词前面的数字是"确定是钱"
const STRONG_UNITS = ['块钱', '块', '元', 'rmb', 'RMB', '人民币'];

// 明确不是金额的后缀：数量词、时间词、日期词
const NON_MONEY_UNITS = ['点', '时', '分', '秒', '号', '月', '日', '个', '杯', '份', '瓶', '袋',
  '盒', '碗', '双', '件', '张', '包', '本', '只', '台', '人', '次', '回', '折'];

// 商品/动作后跟的数量词（"一杯""两份"里的数字不算金额）
const QUANTIFIER_UNITS = ['个', '杯', '份', '瓶', '袋', '盒', '碗', '双', '件', '张', '包', '本', '只', '台'];

// ---- 商户识别 ----

// 模式1：在「XX」+ 动作词
const MERCHANT_ACTION_RE = /在([\u4e00-\u9fa5A-Za-z0-9]{1,12}?)(?:买|花|点|吃|喝|付|用|充|消费|下单|结账|买单)/;
// 模式2：「XX店/食堂/超市...」
const MERCHANT_PLACE_RE = /([\u4e00-\u9fa5A-Za-z0-9]{1,12}?)(?:店|食堂|超市|小卖部|餐厅|火锅店|奶茶店|咖啡店|咖啡厅|便利店|广场|商城|书店|药房|医院|酒吧|影院|面馆|烧烤店)/;

// 商户候选里不能包含这些代词（"我这""那里"不是商户名）
const PRONOUN_BLACKLIST = ['我', '你', '他', '她', '我们', '你们', '他们', '她们', '这', '那', '咱'];

// ---- 商品/类别 ----

// 动作词 + 商品短语
const ITEM_ACTION_RE = /(?:买|喝|吃|点|充|订|购|拿)了?([\u4e00-\u9fa5A-Za-z0-9]{1,20}?)(?:花了|用了|一共|共|付了|价格|金额|[,，。.;；]|$)/;

// 商品短语切分：连接词与量词（"一杯"里的一二两三四五等中文数字也要一起切掉）
const ITEM_SPLIT_RE = /和|与|、|及|加|还|跟|[\d一二两三四五六七八九十]*[杯份瓶袋盒碗双件张包本只台个顿]/;

// 类别关键词规则：按顺序匹配，先命中者优先
const CATEGORY_RULES = [
  { category: '餐饮', keywords: ['食堂', '饭', '餐', '火锅', '烧烤', '炸鸡', '汉堡', '外卖', '面', '粉', '饺子',
      '炒菜', '麻辣烫', '串串', '早餐', '午餐', '晚餐', '夜宵', '盖饭', '米线', '包子', '煎饼'] },
  { category: '饮品', keywords: ['奶茶', '咖啡', '果汁', '饮料', '茶', '柠檬水', '可乐', '雪碧', '星巴克',
      '蜜雪', '瑞幸', '喜茶', '酸奶', '牛奶'] },
  { category: '零食', keywords: ['零食', '薯片', '饼干', '糖果', '巧克力', '冰淇淋', '蛋糕', '面包', '甜点', '坚果'] },
  { category: '交通', keywords: ['地铁', '公交', '打车', '滴滴', '出租', '高铁', '火车', '共享单车', '骑行', '加油', '停车'] },
  { category: '娱乐', keywords: ['电影', '游戏', '皮肤', '充值', '会员', 'ktv', 'KTV', '桌游', '密室', '剧本杀', '景区', '门票', '演唱'] },
  { category: '购物', keywords: ['衣服', '裤子', '鞋', '包', '快递', '淘宝', '拼多多', '京东', '商场', '超市', '日用品', '饰品'] },
  { category: '学习', keywords: ['书', '教材', '打印', '文具', '课程', '培训', '考试', '报名', '资料'] },
  { category: '房租', keywords: ['房租', '租金', '水电', '物业', '燃气'] },
  { category: '话费', keywords: ['话费', '流量', '手机卡', '宽带'] },
  { category: '医疗', keywords: ['药', '药店', '医院', '挂号', '体检', '口罩', '感冒'] },
];

// ---- 备注清洗 ----

// 金额引导词（"一共27块"里的"一共"不留在备注里）
const LEADING_WORDS_RE = /一共|共|总共|合计|花了|用了|付了|消费|买单|结账|价格|金额|大概|约|差不多/g;

// ---- 主函数 ----

/**
 * 解析一句口述/粘贴的消费文本。
 * @param {string} rawText 原始文本（ASR 结果或手动输入）
 * @returns {Object}
 *   {
 *     amount: number|null        唯一金额；null 时看 amounts
 *     amounts: number[]          候选金额列表（>1 个时让用户选择）
 *     multipleAmounts: boolean   是否识别到多个金额
 *     missingAmount: boolean     是否完全没识别到金额
 *     merchant: string           商户（可能为空）
 *     items: string[]            商品列表
 *     category: string           推断类别（默认"其他"）
 *     note: string               口语剩余描述（时间、付款方式等）
 *     warnings: string[]         需要提示用户的信息
 *   }
 */
export function parseBillText(rawText) {
  const text = (rawText || '').trim();
  const warnings = [];

  if (!text) {
    return { amount: null, amounts: [], multipleAmounts: false, missingAmount: true,
      merchant: '', items: [], category: '其他', note: '', warnings: ['请先说出或输入消费内容'] };
  }

  // ---- 1. 提取所有候选金额 ----
  const strongAmounts = [];
  const weakAmounts = [];
  const numRe = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = numRe.exec(text)) !== null) {
    const value = parseFloat(m[0]);
    const after = text.slice(m.index + m[0].length).match(/^\s*(\S{0,2})/)[1];

    // 数字太小（<1 且无单位）不可能是金额；过大直接忽略（防把卡号当金额）
    if (value > 0 && value <= 1000000) {
      const hasStrongUnit = STRONG_UNITS.some((u) => after.startsWith(u));
      const hasNonMoneyUnit = NON_MONEY_UNITS.some((u) => after.startsWith(u));
      if (hasStrongUnit) {
        strongAmounts.push({ value, index: m.index, len: m[0].length + after.indexOf(STRONG_UNITS.find((u) => after.startsWith(u))) + STRONG_UNITS.find((u) => after.startsWith(u)).length });
      } else if (!hasNonMoneyUnit) {
        // 弱候选：裸数字（"打车花了15"）。但要排除像"3个"里的数量词
        const hasQuantifier = QUANTIFIER_UNITS.some((u) => after.startsWith(u));
        if (!hasQuantifier) {
          weakAmounts.push({ value, index: m.index, len: m[0].length });
        }
      }
    }
  }

  // 有强候选就只用强候选（避免"27块和3个"把 3 也当金额）
  const amountCandidates = strongAmounts.length > 0 ? strongAmounts : weakAmounts;

  let amount = null;
  let multipleAmounts = false;
  let missingAmount = false;

  if (amountCandidates.length === 1) {
    amount = amountCandidates[0].value;
  } else if (amountCandidates.length > 1) {
    // 多个金额：交给用户选择（如"奶茶27炸鸡30"）
    multipleAmounts = true;
    amount = amountCandidates[0].value; // 默认取第一个，组件里可切换
    warnings.push(`识别到 ${amountCandidates.length} 个金额，请确认哪一个是这笔消费`);
  } else {
    missingAmount = true;
    warnings.push('没听清金额，请补充或重新描述（例如"花了25块"）');
  }

  // ---- 2. 提取商户 ----
  let merchant = '';
  let merchantMatch = text.match(MERCHANT_ACTION_RE) || text.match(MERCHANT_PLACE_RE);
  if (merchantMatch) {
    const candidate = merchantMatch[1];
    if (!PRONOUN_BLACKLIST.some((p) => candidate.includes(p))) {
      merchant = candidate;
    }
  }

  // ---- 3. 提取商品 ----
  const items = [];
  let itemPhrase = null;
  const itemMatch = text.match(ITEM_ACTION_RE);
  if (itemMatch) {
    itemPhrase = itemMatch[1];
    itemPhrase.split(ITEM_SPLIT_RE)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .forEach((s) => {
        if (!items.includes(s)) items.push(s);
      });
  }

  // ---- 4. 推断类别（商品优先，其次整句） ----
  let category = '其他';
  const searchText = (items.join('') || '') + text;
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => searchText.includes(k))) {
      category = rule.category;
      break;
    }
  }

  // ---- 5. 生成备注：删掉已识别的金额/商户/商品短语，保留时间、方式等口语 ----
  // 关键：所有区间都取自原始 text 的索引，在原文上一次性收集，再从后往前删，
  // 避免先删商户后文本变短、金额索引全部错位的 bug。
  const cutRanges = [];
  if (merchant) {
    const idx = text.indexOf(merchant);
    if (idx >= 0) cutRanges.push([idx, idx + merchant.length]);
  }
  amountCandidates.forEach((a) => cutRanges.push([a.index, a.index + a.len]));
  if (itemPhrase) {
    const idx = text.indexOf(itemPhrase);
    if (idx >= 0) cutRanges.push([idx, idx + itemPhrase.length]);
  }

  let note = text;
  // 区间可能相邻或重叠，先合并再删除更稳
  if (cutRanges.length > 0) {
    cutRanges.sort((x, y) => x[0] - y[0]);
    const merged = [cutRanges[0]];
    for (let i = 1; i < cutRanges.length; i += 1) {
      const last = merged[merged.length - 1];
      const cur = cutRanges[i];
      if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else merged.push(cur);
    }
    note = '';
    let cursor = 0;
    merged.forEach(([s, e]) => {
      note += text.slice(cursor, s);
      cursor = e;
    });
    note += text.slice(cursor);
  }
  // 清理引导词与标点、压缩空白
  note = note
    .replace(LEADING_WORDS_RE, '')
    .replace(/[，。,.！!？?；;：:""''（）()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 去掉孤零零的动词残留（如"买""付"）
  note = note.replace(/^(买了?|付了?|花了?|点了?|吃了?|喝了?)\s*/, '').trim();

  return {
    amount,
    amounts: amountCandidates.map((a) => a.value),
    multipleAmounts,
    missingAmount,
    merchant,
    items,
    category,
    note,
    warnings,
  };
}

/** 把解析结果格式化成回显表单用的初始值。 */
export function parsedToForm(parsed, today) {
  return {
    amount: parsed.amount != null ? String(parsed.amount) : '',
    category: parsed.category || '其他',
    merchant: parsed.merchant || '',
    items: (parsed.items || []).join('、'),
    note: parsed.note || '',
    date: today || new Date().toISOString().slice(0, 10),
    hour: '',
  };
}

/** 检查表单是否可提交（金额、类别、日期必填）。 */
export function validateBillForm(form) {
  const amount = parseFloat(form.amount);
  if (isNaN(amount) || amount <= 0) return '请输入大于 0 的金额';
  if (!form.category || !form.category.trim()) return '请选择或输入消费类别';
  if (!form.date) return '请选择消费日期';
  return null;
}
