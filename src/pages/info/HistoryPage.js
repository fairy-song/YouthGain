import React from 'react';
import InfoPageHeader from './InfoPageHeader';
import { FaFlag, FaUsers, FaAward, FaStar, FaChartLine, FaGlobe, FaRocket } from 'react-icons/fa';

const HistoryPage = () => {
  // 发展里程碑数据
  const milestones = [
    {
      year: 2022,
      quarter: '一季度',
      title: '公司成立',
      description: '青盈在北京成立，核心团队由来自金融、科技和教育领域的专业人士组成，致力于利用AI技术提升大众金融素养。',
      icon: <FaFlag className="text-primary-700" />
    },
    {
      year: 2022,
      quarter: '二季度',
      title: '产品概念验证',
      description: '完成产品概念验证，与多位金融教育专家合作设计了初版金融素养教育体系，并开始构建AI训练数据集。',
      icon: <FaRocket className="text-primary-700" />
    },
    {
      year: 2022,
      quarter: '三季度',
      title: '首轮融资',
      description: '获得500万天使轮融资，投资方包括知名风险投资机构和金融教育领域资深天使投资人。',
      icon: <FaChartLine className="text-primary-700" />
    },
    {
      year: 2022,
      quarter: '四季度',
      title: '测试版上线',
      description: '青盈App测试版上线，邀请1000名用户参与内测，收集大量有价值的用户反馈，为产品迭代奠定基础。',
      icon: <FaUsers className="text-primary-700" />
    },
    {
      year: 2023,
      quarter: '一季度',
      title: '正式版发布',
      description: '青盈App正式版发布，提供个性化财务健康评估、AI教练互动和金融知识学习等核心功能，首月用户突破1万。',
      icon: <FaStar className="text-primary-700" />
    },
    {
      year: 2023,
      quarter: '二季度',
      title: '校园合作计划',
      description: '启动"金融素养校园行"计划，与5所重点大学合作，为大学生提供免费的金融素养课程和工具，提高年轻人的理财意识。',
      icon: <FaGlobe className="text-primary-700" />
    },
    {
      year: 2023,
      quarter: '三季度',
      title: '行业认可',
      description: '获得"2023中国金融科技创新企业50强"和"年度最佳金融教育应用"两项行业大奖，品牌影响力显著提升。',
      icon: <FaAward className="text-primary-700" />
    },
    {
      year: 2023,
      quarter: '四季度',
      title: 'A轮融资',
      description: '完成3000万A轮融资，用于扩大团队规模、提升AI技术能力和拓展B端市场。同期月活用户突破5万。',
      icon: <FaChartLine className="text-primary-700" />
    },
    {
      year: 2024,
      quarter: '一季度',
      title: '企业服务推出',
      description: '推出针对企业的"员工财务健康计划"，为企业提供员工财务健康评估和培训解决方案，首批签约20家企业客户。',
      icon: <FaUsers className="text-primary-700" />
    },
    {
      year: 2024,
      quarter: '二季度',
      title: '全国布局',
      description: '在北京、上海、深圳、成都设立分支机构，开始全国市场布局，同时组建专业的商务拓展团队。',
      icon: <FaGlobe className="text-primary-700" />
    },
  ];

  // 关键数据
  const keyStats = [
    { label: '服务用户', value: '10万+' },
    { label: '企业客户', value: '20+' },
    { label: '课程内容', value: '500+小时' },
    { label: '用户满意度', value: '96%' }
  ];

  return (
    <div className="history-page bg-neutral-50 min-h-screen pb-20">
      {/* 页面标题 */}
      <InfoPageHeader 
        title="发展历程" 
        subtitle="见证青盈从创立到现在的成长轨迹"
        category="about"
      />
      
      <div className="container mx-auto px-4">
        {/* 简介 */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-16">
          <h2 className="text-3xl font-bold text-center mb-8 text-neutral-800">我们的发展历程</h2>
          <p className="text-lg text-neutral-700 mb-6 max-w-3xl mx-auto">
            青盈（YouthGain）自2022年创立以来，一直致力于通过科技手段提升大众的金融素养和理财能力。在短短几年间，我们从一个创新想法成长为行业内具有一定影响力的金融科技教育品牌，见证了无数用户财务健康的改善和财务理念的提升。
          </p>
          
          {/* 关键数据展示 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-10">
            {keyStats.map((stat, index) => (
              <div key={index} className="bg-primary-50 rounded-lg p-6 text-center">
                <div className="text-3xl font-bold text-primary-700 mb-2">{stat.value}</div>
                <div className="text-neutral-700">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 时间线 */}
        <div className="relative">
          {/* 垂直线 */}
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-primary-200 hidden md:block"></div>
          
          <div className="space-y-12">
            {milestones.map((milestone, index) => (
              <div key={index} className={`flex flex-col md:flex-row ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                {/* 左侧或右侧空白区 */}
                <div className="md:w-1/2"></div>
                
                {/* 中间时间点标记 */}
                <div className="absolute left-1/2 transform -translate-x-1/2 hidden md:flex flex-col items-center">
                  <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center z-10">
                    {milestone.icon}
                  </div>
                  <div className="text-primary-700 font-bold mt-2">{milestone.year}</div>
                  <div className="text-sm text-neutral-500">{milestone.quarter}</div>
                </div>
                
                {/* 内容框 */}
                <div className={`md:w-1/2 ${index % 2 === 0 ? 'md:pr-12' : 'md:pl-12'}`}>
                  <div className="bg-white rounded-lg shadow-md p-6 relative">
                    {/* 移动端显示的图标和年份 */}
                    <div className="flex items-center mb-4 md:hidden">
                      <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center mr-3">
                        {milestone.icon}
                      </div>
                      <div>
                        <div className="text-primary-700 font-bold">{milestone.year}</div>
                        <div className="text-sm text-neutral-500">{milestone.quarter}</div>
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-neutral-800 mb-2">{milestone.title}</h3>
                    <p className="text-neutral-700">{milestone.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 未来展望 */}
        <div className="bg-gradient-to-r from-primary-700 to-primary-900 text-white rounded-lg shadow-lg p-10 mt-16">
          <h2 className="text-3xl font-bold mb-6 text-center">未来展望</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
              <h3 className="text-xl font-bold mb-3">国际化拓展</h3>
              <p className="text-white/90">
                计划在未来两年内进入东南亚市场，为更多新兴市场的用户提供定制化的金融教育服务，助力全球金融素养的提升。
              </p>
            </div>
            <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
              <h3 className="text-xl font-bold mb-3">产品矩阵扩充</h3>
              <p className="text-white/90">
                围绕金融教育核心，拓展至家庭财富管理、子女理财教育等领域，构建完整的个人和家庭财务健康生态系统。
              </p>
            </div>
            <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
              <h3 className="text-xl font-bold mb-3">技术创新</h3>
              <p className="text-white/90">
                持续投入AI和大数据技术研发，提高个性化推荐和教学效果，为用户提供更精准、更有效的金融学习体验。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage; 