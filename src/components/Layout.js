import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Navbar, Container, Nav, Button,
  Row, Col, Card, ListGroup
} from 'react-bootstrap';
import {
  FaHome, FaUser, FaBrain, FaRobot,
  FaBook, FaQuestionCircle, FaInfoCircle,
  FaLock, FaFileContract, FaShieldAlt
} from 'react-icons/fa';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import 'animate.css';
import MobileNavBar from './MobileNavBar';

// 自定义CSS样式
const styles = {
  navLink: {
    position: 'relative',
    transition: 'all 0.3s ease',
    overflow: 'visible'
  },
  navLinkHover: {
    transform: 'translateY(-2px)',
  },
  button: {
    transition: 'all 0.3s ease',
  },
  buttonHover: {
    transform: 'translateY(-3px)',
    boxShadow: '0 5px 15px rgba(0,0,0,0.2)'
  },
  brandText: {
    transition: 'all 0.5s ease',
  },
  brandTextHover: {
    textShadow: '0 0 15px rgba(255, 255, 255, 0.5), 0 0 10px rgba(var(--yg-accent-rgb), 0.5)',
  }
};

// 自定义带动画的按钮组件
const AnimatedButton = ({ children, variant, className, ...props }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Button
      variant={variant}
      className={`${className} ${isHovered ? 'animate__animated animate__pulse animate__faster' : ''}`}
      style={{
        ...styles.button,
        ...(isHovered ? styles.buttonHover : {})
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </Button>
  );
};

// 页面内容区域的过渡组件
const PageTransition = ({ children }) => {
  const location = useLocation();

  return (
    <div className="transition-container">
      <SwitchTransition mode="out-in">
        <CSSTransition
          key={location.pathname}
          timeout={300}
          classNames="page"
          unmountOnExit
        >
          <div className="page-content w-100">
            {children}
          </div>
        </CSSTransition>
      </SwitchTransition>
    </div>
  );
};

const Layout = () => {
  const { currentUser, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [brandHovered, setBrandHovered] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('登出失败:', error);
    }
  };

  return (
    <div className="layout-wrapper d-flex flex-column min-vh-100">
      {/* 页面样式 */}
      <style jsx="true">{`
        /* 全局布局 */
        .layout-wrapper {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          font-family: 'Noto Sans SC', 'Segoe UI', sans-serif;
          position: relative;
          overflow-x: hidden;
        }
        
        /* 修复导航栏和页脚可能挡住内容的问题 */
        .navbar-wrapper {
          position: sticky;
          top: 0;
          z-index: 100;
          width: 100%;
        }
        
        .footer-wrapper {
          position: relative;
          z-index: 100;
          width: 100%;
        }
        
        /* 主内容区域样式 */
        .main-content {
          flex: 1;
          position: relative;
          z-index: 5;
          /* 关键修改: 添加足够的顶部和底部内边距，确保内容不被导航栏和页脚遮挡 */
          padding-top: 2rem;
          padding-bottom: 2rem;
          /* 确保内容区域适当滚动，不超出视图范围 */
          min-height: calc(100vh - 170px); /* 减去导航栏和页脚的大致高度 */
          overflow-y: auto;
          overflow-x: hidden;
        }
        
        /* 确保页面过渡只在内容区域内进行 */
        .transition-container {
          position: relative;
          height: 100%;
        }
        
        /* 页面内容过渡动画 */
        .page-enter {
          opacity: 0;
        }
        
        .page-enter-active {
          opacity: 1;
          transition: opacity 300ms ease;
        }
        
        .page-exit {
          opacity: 1;
        }
        
        .page-exit-active {
          opacity: 0;
          transition: opacity 300ms ease;
        }
        
        .page-content {
          width: 100%;
          height: 100%;
        }
        
        /* 导航链接样式 */
        .nav-link-container {
          position: relative;
        }
        
        .nav-link:hover {
          color: var(--yg-accent) !important;
        }
        
        .nav-underline {
          position: absolute;
          bottom: -3px;
          left: 0;
          width: 0;
          height: 2px;
          background-color: var(--yg-accent);
          transition: width 0.3s ease;
        }
        
        .nav-link-container:hover .nav-underline {
          width: 100%;
        }
        
        /* 页脚链接样式 - 确保图标和文字在同一行 */
        .footer-link-container {
          position: relative;
          display: inline-block;
          margin-bottom: 0.5rem;
        }
        
        .footer-link {
          position: relative;
          display: inline-flex !important;
          align-items: center;
          white-space: nowrap;
        }
        
        .footer-link:hover {
          color: var(--yg-accent) !important;
        }
        
        .footer-link .icon {
          margin-right: 0.5rem;
          display: inline-flex;
          align-items: center;
        }
        
        .footer-underline {
          position: absolute;
          bottom: -3px;
          left: 0;
          width: 0;
          height: 2px;
          background-color: var(--yg-accent);
          transition: width 0.3s ease;
        }
        
        .footer-link-container:hover .footer-underline {
          width: 100%;
        }
        
        /* 移动端底部导航条的内容区域边距 */
        @media (max-width: 767.98px) {
          .main-content {
            padding-bottom: 70px; /* 底部导航栏高度加上间距 */
          }
        }
      `}</style>

      {/* 导航栏 - 在页面切换时保持不变 */}
      <div className="navbar-wrapper">
        <Navbar expand="lg" bg="dark" variant="dark" className="shadow-lg py-2 navbar" style={{ backgroundColor: 'var(--yg-navbar) !important' }}>
          <Container>
            <Navbar.Brand
              as={Link}
              to="/"
              className="text-decoration-none text-white fs-4 fw-semibold"
              style={{
                ...styles.brandText,
                ...(brandHovered ? styles.brandTextHover : {})
              }}
              onMouseEnter={() => setBrandHovered(true)}
              onMouseLeave={() => setBrandHovered(false)}
            >
              <span className={brandHovered ? 'animate__animated animate__rubberBand' : ''}>
                青盈
              </span>
            </Navbar.Brand>

            <Navbar.Toggle aria-controls="navbar-nav" />
            <Navbar.Collapse id="navbar-nav" className="justify-content-end">
              <Nav className="align-items-center gap-3">
                <div className="nav-link-container position-relative">
                  <Nav.Link
                    as={Link}
                    to="/"
                    className="text-white d-flex align-items-center border-0 nav-link"
                  >
                    <FaHome className="me-2" /> 首页
                  </Nav.Link>
                  <div className="nav-underline"></div>
                </div>

                {currentUser ? (
                  <>
                    <Nav.Link as={Link} to="/learning" className="text-white d-flex align-items-center"><FaBook className="me-2" />理财成长</Nav.Link>
                    <div className="nav-link-container position-relative">
                      <Nav.Link
                        as={Link}
                        to="/dashboard"
                        className="text-white d-flex align-items-center border-0 nav-link"
                      >
                        <FaUser className="me-2" /> 个人中心
                      </Nav.Link>
                      <div className="nav-underline"></div>
                    </div>

                    <div className="nav-link-container position-relative">
                      <Nav.Link
                        as={Link}
                        to="/assessment"
                        className="text-white d-flex align-items-center border-0 nav-link"
                      >
                        <FaBrain className="me-2" /> 心智评估
                      </Nav.Link>
                      <div className="nav-underline"></div>
                    </div>

                    <div className="nav-link-container position-relative">
                      <Nav.Link
                        as={Link}
                        to="/coach"
                        className="text-white d-flex align-items-center border-0 nav-link"
                      >
                        <FaRobot className="me-2" /> AI教练
                      </Nav.Link>
                      <div className="nav-underline"></div>
                    </div>

                    {isAdmin && (
                      <div className="nav-link-container position-relative">
                        <Nav.Link
                          as={Link}
                          to="/admin"
                          className="text-warning d-flex align-items-center border-0 nav-link fw-medium"
                        >
                          <FaShieldAlt className="me-2" /> 管理后台
                        </Nav.Link>
                        <div className="nav-underline"></div>
                      </div>
                    )}

                    <AnimatedButton
                      variant="danger"
                      onClick={handleLogout}
                      className="ms-2 rounded-pill px-4 fw-medium"
                    >
                      登出
                    </AnimatedButton>
                  </>
                ) : (
                  <>
                    <div className="nav-link-container position-relative">
                      <Nav.Link
                        as={Link}
                        to="/login"
                        className="text-white d-flex align-items-center border-0 nav-link"
                      >
                        登录
                      </Nav.Link>
                      <div className="nav-underline"></div>
                    </div>

                    <AnimatedButton
                      as={Link}
                      to="/register"
                      variant="warning"
                      className="ms-2 text-dark rounded-pill px-4 fw-medium text-decoration-none"
                    >
                      注册
                    </AnimatedButton>
                  </>
                )}
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>
      </div>

      {/* 主要内容区域 */}
      <main className="main-content flex-grow-1" style={location.pathname === '/' ? { padding: 0 } : {}}>
        {location.pathname === '/' ? (
          <PageTransition>
            <Outlet />
          </PageTransition>
        ) : (
          <Container>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Container>
        )}
      </main>

      {/* 页脚 - 在页面切换时保持不变 */}
      <div className="footer-wrapper">
        <footer className="bg-dark text-white py-5">
          <Container>
            <Row className="gy-4">
              <Col md={4} className="mb-4 mb-md-0">
                <Card bg="transparent" text="white" border="0" className="bg-transparent">
                  <Card.Body className="ps-0">
                    <Card.Title
                      className="fs-3 fw-semibold mb-3 text-warning animate__animated animate__fadeIn"
                    >
                      青盈
                    </Card.Title>
                    <Card.Text className="text-light opacity-75">
                      你的AI金融心智教练
                    </Card.Text>
                  </Card.Body>
                </Card>
              </Col>

              <Col md={8}>
                <Row>
                  <Col sm={4}>
                    <h5 className="fw-semibold mb-3 text-warning">关于我们</h5>
                    <ListGroup variant="flush" className="bg-transparent">
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/team"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaInfoCircle /></span>
                            团队介绍
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/contact"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaInfoCircle /></span>
                            联系我们
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/history"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaInfoCircle /></span>
                            发展历程
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                    </ListGroup>
                  </Col>

                  <Col sm={4}>
                    <h5 className="fw-semibold mb-3 text-warning">资源</h5>
                    <ListGroup variant="flush" className="bg-transparent">
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/knowledge"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaBook /></span>
                            金融知识库
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/faq"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaQuestionCircle /></span>
                            常见问题
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/tutorial"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaBook /></span>
                            使用教程
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                    </ListGroup>
                  </Col>

                  <Col sm={4}>
                    <h5 className="fw-semibold mb-3 text-warning">法律</h5>
                    <ListGroup variant="flush" className="bg-transparent">
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/legal"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaLock /></span>
                            隐私政策
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/legal"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaFileContract /></span>
                            使用条款
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
                        <div className="footer-link-container">
                          <Link
                            to="/info/legal"
                            className="text-light opacity-75 text-decoration-none footer-link"
                          >
                            <span className="icon"><FaShieldAlt /></span>
                            数据安全
                            <div className="footer-underline"></div>
                          </Link>
                        </div>
                      </ListGroup.Item>
                    </ListGroup>
                  </Col>
                </Row>
              </Col>
            </Row>

            <hr className="my-4 opacity-25" />

            <div className="text-center text-light opacity-75">
              <p className="mb-0">© {new Date().getFullYear()} 青盈. 保留所有权利。</p>
            </div>
          </Container>
        </footer>
      </div>

      {/* 移动端导航栏 */}
      <MobileNavBar />
    </div>
  );
};

export default Layout; 