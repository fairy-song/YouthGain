import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { sendMessageToCoach } from '../services/api';
import { Container, Row, Col, Card, Form, Button, Badge, Spinner } from 'react-bootstrap';
import { FaPaperPlane, FaRobot, FaUser, FaLightbulb, FaCoins, FaChartLine, FaMoneyBillWave } from 'react-icons/fa';
import 'animate.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 自定义Markdown组件
const MarkdownRenderer = ({ children }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={atomDark}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // 可以在这里定义其他标签的自定义渲染
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

// 增强型徽章组件
const EnhancedBadge = ({ children, bg, className = '' }) => {
  return (
    <Badge 
      bg={bg} 
      className={`custom-badge px-3 py-2 rounded-pill fw-normal position-relative overflow-hidden ${className}`}
    >
      <span className="badge-content position-relative">{children}</span>
      <span className="badge-glow"></span>
    </Badge>
  );
};

const CoachChat = () => {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const location = useLocation();
  const [input, setInput] = useState(location.state?.prompt || '');
  const [useLearningContext, setUseLearningContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [typingEffect, setTypingEffect] = useState(false);
  const [currentTypingText, setCurrentTypingText] = useState('');
  const [fullMessageText, setFullMessageText] = useState('');
  
  useEffect(() => {
    setMessages([{ id: 1, sender: 'ai', text: '你好，我是青盈。我们可以从一件真实的小事开始：最近有没有一笔消费或一个计划，让你不知道怎样取舍？我会帮助你看清选择，最后由你决定。' }]);
    setInput(location.state?.prompt || '');
    setUseLearningContext(false);
  }, [currentUser?.uid, location.state]);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentTypingText]);

  // 处理打字效果
  useEffect(() => {
    if (typingEffect && fullMessageText) {
      let i = 0;
      const interval = setInterval(() => {
        if (i <= fullMessageText.length) {
          setCurrentTypingText(fullMessageText.substring(0, i));
          i++;
        } else {
          clearInterval(interval);
          setTypingEffect(false);
          
          // 完成打字效果后更新消息
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastIndex = newMessages.length - 1;
            if (lastIndex >= 0 && newMessages[lastIndex].sender === 'ai') {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                text: fullMessageText
              };
            }
            return newMessages;
          });
        }
      }, 20); // 调整速度

      return () => clearInterval(interval);
    }
  }, [typingEffect, fullMessageText]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMessage = { id: Date.now(), sender: 'user', text: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // 构建发送到后端的上下文
      let contextData = {
        message: input,
        user_id: currentUser?.uid || 'guest',
        chat_history: messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      };
      
      contextData.use_learning_context = useLearningContext;

      const response = await sendMessageToCoach(contextData);
      setLoading(false);
      
      if (response && response.reply) {
        const aiMessage = { id: Date.now() + 1, sender: 'ai', text: '' };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
        
        // 启动打字效果
        setFullMessageText(response.reply);
        setTypingEffect(true);
      }
    } catch (error) {
      setLoading(false);
      setMessages(prevMessages => [
        ...prevMessages,
        { id: Date.now() + 1, sender: 'ai', text: error?.response?.data?.message || '教练暂时无法回复，请稍后重试。你也可以继续成长页中的练习。' }
      ]);
      console.error('发送消息时出错:', error);
    }
  };

  // 格式化消息时间
  const formatMessageTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="coach-chat-page">
      {/* 背景动态元素 */}
      <div className="animated-background">
        <div className="floating-shape shape1"></div>
        <div className="floating-shape shape2"></div>
        <div className="floating-shape shape3"></div>
        
        {/* 金融相关元素 */}
        <div className="finance-icon finance-icon-1">
          <FaCoins size={24} color="rgba(var(--yg-primary-rgb), 0.15)" />
        </div>
        <div className="finance-icon finance-icon-2">
          <FaChartLine size={36} color="rgba(var(--yg-success-rgb), 0.15)" />
        </div>
        <div className="finance-icon finance-icon-3">
          <FaMoneyBillWave size={32} color="rgba(var(--yg-accent-rgb), 0.15)" />
        </div>
      </div>
      
      <Container className="py-5">
        <Form.Check type="checkbox" id="share-learning-context" className="mb-3" label="允许教练引用我保存的资料与最近五条学习记录（会发送给 AI 服务）" checked={useLearningContext} onChange={e => setUseLearningContext(e.target.checked)} />
        <Row className="justify-content-center mb-4">
          <Col md={10} lg={8}>
            <div className="text-center mb-4">
              <EnhancedBadge bg="primary" className="mb-3">
                <span className="fw-medium text-white">AI金融教练</span>
              </EnhancedBadge>
              <h1 className="display-5 fw-bold mb-3">青盈 AI 教练对话</h1>
              <p className="lead text-muted">
                从生活中的问题开始，理解一个概念，比较选择，形成自己的理由。
              </p>
            </div>
          </Col>
        </Row>
        
        <Row className="justify-content-center">
          <Col md={10} lg={8}>
            <Card className="chat-container shadow-lg rounded-4 border-0 overflow-hidden">
              <Card.Header className="bg-gradient-primary text-white p-3 d-flex align-items-center">
                <div className="coach-avatar bg-white rounded-circle p-2 d-flex align-items-center justify-content-center me-3">
                  <FaRobot className="text-primary" size={20} />
                </div>
                <div>
                  <h5 className="mb-0 fw-bold">青盈 AI 教练</h5>
                  <small className="text-white-50">陪你思考的理财学习教练</small>
                </div>
              </Card.Header>
              
              <Card.Body className="chat-messages p-4" style={{ height: '500px', overflowY: 'auto' }}>
                {messages.map((message, index) => (
            <div 
              key={message.id} 
                    className={`message-container d-flex ${message.sender === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-3`}
            >
                    {message.sender === 'ai' && (
                      <div className="message-avatar me-2 rounded-circle d-flex align-items-center justify-content-center bg-primary-light">
                        <FaRobot className="text-primary" />
                      </div>
                    )}
                    
                    <div
                      className={`message ${message.sender === 'user' ? 'user-message' : 'ai-message'} p-3 rounded-4 shadow-sm animate__animated ${
                        message.sender === 'user' ? 'animate__fadeInRight' : 'animate__fadeInLeft'
                      }`}
                    >
                      {message.sender === 'ai' && index === messages.length - 1 && typingEffect ? (
                        <MarkdownRenderer>{currentTypingText}</MarkdownRenderer>
                      ) : (
                        <MarkdownRenderer>{message.text}</MarkdownRenderer>
                      )}
                      <small className="message-time text-muted d-block text-end mt-1">{formatMessageTime()}</small>
                    </div>
                    
                    {message.sender === 'user' && (
                      <div className="message-avatar ms-2 rounded-circle d-flex align-items-center justify-content-center bg-success-light">
                        <FaUser className="text-success" />
              </div>
                    )}
            </div>
          ))}
                
          {loading && (
                  <div className="d-flex justify-content-start mb-3">
                    <div className="message-avatar me-2 rounded-circle d-flex align-items-center justify-content-center bg-primary-light">
                      <FaRobot className="text-primary" />
                    </div>
                    <div className="ai-message p-3 rounded-4 shadow-sm">
                      <div className="typing-indicator">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
                
          <div ref={messagesEndRef} />
              </Card.Body>
        
              <Card.Footer className="p-3 bg-light border-0">
                <Form onSubmit={handleSendMessage}>
                  <div className="d-flex">
                    <Form.Control
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
                      placeholder="输入您的问题或描述您的财务状况..."
                      className="rounded-pill me-2 border-0 shadow-sm py-2 px-3"
              disabled={loading}
            />
                    <Button
                      variant="primary"
              type="submit"
                      className="rounded-circle d-flex align-items-center justify-content-center btn-glow"
                      style={{ width: '46px', height: '46px' }}
                      disabled={loading}
                    >
                      {loading ? <Spinner animation="border" size="sm" /> : <FaPaperPlane />}
                    </Button>
        </div>
                </Form>
              </Card.Footer>
            </Card>
            
            <div className="chat-tips mt-4 p-3 rounded-4 bg-light shadow-sm">
              <h5 className="mb-3 d-flex align-items-center">
                <FaLightbulb className="text-warning me-2" /> 提示:
              </h5>
              <ul className="mb-0 ps-4">
                <li>尝试询问如何制定个人财务计划</li>
                <li>您可以咨询投资基础知识或风险管理</li>
                <li>讨论如何建立健康的消费习惯</li>
                <li>寻求有关债务管理或储蓄策略的建议</li>
              </ul>
      </div>
          </Col>
        </Row>
      </Container>
      
      {/* 自定义CSS */}
      <style jsx>{`
        .coach-chat-page {
          position: relative;
          min-height: 100vh;
          padding-bottom: 3rem;
        }
        
        /* 动态背景元素 */
        .animated-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: -2;
          background: linear-gradient(120deg, var(--yg-wash-from) 0%, var(--yg-wash-to) 100%);
        }
        
        .floating-shape {
          position: absolute;
          background: rgba(var(--yg-primary-rgb), 0.05);
          border-radius: 50%;
          animation: float 15s infinite ease-in-out;
        }
        
        .shape1 {
          width: 300px;
          height: 300px;
          top: -150px;
          left: 10%;
          animation-delay: 0s;
        }
        
        .shape2 {
          width: 200px;
          height: 200px;
          top: 30%;
          right: -100px;
          animation-delay: 2s;
          background: rgba(var(--yg-primary-rgb), 0.05);
        }
        
        .shape3 {
          width: 250px;
          height: 250px;
          bottom: -125px;
          left: 20%;
          animation-delay: 4s;
          background: rgba(var(--yg-primary-rgb), 0.05);
        }
        
        @keyframes float {
          0% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
          50% {
            transform: translateY(30px) rotate(10deg) scale(1.05);
          }
          100% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
        }
        
        /* 金融相关图标 */
        .finance-icon {
          position: absolute;
          opacity: 0.8;
          animation: float 20s infinite ease-in-out;
          z-index: -1;
        }
        
        .finance-icon-1 {
          top: 15%;
          left: 10%;
          animation-delay: 0s;
          transform: rotate(-15deg);
        }
        
        .finance-icon-2 {
          top: 60%;
          left: 5%;
          animation-delay: 5s;
          transform: rotate(10deg);
        }
        
        .finance-icon-3 {
          top: 25%;
          right: 8%;
          animation-delay: 2s;
          transform: rotate(5deg);
        }
        
        /* 增强型徽章样式 */
        .custom-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background-image: linear-gradient(to right, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.2) 100%);
          backdrop-filter: blur(5px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          transform: translateY(0);
          transition: all 0.3s ease;
        }
        
        .badge-content {
          z-index: 1;
        }
        
        .badge-glow {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          transform: rotate(30deg);
          animation: badgeGlow 3s ease-in-out infinite;
        }
        
        @keyframes badgeGlow {
          0% {
            transform: translateX(-100%) rotate(30deg);
          }
          100% {
            transform: translateX(100%) rotate(30deg);
          }
        }
        
        .bg-gradient-primary {
          background: linear-gradient(135deg, var(--yg-primary-text) 0%, var(--yg-primary-deep) 100%);
        }
        
        .bg-gradient-light {
          background: linear-gradient(135deg, var(--yg-surface) 0%, var(--yg-line) 100%);
        }
        
        .chat-container {
          transition: all 0.3s ease;
        }
        
        .message-avatar {
          min-width: 40px;
          height: 40px;
        }
        
        .user-message {
          background-color: var(--yg-secondary-subtle);
          max-width: 80%;
          margin-left: auto;
        }
        
        .ai-message {
          background-color: #ffffff;
          max-width: 80%;
          margin-right: auto;
        }
        
        .message-time {
          font-size: 0.7rem;
        }
        
        .bg-primary-light {
          background-color: rgba(var(--yg-primary-rgb), 0.1);
        }
        
        .bg-success-light {
          background-color: rgba(var(--yg-success-rgb), 0.1);
        }
        
        /* 打字指示器 */
        .typing-indicator {
          display: flex;
          align-items: center;
          height: 20px;
        }
        
        .typing-dot {
          width: 8px;
          height: 8px;
          margin: 0 2px;
          border-radius: 50%;
          background-color: var(--yg-primary);
          animation: typingAnimation 1.5s infinite ease-in-out;
        }
        
        .typing-dot:nth-child(1) {
          animation-delay: 0s;
        }
        
        .typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        
        .typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }
        
        @keyframes typingAnimation {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
          100% {
            transform: translateY(0);
          }
        }
        
        /* 按钮发光效果 */
        .btn-glow {
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 10px rgba(var(--yg-primary-rgb), 0.3);
          transition: all 0.3s ease;
          border: none;
        }
        
        .btn-glow:hover {
          box-shadow: 0 0 20px rgba(var(--yg-primary-rgb), 0.5);
          transform: translateY(-2px);
        }
        
        .icon-container {
          width: 36px;
          height: 36px;
        }
      `}</style>
    </div>
  );
  

};

export default CoachChat; 