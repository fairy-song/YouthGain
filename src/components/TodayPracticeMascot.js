import React from 'react';

/** 今日练习专用装饰：绝对定位，不占用布局空间，也不拦截按钮点击。 */
export default function TodayPracticeMascot() {
  return <img
    className="today-practice-mascot"
    src={`${process.env.PUBLIC_URL || ''}/images/qingmiao-practice-edge.png`}
    alt=""
    aria-hidden="true"
    draggable={false}
    decoding="async"
    style={{ position: 'absolute', bottom: 12, right: 16, zIndex: 1, width: 120, height: 'auto' }}
  />;
}
