# 青盈应用访问说明

## 快速启动

使用以下命令启动应用：

```
.\direct_start.cmd
```

## 访问方式

### 本地访问

- 后端API: http://localhost:5001
- 前端应用: http://localhost:3000/#/

### 使用cpolar内网穿透

1. 配置cpolar，映射到3000端口
2. 使用以下格式访问：
   ```
   https://[您的cpolar域名]/#/
   ```
   例如: `https://6baebd64.r11.vip.cpolar.cn/#/`

## 常见问题

### 1. 页面显示404错误

- 确保URL末尾添加`/#/`而不是`/YouthGain`
- 正确格式: `https://6baebd64.r11.vip.cpolar.cn/#/`
- 错误格式: `https://6baebd64.r11.vip.cpolar.cn/YouthGain`

### 2. 端口被占用

如果3000端口被占用，可以:
- 运行`taskkill /f /im node.exe`释放端口
- 或者使用React自动分配的其他端口

### 3. 页面加载很慢或显示空白

- 请耐心等待，第一次加载可能需要1-2分钟
- 如果长时间无响应，尝试刷新页面或清除浏览器缓存

## 技术说明

1. 应用使用了React的HashRouter而不是BrowserRouter
2. 正确的URL格式为`/#/`，这是由于HashRouter的工作方式所决定的
3. 内网穿透时，请确保正确配置跨域和主机检查选项 