import React, { useState } from 'react';
import InfoPageHeader from './InfoPageHeader';
import { FaPhone, FaEnvelope, FaMapMarkerAlt, FaWeixin, FaWeibo } from 'react-icons/fa';

const ContactPage = () => {
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [formStatus, setFormStatus] = useState(null);

  // 处理表单输入变化
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // 处理表单提交
  const handleSubmit = (e) => {
    e.preventDefault();
    // 这里只是模拟提交
    setFormStatus('submitting');
    
    // 模拟API调用延迟
    setTimeout(() => {
      setFormStatus('success');
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
      
      // 5秒后重置状态
      setTimeout(() => {
        setFormStatus(null);
      }, 5000);
    }, 1000);
  };

  // 联系信息数据
  const contactInfo = [
    {
      title: '客服电话',
      content: '400-123-4567 (工作日 9:00-18:00)',
      icon: <FaPhone className="text-primary-700" size={36} />,
      action: '拨打电话',
      actionLink: 'tel:4001234567'
    },
    {
      title: '电子邮件',
      content: 'contact@youthgain.com',
      icon: <FaEnvelope className="text-primary-700" size={36} />,
      action: '发送邮件',
      actionLink: 'mailto:contact@youthgain.com'
    },
    {
      title: '公司地址',
      content: '北京市海淀区中关村科技园区8号楼15层',
      icon: <FaMapMarkerAlt className="text-primary-700" size={36} />,
      action: '查看地图',
      actionLink: 'https://maps.baidu.com'
    }
  ];

  return (
    <div className="contact-page bg-neutral-50 min-h-screen pb-20">
      {/* 页面标题 */}
      <InfoPageHeader 
        title="联系我们" 
        subtitle="我们非常重视您的反馈和建议，请通过以下方式联系我们"
        category="about"
      />
      
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* 联系信息卡片 */}
          {contactInfo.map((item, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center text-center hover:shadow-lg transition-shadow">
              <div className="mb-4">{item.icon}</div>
              <h3 className="text-xl font-bold text-neutral-800 mb-2">{item.title}</h3>
              <p className="text-neutral-700 mb-4">{item.content}</p>
              <a 
                href={item.actionLink} 
                className="text-primary-700 font-medium hover:text-primary-800 inline-flex items-center"
                rel="noopener noreferrer"
                target={item.title === '公司地址' ? '_blank' : ''}
              >
                {item.action} 
                <span className="ml-1">→</span>
              </a>
            </div>
          ))}
        </div>
        
        {/* 地图和表单区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* 地图区域 */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="h-72 bg-neutral-200 flex items-center justify-center">
              <div className="text-center">
                <FaMapMarkerAlt className="text-primary-700 mx-auto mb-2" size={36} />
                <p className="text-neutral-600">地图加载中...</p>
                <p className="text-sm text-neutral-500">实际地图将显示在这里</p>
              </div>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-neutral-800 mb-3">公司地址</h3>
              <p className="text-neutral-700">北京市海淀区中关村科技园区8号楼15层</p>
              <p className="text-neutral-600 mt-2">邮编: 100080</p>
              <div className="mt-4">
                <h4 className="font-bold text-neutral-800 mb-1">交通方式:</h4>
                <p className="text-neutral-700">
                  地铁: 13号线中关村站A出口步行5分钟<br />
                  公交: 304路, 386路, 630路到科技园站下车
                </p>
              </div>
            </div>
          </div>
          
          {/* 联系表单 */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-neutral-800 mb-6">给我们留言</h3>
              
              {formStatus === 'success' ? (
                <div className="bg-success-50 border border-success-200 text-success-700 p-4 rounded-md">
                  <p className="font-medium">感谢您的留言！</p>
                  <p>我们已收到您的信息，会尽快与您联系。</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label htmlFor="name" className="block text-neutral-700 font-medium mb-2">您的姓名</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-neutral-700 font-medium mb-2">电子邮件</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <label htmlFor="subject" className="block text-neutral-700 font-medium mb-2">主题</label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  
                  <div className="mb-6">
                    <label htmlFor="message" className="block text-neutral-700 font-medium mb-2">留言内容</label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows={5}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      required
                    ></textarea>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={formStatus === 'submitting'}
                    className={`w-full bg-primary-500 text-neutral-950 py-3 rounded-md font-medium transition-colors ${
                      formStatus === 'submitting' ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-600'
                    }`}
                  >
                    {formStatus === 'submitting' ? '提交中...' : '提交留言'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
        
        {/* 社交媒体区域 */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-neutral-800 text-center mb-8">关注我们</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col items-center">
              <div className="bg-neutral-100 p-4 rounded-lg mb-4">
                <FaWeixin className="text-success-600" size={80} />
              </div>
              <h3 className="text-xl font-medium text-neutral-800 mb-2">微信公众号</h3>
              <p className="text-neutral-600 text-center mb-4">
                扫描二维码关注我们的公众号，获取最新金融资讯和教育内容
              </p>
              <div className="bg-neutral-100 p-4 w-40 h-40 flex items-center justify-center rounded-md">
                <p className="text-neutral-500">微信二维码图片</p>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-neutral-100 p-4 rounded-lg mb-4">
                <FaWeibo className="text-danger-500" size={80} />
              </div>
              <h3 className="text-xl font-medium text-neutral-800 mb-2">微博官方账号</h3>
              <p className="text-neutral-600 text-center mb-4">
                关注我们的微博，实时了解金融市场动态和理财小贴士
              </p>
              <a 
                href="https://weibo.com" 
                target="_blank"
                rel="noopener noreferrer"
                className="bg-danger-500 hover:bg-danger-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                立即关注
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage; 