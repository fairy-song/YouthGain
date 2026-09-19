import React from 'react';
import InfoPageHeader from './InfoPageHeader';
import { FaLinkedin, FaEnvelope, FaGraduationCap } from 'react-icons/fa';

const TeamPage = () => {
  // 虚构的团队成员数据
  const teamMembers = [
    {
      id: 1,
      name: '李明远',
      role: '创始人 & CEO',
      image: 'https://randomuser.me/api/portraits/men/32.jpg',
      bio: '金融科技领域连续创业者，前某大型银行AI实验室负责人，在金融科技和人工智能领域拥有超过15年经验。清华大学金融学博士，致力于通过科技提升大众金融素养。',
      linkedin: '#',
      email: 'mingyuan.li@youthgain.com',
      education: '清华大学 金融学博士'
    },
    {
      id: 2,
      name: '王思颖',
      role: 'CTO & 算法专家',
      image: 'https://randomuser.me/api/portraits/women/44.jpg',
      bio: '人工智能及机器学习专家，在多个国际AI大赛中获奖。负责青盈核心算法和AI模型的开发。曾任职于BAT等一线科技公司，拥有多项AI相关专利。',
      linkedin: '#',
      email: 'siying.wang@youthgain.com',
      education: '北京大学 计算机科学博士'
    },
    {
      id: 3,
      name: '张瑞',
      role: '金融教育总监',
      image: 'https://randomuser.me/api/portraits/men/45.jpg',
      bio: '拥有15年金融教育经验的资深专家，曾任某知名金融机构培训总监。专注于普惠金融教育，开发了多套适合不同层次人群的金融素养课程体系。',
      linkedin: '#',
      email: 'rui.zhang@youthgain.com',
      education: '复旦大学 经济学硕士'
    },
    {
      id: 4,
      name: '陈佳怡',
      role: 'UX设计负责人',
      image: 'https://randomuser.me/api/portraits/women/68.jpg',
      bio: '资深用户体验设计师，专注于金融科技产品的交互设计。曾主导多个大型金融科技产品的设计工作，擅长将复杂的金融概念转化为直观易用的界面。',
      linkedin: '#',
      email: 'jiayi.chen@youthgain.com',
      education: '中央美术学院 设计学硕士'
    },
    {
      id: 5,
      name: '赵鹏',
      role: '市场营销总监',
      image: 'https://randomuser.me/api/portraits/men/55.jpg',
      bio: '数字营销专家，在金融科技领域拥有丰富的市场推广经验。擅长内容营销和用户增长策略，曾帮助多家创业公司实现快速用户增长。',
      linkedin: '#',
      email: 'peng.zhao@youthgain.com',
      education: '上海交通大学 工商管理硕士'
    },
    {
      id: 6,
      name: '林美玲',
      role: '客户成功总监',
      image: 'https://randomuser.me/api/portraits/women/33.jpg',
      bio: '拥有10年客户服务和运营经验，致力于提升用户体验和满意度。擅长建立高效的客户服务体系，曾获得行业最佳客户服务团队奖。',
      linkedin: '#',
      email: 'meiling.lin@youthgain.com',
      education: '浙江大学 管理学学士'
    },
  ];

  // 顾问团队
  const advisors = [
    {
      id: 1,
      name: '郑教授',
      role: '学术顾问',
      image: 'https://randomuser.me/api/portraits/men/78.jpg',
      bio: '著名金融学者，北京大学金融学教授，中国普惠金融研究院特聘研究员。在金融素养教育领域发表过多篇重要论文，为多个国家级金融教育项目提供咨询。',
      education: '哈佛大学 经济学博士'
    },
    {
      id: 2,
      name: '黄总',
      role: '金融行业顾问',
      image: 'https://randomuser.me/api/portraits/men/92.jpg',
      bio: '某国有大型银行前副行长，拥有30年银行业经验，对金融市场和监管政策有深入理解。现担任多家金融科技公司顾问，致力于推进金融创新与监管的平衡发展。',
      education: '中国人民大学 金融学硕士'
    },
  ];

  return (
    <div className="team-page bg-gray-50 min-h-screen pb-20">
      {/* 页面标题 */}
      <InfoPageHeader 
        title="团队介绍" 
        subtitle="了解我们背后的专业团队，共同致力于提升每个人的金融素养"
        category="about"
      />
      
      {/* 公司简介 */}
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8 mb-16">
          <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">我们的故事</h2>
          <div className="max-w-3xl mx-auto">
            <p className="text-lg text-gray-700 mb-6">
              青盈（YouthGain）成立于2022年，是一家专注于金融素养教育和个人财务规划的科技公司。我们的创始团队由来自金融、科技和教育领域的专业人士组成，怀揣着同一个使命：通过人工智能技术，让金融教育变得更加个性化、实用和普及。
            </p>
            <p className="text-lg text-gray-700 mb-6">
              在创立初期，我们深入研究了中国居民的财务状况和金融行为习惯，发现许多人在面对金融决策时常感到困惑和无助。传统的金融教育往往过于理论化，难以应用到实际生活中。因此，我们决定开发一款AI金融教练，能够根据每个人的具体情况提供量身定制的建议和指导。
            </p>
            <p className="text-lg text-gray-700">
              经过两年的发展，青盈已经服务了超过10万名用户，帮助他们建立健康的财务习惯，做出更明智的理财决策。我们的愿景是成为中国领先的金融素养教育平台，让每个人都能掌握必要的金融知识和技能，实现财务自由。
            </p>
          </div>
        </div>
        
        {/* 核心团队 */}
        <h2 className="text-3xl font-bold text-center mb-10 text-gray-800">核心团队</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {teamMembers.map(member => (
            <div key={member.id} className="bg-white rounded-lg shadow-md overflow-hidden transform transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
              <div className="h-64 bg-gray-200 overflow-hidden">
                <img 
                  src={member.image} 
                  alt={member.name} 
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-800">{member.name}</h3>
                <p className="text-blue-600 font-medium mb-4">{member.role}</p>
                <p className="text-gray-700 mb-4">{member.bio}</p>
                <div className="flex items-center text-gray-500 mb-4">
                  <FaGraduationCap className="mr-2" />
                  <span>{member.education}</span>
                </div>
                <div className="flex space-x-3">
                  <a href={member.linkedin} className="text-blue-600 hover:text-blue-800">
                    <FaLinkedin size={20} />
                  </a>
                  <a href={`mailto:${member.email}`} className="text-blue-600 hover:text-blue-800">
                    <FaEnvelope size={20} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* 顾问团队 */}
        <h2 className="text-3xl font-bold text-center mb-10 text-gray-800">专家顾问</h2>
        <div className="space-y-8 mb-16">
          {advisors.map(advisor => (
            <div key={advisor.id} className="bg-white rounded-lg shadow-md overflow-hidden p-6 flex flex-col md:flex-row items-center">
              <div className="w-full md:w-1/4 mb-4 md:mb-0 md:mr-6 flex justify-center">
                <div className="h-40 w-40 rounded-full overflow-hidden">
                  <img 
                    src={advisor.image} 
                    alt={advisor.name} 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="w-full md:w-3/4 text-center md:text-left">
                <h3 className="text-xl font-bold text-gray-800">{advisor.name}</h3>
                <p className="text-blue-600 font-medium mb-2">{advisor.role}</p>
                <p className="text-gray-700 mb-3">{advisor.bio}</p>
                <div className="flex items-center text-gray-500 justify-center md:justify-start">
                  <FaGraduationCap className="mr-2" />
                  <span>{advisor.education}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* 使命和愿景 */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg shadow-lg p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
              <h3 className="text-2xl font-bold mb-4">我们的使命</h3>
              <p className="text-white/90">
                通过人工智能和教育创新，帮助每个人建立健康的财务习惯，提升金融素养，实现财务自由。
              </p>
            </div>
            <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
              <h3 className="text-2xl font-bold mb-4">我们的愿景</h3>
              <p className="text-white/90">
                成为中国领先的金融素养教育平台，让金融知识普及到每个家庭，让财务决策变得简单和明智。
              </p>
            </div>
          </div>
          <div className="p-6 bg-white/10 rounded-lg backdrop-blur-sm">
            <h3 className="text-2xl font-bold mb-4">我们的价值观</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="text-xl font-bold mb-2">用户至上</h4>
                <p className="text-white/80">我们的一切决策都以用户的需求和体验为中心，不断优化产品和服务。</p>
              </div>
              <div>
                <h4 className="text-xl font-bold mb-2">科技创新</h4>
                <p className="text-white/80">我们相信科技的力量可以改变金融教育的方式，让学习变得更加有效和有趣。</p>
              </div>
              <div>
                <h4 className="text-xl font-bold mb-2">诚信透明</h4>
                <p className="text-white/80">我们在经营中坚守诚信原则，保持公开透明，赢得用户的信任和尊重。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamPage; 