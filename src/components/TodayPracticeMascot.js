import React, { useEffect, useRef, useState } from 'react';

const LINES = [
  '加油，你可以的！',
  '今天也要好好记账哦～',
  '想想再答，不急。',
  '做错了也没关系，我陪着你。',
  '这个问题有点意思～',
  '答对了记得给自己一个奖励！',
  '你已经坚持练习啦，真棒。',
];

/** 今日练习吉祥物：3D 立体动画 + 点击互动。 */
export default function TodayPracticeMascot() {
  const [bubble, setBubble] = useState('');
  const [action, setAction] = useState('idle'); // idle | jump | wiggle | stretch
  const actionTimer = useRef(null);

  const triggerAction = (next) => {
    setAction(next);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(() => setAction('idle'), 1200);
  };

  // 随机大动作：跳一下或伸懒腰
  useEffect(() => {
    const interval = setInterval(() => {
      const pool = ['jump', 'stretch', 'wiggle'];
      triggerAction(pool[Math.floor(Math.random() * pool.length)]);
    }, 6000 + Math.random() * 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    triggerAction('wiggle');
    setBubble(LINES[Math.floor(Math.random() * LINES.length)]);
    setTimeout(() => setBubble(''), 2500);
  };

  return (
    <>
      <style>{`
        @keyframes mascot-idle {
          0%, 100% { transform: translateY(0) rotateX(0deg) rotateZ(0deg) scale(1); }
          50% { transform: translateY(-6px) rotateX(8deg) rotateZ(-2deg) scale(1.03); }
        }
        @keyframes mascot-jump {
          0% { transform: translateY(0) rotateX(0) scale(1); }
          30% { transform: translateY(-40px) rotateX(20deg) scale(1.1); }
          50% { transform: translateY(-45px) rotateX(-10deg) scale(1.05); }
          80% { transform: translateY(0) rotateX(0) scale(0.95); }
          100% { transform: translateY(0) rotateX(0) scale(1); }
        }
        @keyframes mascot-wiggle {
          0%, 100% { transform: rotateZ(0deg) rotateY(0deg) translateY(0); }
          20% { transform: rotateZ(-15deg) rotateY(-20deg) translateY(-10px); }
          40% { transform: rotateZ(12deg) rotateY(20deg) translateY(-15px); }
          60% { transform: rotateZ(-10deg) rotateY(-15deg) translateY(-8px); }
          80% { transform: rotateZ(8deg) rotateY(10deg) translateY(-4px); }
        }
        @keyframes mascot-stretch {
          0%, 100% { transform: scaleY(1) scaleX(1) translateY(0); }
          40% { transform: scaleY(1.25) scaleX(0.9) translateY(-8px); }
          60% { transform: scaleY(1.1) scaleX(0.95) translateY(-4px); }
        }
        @keyframes mascot-bubble-in {
          from { opacity: 0; transform: translateY(10px) scale(0.8); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .mascot-scene {
          position: absolute;
          bottom: 12px;
          right: 16px;
          z-index: 2;
          width: 130px;
          height: 130px;
          perspective: 400px;
        }
        .mascot-img {
          width: 100%;
          height: auto;
          cursor: pointer;
          transform-origin: bottom center;
          filter: drop-shadow(0 8px 12px rgba(0,0,0,0.18));
          transition: filter 0.2s;
        }
        .mascot-img:hover { filter: drop-shadow(0 12px 18px rgba(47,125,95,0.35)); }
        .mascot-img.anim-idle { animation: mascot-idle 2.5s ease-in-out infinite; }
        .mascot-img.anim-jump { animation: mascot-jump 1.1s ease-out; }
        .mascot-img.anim-wiggle { animation: mascot-wiggle 1s ease-in-out; }
        .mascot-img.anim-stretch { animation: mascot-stretch 1.2s ease-out; }
        .mascot-bubble {
          position: absolute;
          bottom: 145px;
          right: 10px;
          z-index: 3;
          background: #fff;
          border: 2px solid #2F7D5F;
          border-radius: 14px;
          padding: 10px 16px;
          font-size: 14px;
          color: #333;
          max-width: 220px;
          animation: mascot-bubble-in 0.25s ease-out;
          box-shadow: 0 6px 16px rgba(0,0,0,0.12);
        }
        .mascot-bubble::after {
          content: '';
          position: absolute;
          bottom: -9px;
          right: 36px;
          width: 14px;
          height: 14px;
          background: #fff;
          border-right: 2px solid #2F7D5F;
          border-bottom: 2px solid #2F7D5F;
          transform: rotate(45deg);
        }
      `}</style>
      {bubble && <div className="mascot-bubble">{bubble}</div>}
      <div className="mascot-scene">
        <img
          className={`mascot-img anim-${action}`}
          src={`${process.env.PUBLIC_URL || ''}/images/qingmiao-practice-edge.png`}
          alt="青苗小助手"
          draggable={false}
          decoding="async"
          onClick={handleClick}
          title="点我有惊喜～"
        />
      </div>
    </>
  );
}
