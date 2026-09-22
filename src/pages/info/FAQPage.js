import React, { useState } from 'react';
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
      id: 'q1',
      category: 'account',
      question: '如何注册青盈账户？',
      answer: '注册青盈账户非常简单：1) 在首页点击"注册"按钮; 2) 输入您的手机号码并获取验证码; 3) 设置账户密码; 4) 完成基本信息填写，包括姓名、邮箱等; 5) 阅读并同意用户协议和隐私政策; 6) 点击"完成注册"。注册完成后，您可以立即开始使用青盈的核心功能。'
    },
    {
      id: 'q2',
      category: 'account',
      question: '忘记密码怎么办？',
      answer: '如果您忘记了密码，可以通过以下步骤重置：1) 在登录页点击"忘记密码"; 2) 输入您注册时使用的手机号码; 3) 获取并输入验证码; 4) 设置新密码; 5) 点击"确认"完成密码重置。如果您遇到任何问题，请联系我们的客服团队获取帮助。'
    },
    {
      id: 'q3',
      category: 'account',
      question: '如何修改个人信息？',
      answer: '登录账户后，点击页面右上角的头像图标，选择"个人设置"，您可以在这里修改个人资料、联系方式、密码等信息。修改完成后，点击"保存更改"即可。'
    },
    {
      id: 'q4',
      category: 'features',
      question: '财务健康评估是如何计算的？',
      answer: '财务健康评估基于多维度指标，包括收支比例、储蓄率、债务比例、应急资金充足率、投资多样性等。系统会根据您提供的财务信息和行为数据，结合AI算法，生成一个综合的财务健康分数（满分100分）以及各维度的详细分析。评估结果每周更新一次，您可以通过改善财务行为来提高分数。'
    },
    {
      id: 'q5',
      category: 'features',
      question: 'AI教练如何为我提供个性化建议？',
      answer: 'AI教练基于您的财务数据、行为模式和目标，通过机器学习算法提供个性化的建议。系统会分析您的收入、支出、储蓄、债务和投资情况，识别改进空间，并根据您的财务目标提出具体的行动建议。随着您使用的时间增长，AI教练会不断学习和适应您的需求，提供越来越精准的指导。'
    },
    {
      id: 'q6',
      category: 'features',
      question: '如何设置和跟踪财务目标？',
      answer: '在应用的"目标"页面，您可以添加新的财务目标，如应急基金、买房、旅行、教育金等。设置目标时，需要输入目标金额和预期完成日期。系统会自动计算所需的储蓄计划，并在仪表板中显示进度。您可以随时调整目标，也可以设置提醒和自动转账来保持进度。'
    },
    {
      id: 'q7',
      category: 'payment',
      question: '青盈支持哪些支付方式？',
      answer: '青盈支持多种支付方式，包括信用卡/借记卡支付（支持Visa、MasterCard、银联等）、支付宝、微信支付以及银行转账。在升级至高级会员或购买课程时，您可以选择适合自己的支付方式。'
    },
    {
      id: 'q8',
      category: 'payment',
      question: '订阅费用如何计算？如何取消订阅？',
      answer: '青盈提供月度和年度两种订阅模式，年度订阅可享受优惠价格。订阅费用将在每个付费周期开始时自动扣除。如需取消订阅，请在"账户设置">"订阅管理"中点击"取消订阅"，并按照指引完成操作。取消后，您仍可使用当前付费周期内的服务，直到周期结束。'
    },
    {
      id: 'q9',
      category: 'payment',
      question: '如何获取发票？',
      answer: '完成付费后，您可以在"账户设置">"消费记录"中找到相应的交易记录，点击"申请发票"并填写发票信息。我们会在1-3个工作日内通过邮件发送电子发票。如需纸质发票，请联系客服说明情况。'
    },
    {
      id: 'q10',
      category: 'technical',
      question: '使用过程中遇到卡顿怎么办？',
      answer: '如果遇到应用卡顿，可以尝试以下解决方法：1) 检查网络连接是否稳定; 2) 清除浏览器缓存或应用缓存; 3) 更新应用至最新版本; 4) 重新启动设备; 5) 如问题持续存在，请收集问题发生的具体情况和截图，联系技术支持团队。'
    },
    {
      id: 'q11',
      category: 'technical',
      question: '为什么数据同步失败？',
      answer: '数据同步失败可能由以下原因导致：1) 网络连接不稳定; 2) 账户授权过期; 3) 第三方银行或金融服务的API变更; 4) 系统维护。建议检查网络连接，重新授权账户，如问题持续存在，请联系客服获取支持。'
    },
    {
      id: 'q12',
      category: 'security',
      question: '青盈如何保障用户数据安全？',
      answer: '青盈采取多重措施保障用户数据安全：1) 全程数据加密，包括传输和存储加密; 2) 严格的访问控制和权限管理; 3) 定期安全审计和漏洞扫描; 4) 合规的数据处理流程，符合相关法律法规要求; 5) 不会在未经授权的情况下分享用户个人信息给第三方。'
    },
    {
      id: 'q13',
      category: 'security',
      question: '如何开启双因素认证？',
      answer: '为提高账户安全性，我们强烈建议开启双因素认证(2FA)：1) 进入"账户设置">"安全中心"; 2) 点击"双因素认证"旁边的"开启"; 3) 选择认证方式（手机验证码、认证应用等）; 4) 按照指引完成设置; 5) 设置完成后，每次登录都需要输入密码和验证码，为账户提供双重保障。'
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
                type="text"
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
                如果上述内容没有解答您的疑问，欢迎联系我们的客服团队
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <a
                  href="mailto:support@youthgain.com"
                  className="bg-white border border-success-600 text-success-600 hover:bg-success-50 px-6 py-3 rounded-md transition-colors inline-block"
                >
                  发送邮件
                </a>
                <a
                  href="tel:4001234567"
                  className="bg-success-600 hover:bg-success-700 text-white px-6 py-3 rounded-md transition-colors inline-block"
                >
                  电话咨询
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 高亮搜索文本
const highlightText = (text, query) => {
  if (!query) return text;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  
  return parts.map((part, index) => 
    part.toLowerCase() === query.toLowerCase() 
      ? <span key={index} className="bg-accent-200 font-medium">{part}</span>
      : part
  );
};

export default FAQPage; 