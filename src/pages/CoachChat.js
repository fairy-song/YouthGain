import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { sendMessageToCoach } from '../services/api';
import { Container, Row, Col, Card, Form, Button, Badge, Spinner } from 'react-bootstrap';
import { FaPaperPlane, FaRobot, FaUser, FaLightbulb, FaCoins, FaChartLine, FaMoneyBillWave, FaChartBar } from 'react-icons/fa';
import 'animate.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 自定义Markdown组件
const MarkdownRenderer = ({ children }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
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
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [typingEffect, setTypingEffect] = useState(false);
  const [currentTypingText, setCurrentTypingText] = useState('');
  const [fullMessageText, setFullMessageText] = useState('');
  const [chatInitialized, setChatInitialized] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  
  // 获取评估结果
  useEffect(() => {
    const storedAssessment = localStorage.getItem('assessmentResults');
    if (storedAssessment) {
      try {
        const assessmentData = JSON.parse(storedAssessment);
        setUserProfile(assessmentData);
      } catch (error) {
        console.error('解析评估结果时出错:', error);
      }
    }
  }, []);

  // 初始化聊天
  useEffect(() => {
    if (!chatInitialized) {
      let initialMessage = '你好！我是你的AI金融心智教练。我可以帮你解答财务问题，提供理财建议，或者讨论如何培养健康的金钱观念。请问今天我能为你做什么？';
      
      // 如果有评估结果，则根据结果生成定制化欢迎信息
      if (userProfile) {
        const { userName, resultMessage, categoryScores, categoryAdvice } = userProfile;
        const name = userName || '您';
        
        // 找出用户的强项和弱项
        let strengths = [], weaknesses = [];
        Object.entries(categoryScores || {}).forEach(([category, score]) => {
          if (score >= 70) {
            strengths.push(getCategoryName(category));
          } else if (score <= 40) {
            weaknesses.push(getCategoryName(category));
          }
        });
        
        initialMessage = `你好${name}！很高兴见到你。我看到你已完成了财务健康评估，评估结果显示你属于"${resultMessage?.title || '财务成长阶段'}"类型。\n\n`;
        
        if (strengths.length > 0) {
          initialMessage += `👍 你在${strengths.join('、')}方面表现不错。\n\n`;
        }
        
        if (weaknesses.length > 0) {
          initialMessage += `📈 我们可以一起在${weaknesses.join('、')}方面努力提升。\n\n`;
        }
        
        initialMessage += `根据你的评估结果，我建议我们先聚焦以下方面：\n`;
        const adviceToShow = categoryAdvice?.slice(0, 2) || ['建立良好的预算习惯', '制定合理的储蓄计划'];
        initialMessage += adviceToShow.map(advice => `- ${advice}`).join('\n');
        
        initialMessage += `\n\n你有什么具体的财务问题想咨询，或者希望我帮助你制定哪方面的计划呢？`;
      }
      
      setMessages([
        { 
          id: 1, 
          sender: 'ai', 
          text: initialMessage
        }
      ]);
      
      setChatInitialized(true);
    }
  }, [chatInitialized, userProfile]);

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

  // 获取分类名称函数
  function getCategoryName(category) {
    const categoryNames = {
      savings: '储蓄能力',
      risk: '风险管理',
      emergency: '应急准备',
      debt: '债务管理',
      knowledge: '财务知识',
      income: '收入稳定性',
      goals: '财务目标',
      tracking: '支出追踪',
      insurance: '保险保障',
      pressure: '应对能力'
    };
    return categoryNames[category] || category;
  }

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
      
      // 如果有评估数据，添加到上下文中
      if (userProfile) {
        contextData.assessment_results = userProfile;
      }
      
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
        { id: Date.now() + 1, sender: 'ai', text: '抱歉，我遇到了一些问题。请稍后再试。' }
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
          <FaCoins size={24} color="rgba(78, 115, 223, 0.15)" />
        </div>
        <div className="finance-icon finance-icon-2">
          <FaChartLine size={36} color="rgba(72, 187, 120, 0.15)" />
        </div>
        <div className="finance-icon finance-icon-3">
          <FaMoneyBillWave size={32} color="rgba(255, 193, 7, 0.15)" />
        </div>
      </div>
      
      <Container className="py-5">
        <Row className="justify-content-center mb-4">
          <Col md={10} lg={8}>
            <div className="text-center mb-4">
              <EnhancedBadge bg="primary" className="mb-3">
                <span className="fw-medium text-white">AI金融教练</span>
              </EnhancedBadge>
              <h1 className="display-5 fw-bold mb-3">青盈 AI 教练对话</h1>
              <p className="lead text-muted">
                与您的AI金融心智教练进行对话，获取个性化财务建议和指导。
              </p>
            </div>
          </Col>
        </Row>
        
        <Row className="justify-content-center">
          <Col md={10} lg={8}>
            {userProfile && (
              <Card className="mb-4 border-0 rounded-4 shadow-sm bg-gradient-light">
                <Card.Body className="py-3 px-4">
                  <div className="d-flex align-items-center">
                    <div className="icon-container bg-primary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                      <FaChartBar className="text-primary" size={18} />
                    </div>
                    <div>
                      <h6 className="mb-0">财务状况：{userProfile.resultMessage?.title || "评估完成"}</h6>
                      <p className="text-muted small mb-0">
                        得分：{userProfile.score} / {40} ({Math.round((userProfile.score / 40) * 100)}%)
                      </p>
                    </div>
                    <div className="ms-auto">
                      <Badge className="rounded-pill" bg={getBadgeColor(userProfile.score)}>
                        {getScoreLevel(userProfile.score)}
                      </Badge>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}
            
            <Card className="chat-container shadow-lg rounded-4 border-0 overflow-hidden">
              <Card.Header className="bg-gradient-primary text-white p-3 d-flex align-items-center">
                <div className="coach-avatar bg-white rounded-circle p-2 d-flex align-items-center justify-content-center me-3">
                  <FaRobot className="text-primary" size={20} />
                </div>
                <div>
                  <h5 className="mb-0 fw-bold">青盈 AI 教练</h5>
                  <small className="text-white-50">您的个人金融顾问</small>
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
          background: linear-gradient(120deg, #f0f8ff 0%, #e6f2ff 100%);
        }
        
        .floating-shape {
          position: absolute;
          background: rgba(78, 115, 223, 0.05);
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
          background: rgba(34, 74, 190, 0.05);
        }
        
        .shape3 {
          width: 250px;
          height: 250px;
          bottom: -125px;
          left: 20%;
          animation-delay: 4s;
          background: rgba(92, 159, 247, 0.05);
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
          background: linear-gradient(135deg, #4e73df 0%, #224abe 100%);
        }
        
        .bg-gradient-light {
          background: linear-gradient(135deg, #f8f9fc 0%, #eaecf4 100%);
        }
        
        .chat-container {
          transition: all 0.3s ease;
        }
        
        .message-avatar {
          min-width: 40px;
          height: 40px;
        }
        
        .user-message {
          background-color: #e9f5ff;
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
          background-color: rgba(78, 115, 223, 0.1);
        }
        
        .bg-success-light {
          background-color: rgba(72, 187, 120, 0.1);
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
          background-color: #4e73df;
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
          box-shadow: 0 0 10px rgba(78, 115, 223, 0.3);
          transition: all 0.3s ease;
          border: none;
        }
        
        .btn-glow:hover {
          box-shadow: 0 0 20px rgba(78, 115, 223, 0.5);
          transform: translateY(-2px);
        }
        
        .icon-container {
          width: 36px;
          height: 36px;
        }
      `}</style>
    </div>
  );
  
  // 用户评分等级函数
  function getScoreLevel(score) {
    const percentage = (score / 40) * 100;
    if (percentage >= 85) return '优秀';
    if (percentage >= 70) return '良好';
    if (percentage >= 55) return '中等';
    if (percentage >= 40) return '发展中';
    return '起步阶段';
  }
  
  // 获取徽章颜色函数
  function getBadgeColor(score) {
    const percentage = (score / 40) * 100;
    if (percentage >= 85) return 'success';
    if (percentage >= 70) return 'primary';
    if (percentage >= 55) return 'info';
    if (percentage >= 40) return 'warning';
    return 'secondary';
  }
};

export default CoachChat; 