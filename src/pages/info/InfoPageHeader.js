import React from 'react';
import { Link } from 'react-router-dom';

const InfoPageHeader = ({ title, subtitle, category }) => {
  // 根据类别设置不同的主题色。
  //
  // 渐变一律用 700→900 档：这几档配白字才够对比度（>=4.5:1）。
  // 浅档（400/500/600）作为大面积背景时白字只有 2-3:1，读不清。
  // 徽章反过来：底色用 500 档提亮做点缀，文字用深色。
  let bgColor = 'from-primary-700 to-primary-900';
  let badgeColor = 'bg-primary-500 text-neutral-950';

  if (category === 'resources') {
    // 资源中心用辅助蓝，与「关于我们」的品牌绿区分开——两个绿色页头会撞车
    bgColor = 'from-secondary-700 to-secondary-900';
    badgeColor = 'bg-secondary-500 text-neutral-950';
  } else if (category === 'legal') {
    bgColor = 'from-neutral-600 to-neutral-800';
    badgeColor = 'bg-neutral-500 text-white';
  }

  return (
    <div className={`w-full bg-gradient-to-r ${bgColor} text-white py-12 mb-10`}>
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center text-center">
          {/* 面包屑导航 */}
          <div className="text-sm mb-4">
            <Link to="/" className="text-white/80 hover:text-white">首页</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{title}</span>
          </div>

          {/* 页面标题 */}
          <h1 className="text-4xl font-bold mb-4">{title}</h1>

          {/* 可选徽章 */}
          {category && (
            <span className={`${badgeColor} text-xs px-3 py-1 rounded-full uppercase tracking-wide mb-4`}>
              {category === 'about' && '关于我们'}
              {category === 'resources' && '资源中心'}
              {category === 'legal' && '法律条款'}
            </span>
          )}
          
          {/* 副标题/描述 */}
          {subtitle && (
            <p className="text-lg text-white/90 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default InfoPageHeader; 