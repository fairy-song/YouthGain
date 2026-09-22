import React, { useState } from 'react';
import InfoPageHeader from './InfoPageHeader';
import { FaSearch, FaBookOpen, FaChartLine, FaHandHoldingUsd, FaHome, FaPiggyBank, FaUniversity, FaBriefcase, FaGraduationCap } from 'react-icons/fa';

const KnowledgePage = () => {
  // 状态
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  
  // 分类数据
  const categories = [
    { id: 'all', name: '全部', icon: <FaBookOpen /> },
    { id: 'basic', name: '基础金融', icon: <FaPiggyBank /> },
    { id: 'investment', name: '投资理财', icon: <FaChartLine /> },
    { id: 'credit', name: '信用管理', icon: <FaUniversity /> },
    { id: 'tax', name: '税务规划', icon: <FaBriefcase /> },
    { id: 'property', name: '房产金融', icon: <FaHome /> },
    { id: 'retirement', name: '退休规划', icon: <FaHandHoldingUsd /> },
    { id: 'education', name: '教育金融', icon: <FaGraduationCap /> }
  ];
  
  // 文章数据 - 实际应用中应该从API获取
  const articles = [
    {
      id: 1,
      title: '如何建立个人应急基金',
      summary: '本文介绍应急基金的重要性、合理规模以及如何逐步建立你的应急资金储备。',
      category: 'basic',
      readTime: 5,
      date: '2024-02-15',
      image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 2,
      title: '股票投资入门：基本概念和策略',
      summary: '了解股票市场的基本运作机制、常见术语解释以及适合新手的投资策略。',
      category: 'investment',
      readTime: 8,
      date: '2024-02-10',
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 3,
      title: '信用评分的影响因素及提升方法',
      summary: '详细解析影响个人信用评分的关键因素，以及如何通过良好的财务习惯提高信用分数。',
      category: 'credit',
      readTime: 6,
      date: '2024-02-05',
      image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 4,
      title: '个人所得税专项扣除全指南',
      summary: '全面介绍个人所得税专项附加扣除的六大类目，帮助你合法节税。',
      category: 'tax',
      readTime: 10,
      date: '2024-01-28',
      image: 'https://images.unsplash.com/photo-1586486855514-8c10fda68a5b?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 5,
      title: '首次购房者必读：按揭贷款详解',
      summary: '针对首次购房人群，解析房贷类型、利率计算、还款方式以及申请流程。',
      category: 'property',
      readTime: 12,
      date: '2024-01-20',
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 6,
      title: '退休金规划：30岁前应做的准备',
      summary: '年轻人如何通过提前规划，利用复利效应为退休生活奠定坚实基础。',
      category: 'retirement',
      readTime: 7,
      date: '2024-01-15',
      image: 'https://images.unsplash.com/photo-1556742077-0a6b6a4a4ac4?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 7,
      title: '子女教育金规划指南',
      summary: '如何为子女的教育费用做长期规划，包括不同阶段的费用预估和投资建议。',
      category: 'education',
      readTime: 9,
      date: '2024-01-10',
      image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 8,
      title: '预算管理：50/30/20法则详解',
      summary: '学习如何使用50/30/20预算法则有效管理个人收入，平衡需求与储蓄。',
      category: 'basic',
      readTime: 5,
      date: '2024-01-05',
      image: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 9,
      title: '指数基金投资策略',
      summary: '了解指数基金的特点、优势以及如何将其纳入长期投资组合的方法。',
      category: 'investment',
      readTime: 8,
      date: '2023-12-28',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 10,
      title: '如何正确使用信用卡',
      summary: '信用卡的聪明使用技巧，避免常见陷阱，提高个人信用评分。',
      category: 'credit',
      readTime: 6,
      date: '2023-12-20',
      image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 11,
      title: '年终奖金税务优化方案',
      summary: '解析年终奖的计税方式，并提供合法的税务筹划建议，最大化奖金实际收益。',
      category: 'tax',
      readTime: 7,
      date: '2023-12-15',
      image: 'https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 12,
      title: '房贷提前还款的利弊分析',
      summary: '探讨房贷提前还款的优缺点，帮助你根据个人财务状况做出明智决策。',
      category: 'property',
      readTime: 9,
      date: '2023-12-10',
      image: 'https://images.unsplash.com/photo-1560518883-f5138f1ee1a1?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    }
  ];
  
  // 处理搜索输入变化
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };
  
  // 筛选文章
  const filteredArticles = articles.filter(article => {
    const matchesCategory = activeCategory === 'all' || article.category === activeCategory;
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });
  
  return (
    <div className="knowledge-page bg-neutral-50 min-h-screen pb-20">
      {/* 页面标题 */}
      <InfoPageHeader 
        title="金融知识库" 
        subtitle="探索丰富的金融知识内容，提升你的财务素养"
        category="resources"
      />
      
      <div className="container mx-auto px-4">
        {/* 搜索和筛选区 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center mb-6">
            <div className="relative flex-grow mb-4 md:mb-0 md:mr-4">
              <input
                type="text"
                placeholder="搜索金融知识..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full px-10 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-success-500"
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" />
            </div>
            
            <div className="text-center">
              <span className="text-neutral-600 mr-2 hidden md:inline">共找到 {filteredArticles.length} 个结果</span>
            </div>
          </div>
          
          {/* 分类标签 */}
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category.id}
                className={`flex items-center px-4 py-2 rounded-full border transition-colors ${
                  activeCategory === category.id
                    ? 'bg-success-600 text-white border-success-600'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                }`}
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="mr-2">{category.icon}</span>
                {category.name}
              </button>
            ))}
          </div>
        </div>
        
        {/* 文章卡片网格 */}
        {filteredArticles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredArticles.map(article => (
              <div key={article.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 overflow-hidden">
                  <img 
                    src={article.image} 
                    alt={article.title} 
                    className="w-full h-full object-cover transition-transform hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-medium text-neutral-500">{article.date}</span>
                    <span className="text-xs font-medium text-neutral-500">{article.readTime} 分钟阅读</span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-800 mb-2">{article.title}</h3>
                  <p className="text-neutral-600 mb-4 line-clamp-3">{article.summary}</p>
                  <button className="text-success-600 font-medium hover:text-success-800 inline-flex items-center">
                    阅读全文
                    <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-4xl text-neutral-300 mb-4">😕</div>
            <h3 className="text-xl font-bold text-neutral-800 mb-2">未找到相关内容</h3>
            <p className="text-neutral-600 mb-4">
              尝试调整搜索关键词或选择不同的分类
            </p>
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="text-success-600 font-medium hover:text-success-800"
            >
              清除所有筛选条件
            </button>
          </div>
        )}
        
        {/* 热门专题 */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-neutral-800 mb-6">热门专题</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-r from-primary-700 to-primary-900 rounded-lg shadow-md p-6 text-white">
              <h3 className="text-xl font-bold mb-3">新手理财入门</h3>
              <p className="mb-4 opacity-90">从零开始学习财务管理的基本概念和实用技巧，为财务自由打下坚实基础。</p>
              <button className="bg-white text-primary-700 px-4 py-2 rounded-md font-medium transition-colors hover:bg-primary-50">
                开始学习
              </button>
            </div>
            <div className="bg-gradient-to-r from-secondary-700 to-secondary-900 rounded-lg shadow-md p-6 text-white">
              <h3 className="text-xl font-bold mb-3">投资组合构建</h3>
              <p className="mb-4 opacity-90">了解如何根据个人风险偏好和财务目标，构建适合自己的多元化投资组合。</p>
              <button className="bg-white text-secondary-600 px-4 py-2 rounded-md font-medium transition-colors hover:bg-secondary-50">
                开始学习
              </button>
            </div>
            <div className="bg-gradient-to-r from-success-600 to-success-800 rounded-lg shadow-md p-6 text-white">
              <h3 className="text-xl font-bold mb-3">家庭财务规划</h3>
              <p className="mb-4 opacity-90">掌握家庭预算管理、保险规划、教育金储备等实用知识，保障家庭财务安全。</p>
              <button className="bg-white text-success-600 px-4 py-2 rounded-md font-medium transition-colors hover:bg-success-50">
                开始学习
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgePage; 