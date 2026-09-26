import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Badge } from 'react-bootstrap';
import { FaArrowRight, FaMicrophone, FaRobot, FaPiggyBank, FaUndoAlt, FaCheckCircle, FaShieldAlt } from 'react-icons/fa';
import HomeVoiceRecorder from '../components/HomeVoiceRecorder';

// ============================================================
// Home.js —— 首页(SaaS 明亮风格)
//
// 设计说明：
// 1. 风格：去深色粒子，改明亮 SaaS 落地页(白底 + 浅灰分区 + 卡片化
//    + 绿色主色 + 柔和阴影)，适配产品"大学生记账工具"的清爽定位；
// 2. 卡尼曼融入：行为经济学是产品理念的学术根基(冲动消费=系统1快思考，
//    记账反思=系统2慢思考)。融入方式为两处，均以克制、低饱和处理：
//    a. hero 右上角大幅黑白肖像做低透明度背景水印(grayscale + opacity)；
//    b. 左列底部圆形小头像 + 一句《思考，快与慢》的引用卡，学术背书感。
//    肖像素材为公开经典黑白照，仅作设计元素使用。
// ============================================================

// 功能卡片组件(SaaS 浅色卡片)
const FeatureCard = ({ icon, title, description, highlight = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      className={`saas-card h-100 border-0 ${highlight ? 'saas-card-highlight' : ''} ${isHovered ? 'saas-card-hover' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card.Body className="p-4">
        <div className={`saas-icon mb-4 rounded-circle d-inline-flex align-items-center justify-content-center ${isHovered ? 'saas-icon-active' : ''}`} style={{ width: '56px', height: '56px', transition: 'all 0.3s' }}>
          {icon}
        </div>
        <Card.Title className="h5 mb-3 fw-bold">{title}</Card.Title>
        <Card.Text className="text-muted">{description}</Card.Text>
      </Card.Body>
    </Card>
  );
};

// 动画按钮组件
const AnimatedButton = ({ children, variant, className, as, to, size, onClick }) => {
  return (
    <Button
      as={as}
      to={to}
      variant={variant}
      size={size}
      className={`btn-animated d-inline-flex align-items-center justify-content-center ${className}`}
      onClick={onClick}
    >
      <span className="d-flex align-items-center">{children}</span>
    </Button>
  );
};

// 增强型徽章组件(SaaS 浅色版)
const EnhancedBadge = ({ children, bg, className = '' }) => {
  return (
    <Badge
      bg={bg}
      className={`saas-badge px-3 py-2 rounded-pill fw-normal ${className}`}
    >
      <span>{children}</span>
    </Badge>
  );
};

const Home = () => {
  const { currentUser } = useAuth();
  const [fadeIn, setFadeIn] = useState(false);

  // 首屏淡入动画
  useEffect(() => {
    setFadeIn(true);

    // 滚动进入视口时上浮出现
    const handleScroll = () => {
      const sections = document.querySelectorAll('.animate-on-scroll');
      sections.forEach((section) => {
        const sectionTop = section.getBoundingClientRect().top;
        if (sectionTop < window.innerHeight * 0.85) {
          section.classList.add('slide-up');
          section.style.opacity = '1';
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={`home-page transition-all ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* ======== 首屏(SaaS 明亮) ======== */}
      <section className="hero-saas position-relative overflow-hidden">
        {/* 背景装饰：右上角卡尼曼黑白肖像水印 */}
        <div className="hero-bg-quote" aria-hidden="true"></div>
        <img
          src={`${process.env.PUBLIC_URL}/images/kahneman_bw.jpg`}
          alt="丹尼尔·卡尼曼 肖像(背景装饰)"
          className="hero-kahneman-bg"
          aria-hidden="true"
        />
        {/* 柔和色块装饰 */}
        <div className="hero-blob blob-1" aria-hidden="true"></div>
        <div className="hero-blob blob-2" aria-hidden="true"></div>

        <Container className="position-relative hero-inner">
          <Row className="align-items-center g-5">
            {/* 左侧文案 */}
            <Col lg={6} className="text-center text-lg-start">
              <EnhancedBadge bg="success" className="mb-4">
                <span className="text-white fw-medium">年轻人的理财思考与实践</span>
              </EnhancedBadge>

              <h1 className="hero-title mb-4">
                生活费怎么花，
                <br />
                <span className="text-primary">学会做自己的决定</span>
              </h1>

              <p className="hero-sub mb-4 mx-auto mx-lg-0">
                从一笔消费、一个目标开始，理解自己的需要，练习权衡，
                在每周复盘中形成自己的理财原则。
              </p>

              <div className="d-flex gap-3 justify-content-center justify-content-lg-start flex-wrap mb-4">
                {currentUser ? (
                  <AnimatedButton as={Link} to="/learning" variant="success" size="lg" className="rounded-pill btn-primary-glow px-5 py-3 fw-bold text-white">
                    开始我的理财练习 <FaArrowRight className="ms-2" />
                  </AnimatedButton>
                ) : (
                  <>
                    <AnimatedButton as={Link} to="/register" variant="success" size="lg" className="rounded-pill btn-primary-glow px-5 py-3 fw-bold text-white">
                      免费注册 <FaArrowRight className="ms-2" />
                    </AnimatedButton>
                    <AnimatedButton as={Link} to="/login" variant="outline-secondary" size="lg" className="rounded-pill px-5 py-3 fw-bold">
                      立即登录
                    </AnimatedButton>
                  </>
                )}
              </div>

              {/* 三个核心卖点速览 */}
              <div className="d-flex flex-wrap gap-2 justify-content-center justify-content-lg-start mb-5">
                <span className="hero-tag"><FaMicrophone className="me-1 text-primary" />语音记账</span>
                <span className="hero-tag"><FaRobot className="me-1 text-primary" />消费影响与自主选择</span>
                <span className="hero-tag"><FaPiggyBank className="me-1 text-primary" />储蓄目标跟踪</span>
              </div>

              {/* 卡尼曼引用卡：行为经济学的学术背书 */}
              <div className="kahneman-quote d-flex align-items-center gap-3 mx-auto mx-lg-0">
                <img
                  src={`${process.env.PUBLIC_URL}/images/kahneman_bw.jpg`}
                  alt="丹尼尔·卡尼曼"
                  className="kahneman-avatar"
                />
                <div className="text-start">
                  <p className="mb-1 quote-text">"冲动消费来自快思考(系统1)，理性的记账与反思，是慢思考(系统2)。"</p>
                  <div className="small text-muted">—— 丹尼尔·卡尼曼《思考，快与慢》</div>
                </div>
              </div>
            </Col>

            {/* 右侧：原地语音记账(点一下直接开录) */}
            <Col lg={6}>
              <HomeVoiceRecorder  />
            </Col>
          </Row>
        </Container>
      </section>

      {/* ======== 核心功能 ======== */}
      <section className="features-saas py-5 animate-on-scroll" style={{ opacity: 0 }}>
        <Container>
          <div className="text-center mb-5">
            <EnhancedBadge bg="success" className="mb-3">
              <span className="text-white fw-medium">它能做什么</span>
            </EnhancedBadge>
            <h2 className="section-title fw-bold mb-3">从每一次选择，慢慢形成自己的方法</h2>
            <p className="section-sub text-muted mx-auto">
              不为记账而记账——记账只是第一步，关键是让你看清自己的消费，把钱花在真正重要的地方。
            </p>
          </div>

          <Row className="g-4">
            <Col md={6} lg={3}>
              <FeatureCard
                icon={<FaMicrophone size={22} />}
                title="AI 语音记账"
                description={'说一句"在食堂吃了18块"，自动识别金额、商户、类别，不用手动填表。'}
                highlight
              />
            </Col>
            <Col md={6} lg={3}>
              <FeatureCard
                icon={<FaRobot size={22} />}
                title="消费影响与自主选择"
                description="比较预算影响，想清楚消费满足的需要，由你决定怎样取舍。"
              />
            </Col>
            <Col md={6} lg={3}>
              <FeatureCard
                icon={<FaPiggyBank size={22} />}
                title="储蓄目标跟踪"
                description="把未来的安排放进今天的考虑，理解目标与生活需要之间的关系。"
              />
            </Col>
            <Col md={6} lg={3}>
              <FeatureCard
                icon={<FaUndoAlt size={22} />}
                title="事后回访"
                description="回看实际体验是否符合预期，每周总结一个发现和一个小行动。"
              />
            </Col>
          </Row>
        </Container>
      </section>

      {/* ======== 三步上手 ======== */}
      <section className="steps-saas py-5 animate-on-scroll" style={{ opacity: 0 }}>
        <Container>
          <div className="text-center mb-5">
            <EnhancedBadge bg="info" className="mb-3">
              <span className="text-white fw-medium">三步上手</span>
            </EnhancedBadge>
            <h2 className="section-title fw-bold mb-3">从认识自己，到独立决定</h2>
          </div>

          <Row className="g-4">
            <Col lg={4}>
              <div className="step-card text-center p-4">
                <div className="step-number bg-primary text-white rounded-circle mx-auto mb-4 fs-3 fw-bold d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px' }}>1</div>
                <h3 className="h4 fw-bold mb-3">选择一个想探索的主题</h3>
                <p className="text-muted">"昨天在蜜雪冰城买柠檬水27块"——语音或文字都行，剩下的交给 AI。</p>
              </div>
            </Col>
            <Col lg={4}>
              <div className="step-card text-center p-4">
                <div className="step-number bg-primary text-white rounded-circle mx-auto mb-4 fs-3 fw-bold d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px' }}>2</div>
                <h3 className="h4 fw-bold mb-3">练习一次真实的选择</h3>
                <p className="text-muted">看清预算和目标影响，再结合自己的需要，记录选择与理由。</p>
              </div>
            </Col>
            <Col lg={4}>
              <div className="step-card text-center p-4">
                <div className="step-number bg-primary text-white rounded-circle mx-auto mb-4 fs-3 fw-bold d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px' }}>3</div>
                <h3 className="h4 fw-bold mb-3">复盘，写下自己的原则</h3>
                <p className="text-muted">回看这周的选择是否符合预期，给下周留下一个可执行的小行动。</p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      {/* ======== 数据与隐私承诺 ======== */}
      <section className="privacy-saas py-4 animate-on-scroll" style={{ opacity: 0 }}>
        <Container>
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-4 text-muted small">
            <span><FaShieldAlt className="me-1 text-success" />消费数据只属于你</span>
            <span><FaCheckCircle className="me-1 text-success" />不推荐理财产品、不贩卖焦虑</span>
            <span><FaCheckCircle className="me-1 text-success" />按自己的节奏学习与实践</span>
          </div>
        </Container>
      </section>

      {/* ======== 号召行动 ======== */}
      <section className="cta-saas py-5 animate-on-scroll" style={{ opacity: 0 }}>
        <Container>
          <div className="cta-card text-center text-white py-5 px-4 rounded-4">
            <h2 className="display-6 fw-bold mb-3">从现在开始，记下每一笔</h2>
            <p className="lead mb-4 mx-auto" style={{ maxWidth: '640px' }}>
              不用坚持，说一句就行。攒下的每一块，都是你给未来的底气。
            </p>
            {currentUser ? (
              <AnimatedButton as={Link} to="/learning" variant="light" size="lg" className="rounded-pill px-4 py-2 fw-bold">
                去记账 <FaArrowRight className="ms-2" />
              </AnimatedButton>
            ) : (
              <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
                <AnimatedButton as={Link} to="/register" variant="light" size="lg" className="rounded-pill px-4 py-2 fw-bold">
                  免费注册 <FaArrowRight className="ms-2" />
                </AnimatedButton>
                <AnimatedButton as={Link} to="/login" variant="outline-light" size="lg" className="rounded-pill px-4 py-2 fw-bold">
                  立即登录
                </AnimatedButton>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* 自定义CSS(SaaS 明亮风格 + HomeVoiceRecorder 浅色适配) */}
      <style jsx>{`
        /* ===== 页面基础 ===== */
        .home-page {
          background: #f8fafc;
          color: #1e293b;
        }

        .transition-all {
          transition: all 0.5s ease;
        }

        .animate-on-scroll {
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        .slide-up {
          transform: translateY(0);
        }

        /* ===== 首屏 ===== */
        .hero-saas {
          background: linear-gradient(180deg, #ffffff 0%, #f0fdf6 100%);
          min-height: 92vh;
          display: flex;
          align-items: center;
        }

        .hero-inner {
          padding-top: 5rem;
          padding-bottom: 5rem;
        }

        /* 卡尼曼背景水印：黑白 + 低透明度 + 边缘渐隐 */
        .hero-kahneman-bg {
          position: absolute;
          right: -5rem;
          top: 42%;
          transform: translateY(-50%);
          width: 480px;
          max-width: 48vw;
          opacity: 0.12;
          filter: grayscale(1);
          border-radius: 50%;
          object-fit: cover;
          aspect-ratio: 1 / 1;
          mask-image: radial-gradient(circle at center, black 55%, transparent 78%);
          -webkit-mask-image: radial-gradient(circle at center, black 55%, transparent 78%);
          pointer-events: none;
          z-index: 0;
        }

        .hero-bg-quote {
          position: absolute;
          right: 6%;
          top: 18%;
          width: 260px;
          height: 180px;
          background: radial-gradient(ellipse at center, rgba(16, 185, 129, 0.06) 0%, transparent 70%);
          z-index: 0;
          pointer-events: none;
        }

        .hero-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
          z-index: 0;
        }

        .blob-1 {
          width: 300px;
          height: 300px;
          left: -100px;
          bottom: -60px;
          background: rgba(16, 185, 129, 0.08);
        }

        .blob-2 {
          width: 200px;
          height: 200px;
          right: 10%;
          bottom: 5%;
          background: rgba(6, 182, 212, 0.06);
        }

        .hero-title {
          font-size: 2.6rem;
          line-height: 1.2;
          color: #0f172a;
        }

        .hero-sub {
          font-size: 1.1rem;
          color: #475569;
          max-width: 540px;
        }

        .hero-tag {
          padding: 0.35rem 0.9rem;
          border-radius: 999px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
          font-size: 0.85rem;
        }

        /* 卡尼曼引用卡 */
        .kahneman-quote {
          max-width: 460px;
        }

        .kahneman-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          filter: grayscale(1);
          border: 2px solid #fff;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
          flex-shrink: 0;
        }

        .quote-text {
          color: #475569;
          font-size: 0.9rem;
          line-height: 1.6;
        }

        /* ===== 通用区块 ===== */
        .features-saas {
          background: #ffffff;
        }

        .steps-saas {
          background: #f8fafc;
        }

        .privacy-saas {
          background: #ffffff;
        }

        .section-title {
          color: #0f172a;
          font-size: 2rem;
        }

        .section-sub {
          max-width: 680px;
          font-size: 1.05rem;
        }

        .saas-badge {
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
        }

        /* 功能卡片 */
        .saas-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
          border: 1px solid #eef2f7 !important;
          transition: all 0.3s ease;
        }

        .saas-card-hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
        }

        .saas-card-highlight {
          border-top: 3px solid #10b981 !important;
        }

        .saas-icon {
          background: #ecfdf5;
          color: #059669;
        }

        .saas-icon-active {
          background: #10b981;
          color: #fff;
        }

        /* 三步卡片 */
        .step-card {
          background: #ffffff;
          border: 1px solid #eef2f7;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
          height: 100%;
          transition: all 0.3s ease;
        }

        .step-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
        }

        /* CTA 卡片 */
        .cta-card {
          background: linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%);
          box-shadow: 0 16px 40px rgba(16, 185, 129, 0.28);
        }

        /* 按钮 */
        .btn-primary-glow {
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
          transition: all 0.3s ease;
          border: none;
        }

        .btn-primary-glow:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(16, 185, 129, 0.4);
        }

        .btn-animated {
          letter-spacing: 0.3px;
          text-transform: none;
          font-weight: 600;
        }

        .rounded-4 {
          border-radius: 20px !important;
        }

        /* ==========================================
           以下为 HomeVoiceRecorder 组件样式(SaaS 浅色版)
           类名由该组件复用，改这里即可整体换肤
           ========================================== */
        .demo-card {
          /* 默认半透明玻璃质感：背后的卡尼曼肖像透出来，形成景深 */
          background: rgba(255, 255, 255, 0.58);
          border: 1px solid rgba(255, 255, 255, 0.75);
          border-radius: 20px;
          padding: 1.25rem;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
          max-width: 480px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
          transition: background 0.35s ease, backdrop-filter 0.35s ease,
                      border-color 0.35s ease, box-shadow 0.35s ease;
        }

        /* 鼠标移上来：恢复实心卡片，保证阅读与操作清晰 */
        .demo-card:hover {
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(0);
          -webkit-backdrop-filter: blur(0);
          border-color: #eef2f7;
          box-shadow: 0 24px 56px rgba(15, 23, 42, 0.14);
        }

        .demo-card-header {
          display: flex;
          align-items: center;
          color: #0f172a;
          font-weight: 600;
          font-size: 1.05rem;
          margin-bottom: 1rem;
        }

        .demo-live {
          font-size: 0.75rem;
          color: #059669;
          display: inline-flex;
          align-items: center;
        }

        .demo-block {
          margin-bottom: 0.9rem;
        }

        .demo-label {
          font-size: 0.75rem;
          color: #64748b;
          margin-bottom: 0.35rem;
          letter-spacing: 0.02em;
        }

        .demo-text {
          background: #f8fafc;
          border-radius: 10px;
          padding: 0.6rem 0.8rem;
          color: #334155;
          font-size: 0.9rem;
          border: 1px solid #eef2f7;
        }

        .demo-field {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
          border-radius: 999px;
          padding: 0.25rem 0.75rem;
          font-size: 0.8rem;
        }

        .demo-field-btn {
          cursor: pointer;
        }

        .demo-field-active {
          background: #10b981;
          border-color: #10b981;
          color: #fff;
        }

        .demo-ai {
          background: #f8fafc;
          border-radius: 12px;
          padding: 0.75rem;
          border: 1px solid #eef2f7;
        }

        .demo-start-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          margin-top: 0.25rem;
          padding: 0.7rem 1.25rem;
          border: none;
          border-radius: 999px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.3);
        }

        .demo-start-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(16, 185, 129, 0.4);
        }

        .demo-start-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .demo-start-btn-lg {
          padding: 1rem 1.5rem;
          font-size: 1.15rem;
          margin-top: 0;
        }

        .demo-ghost-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 1.1rem;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .demo-ghost-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .demo-ghost-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .demo-stop-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.7rem 1.25rem;
          border: none;
          border-radius: 999px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.3);
        }

        .demo-stop-btn:hover {
          transform: translateY(-2px);
        }

        .demo-hint {
          margin-top: 0.6rem;
          font-size: 0.75rem;
          color: #64748b;
        }

        .demo-error {
          margin-top: 0.75rem;
          padding: 0.5rem 0.8rem;
          border-radius: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.8rem;
        }

        .demo-alt {
          margin-top: 0.6rem;
        }

        .demo-link {
          background: none;
          border: none;
          color: #64748b;
          font-size: 0.8rem;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }

        .demo-link:hover {
          color: #0f172a;
        }

        .rec-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          animation: recBlink 1s infinite;
        }

        @keyframes recBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .demo-rec-wave {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 48px;
        }

        .rec-bar {
          width: 5px;
          height: 20px;
          border-radius: 3px;
          background: linear-gradient(to top, #10b981, #6ee7b7);
          animation: recBounce 1s ease-in-out infinite;
        }

        @keyframes recBounce {
          0%, 100% { height: 12px; }
          50% { height: 42px; }
        }

        .demo-textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #1e293b;
          padding: 0.6rem 0.8rem;
          font-size: 0.9rem;
          resize: none;
          outline: none;
        }

        .demo-textarea:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
        }

        .demo-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }

        .demo-input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #1e293b;
          padding: 0.5rem 0.7rem;
          font-size: 0.85rem;
          outline: none;
        }

        .demo-input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
        }
      `}</style>
    </div>
  );
};

export default Home;
