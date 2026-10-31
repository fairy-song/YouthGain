import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import InfoPageHeader from './InfoPageHeader';
import { FaChevronDown, FaChevronUp, FaSearch } from 'react-icons/fa';

const FAQPage = () => {
  // 状态
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState({});

  // FAQ分类
  const categories = [
    { id: 'all', name: '全部问题' },
    { id: 'account', name: '账户问题' },
    { id: 'features', name: '功能使用' },
    { id: 'payment', name: '支付问题' },
    { id: 'technical', name: '技术支持' },
    { id: 'security', name: '账户安全' }
  ];

  // FAQ数据
  const faqData = [
  {
    "id": "q1",
    "category": "account",
    "question": "如何注册青盈账户？",
    "answer": "当前使用邮箱和密码注册。登录页会说明是否处于本地模拟模式；本地模式不会验证真实密码。注册后可填写入门问卷，并在“我的”完善财务资料。"
  },
  {
    "id": "q2",
    "category": "account",
    "question": "忘记密码怎么办？",
    "answer": "当前界面没有密码重置入口。真实登录由项目配置的认证服务处理，请联系项目维护者；本地模拟模式可使用任意非空密码，不要输入真实密码。"
  },
  {
    "id": "q3",
    "category": "account",
    "question": "如何修改个人信息？",
    "answer": "进入“我的”，点击“编辑资料”，修改收入、必要开支、时区或自定规则，点击“保存资料”。这里不能更改登录邮箱和密码。"
  },
  {
    "id": "q4",
    "category": "features",
    "question": "自我探索结果是什么意思？",
    "answer": "结果根据本次自述回答汇总，反映你的习惯自评。它不是投资评级、能力诊断或账户余额，也不会因分数变化而自动处理你的钱。"
  },
  {
    "id": "q5",
    "category": "features",
    "question": "AI教练如何引用我的资料？",
    "answer": "默认只围绕你输入的问题交流。主动开启资料引用后，系统才会结合已记录账本及学习信息。回答可查看证据；记录不完整时试算也可能不完整。"
  },
  {
    "id": "q6",
    "category": "features",
    "question": "如何设置和跟踪财务目标？",
    "answer": "在“账本 → 储蓄目标”设置金额与截止日，保存后查看进度和留钱建议。锁定金额是系统内的规划记录，不会触发银行卡转账。"
  },
  {
    "id": "q7",
    "category": "payment",
    "question": "青盈会自动扣款或转账吗？",
    "answer": "当前版本没有购买、支付、自动转账或银行卡扣款功能。账本中的收入、支出和锁定储蓄都是记录与规划。"
  },
  {
    "id": "q8",
    "category": "payment",
    "question": "如何取消订阅？",
    "answer": "当前青盈没有付费订阅功能。知识库中的“自动续费”讲解的是外部平台的消费场景；外部会员需要到相应平台取消。"
  },
  {
    "id": "q9",
    "category": "payment",
    "question": "如何获取发票？",
    "answer": "当前系统不销售课程或会员，也没有开票入口。外部消费的发票请向实际商户申请。"
  },
  {
    "id": "q10",
    "category": "technical",
    "question": "使用过程中遇到卡顿怎么办？",
    "answer": "先等待当前保存完成，避免重复提交。检查本地前后端是否已启动，查看页面连接提示。仍有问题可到“联系与反馈”生成反馈草稿，记录操作和错误信息。"
  },
  {
    "id": "q11",
    "category": "technical",
    "question": "为什么数据同步失败？",
    "answer": "先检查连接和登录状态，再点击页面中的重试。当前支持手动记账、CSV/XLSX导入和语音转文字，不会自动同步银行账户。出现“已保存但刷新失败”时先刷新核对，不要再次记同一笔。"
  },
  {
    "id": "q12",
    "category": "security",
    "question": "如何控制资料使用？",
    "answer": "教练资料引用由你主动勾选，学校研究参与也需单独同意。退出研究会停止之后的新发布贡献；已经发布的群体统计无法追回。共用设备使用后请退出登录。"
  },
  {
    "id": "q13",
    "category": "security",
    "question": "如何开启双因素认证（2FA）？",
    "answer": "当前产品界面没有双因素认证（2FA）设置入口，也没有手机验证码注册功能。不要根据旧版占位说明寻找不存在的“安全中心”。"
  }
];

  // 处理搜索
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setExpandedQuestions({});
  };

  // 切换问题展开状态
  const toggleQuestion = (questionId) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  // 根据分类和搜索筛选FAQ
  const filteredFAQs = faqData.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="faq-page bg-neutral-50 min-h-screen pb-20">
      {/* 页面标题 */}
      <InfoPageHeader
        title="常见问题"
        subtitle="查找关于使用青盈的常见问题解答"
        category="resources"
      />

      <div className="container mx-auto px-4">
        {/* 搜索栏 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                aria-label="搜索常见问题"
                type="search"
                placeholder="搜索常见问题..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full px-12 py-4 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-success-500 text-lg"
              />
              <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400 text-xl" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 分类侧边栏 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-20">
              <h3 className="text-lg font-bold text-neutral-800 mb-4">问题分类</h3>
              <ul className="space-y-1">
                {categories.map(category => (
                  <li key={category.id}>
                    <button
                      className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                        activeCategory === category.id
                          ? 'bg-success-50 text-success-600 font-medium'
                          : 'text-neutral-600 hover:bg-neutral-50'
                      }`}
                      aria-pressed={activeCategory === category.id}
                      onClick={() => {
                        setActiveCategory(category.id);
                        setExpandedQuestions({});
                      }}
                    >
                      {category.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* FAQ内容区 */}
          <div className="lg:col-span-3">
            {filteredFAQs.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-neutral-800 mb-6">
                  {activeCategory === 'all'
                    ? '所有常见问题'
                    : categories.find(c => c.id === activeCategory)?.name}
                </h2>

                <div className="space-y-4">
                  {filteredFAQs.map(faq => (
                    <div
                      key={faq.id}
                      className="border border-neutral-200 rounded-lg overflow-hidden"
                    >
                      <button
                        className="w-full flex justify-between items-center p-5 bg-neutral-50 hover:bg-neutral-100 text-left transition-colors"
                        aria-expanded={Boolean(expandedQuestions[faq.id])}
                        onClick={() => toggleQuestion(faq.id)}
                      >
                        <span className="font-medium text-lg text-neutral-800">
                          {searchQuery ? (
                            highlightText(faq.question, searchQuery)
                          ) : (
                            faq.question
                          )}
                        </span>
                        {expandedQuestions[faq.id] ? (
                          <FaChevronUp className="text-neutral-500" />
                        ) : (
                          <FaChevronDown className="text-neutral-500" />
                        )}
                      </button>

                      {expandedQuestions[faq.id] && (
                        <div className="p-5 bg-white border-t border-neutral-200">
                          <p className="text-neutral-700 whitespace-pre-line">
                            {searchQuery ? (
                              highlightText(faq.answer, searchQuery)
                            ) : (
                              faq.answer
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-10 text-center">
                <div className="text-5xl text-neutral-300 mb-4">🔍</div>
                <h3 className="text-xl font-bold text-neutral-800 mb-2">未找到相关问题</h3>
                <p className="text-neutral-600 mb-4">
                  尝试使用不同的关键词或浏览其他分类
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory('all');
                      setExpandedQuestions({});
                    }}
                    className="bg-success-600 hover:bg-success-700 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    查看所有问题
                  </button>
                </div>
              </div>
            )}

            {/* 未解决问题反馈 */}
            <div className="mt-8 bg-neutral-50 border border-neutral-200 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-neutral-800 mb-3">没有找到你要的答案？</h3>
              <p className="text-neutral-600 mb-4">
                你可以整理反馈草稿，交给项目维护者。
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link to="/info/contact" className="btn btn-outline-primary">整理使用反馈</Link>
                <Link to="/info/tutorial" className="btn btn-primary">查看使用教程</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 高亮搜索文本
export const highlightText = (text, query) => {
  if (!query) return text;

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={index} className="bg-accent-200 font-medium">{part}</span>
      : part
  );
};

export default FAQPage;
