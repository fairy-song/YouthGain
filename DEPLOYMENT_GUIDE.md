# 青盈 - 部署指南

本文档提供将青盈项目部署到GitHub Pages的详细步骤。

## 1. GitHub Pages配置

本项目已经做了结构调整，以便于在GitHub Pages上部署:

- 根目录添加了`.nojekyll`文件以禁用Jekyll处理
- `/docs`目录包含了前端构建文件
- 修改了路径引用为相对路径
- 配置了路由使用`HashRouter`而非`BrowserRouter`

## 2. 部署步骤

1. **推送项目到GitHub**:
   ```bash
   git add .
   git commit -m "准备部署到GitHub Pages"
   git push origin main
   ```

2. **配置GitHub Pages**:
   - 进入GitHub仓库设置
   - 找到"Pages"选项
   - 在"Build and deployment"部分:
     - 选择"Deploy from a branch"
     - 选择"main"分支和"/docs"目录
     - 点击"Save"

3. **配置API服务**:
   由于GitHub Pages只能托管静态内容，您需要将后端API部署到单独的服务器:
   
   a. **部署后端**:
      - 将`youthgain_project/backend`目录部署到支持Python的服务器
      - 确保安装所有依赖: `pip install -r requirements.txt`
      - 启动后端服务: `python app.py`或使用WSGI服务器
   
   b. **配置CORS**:
      - 确保后端配置了CORS设置，允许来自`xiaocow666.github.io`的请求
   
   c. **更新API地址**:
      - 修改`youthgain_project/frontend/src/services/api.js`文件中的API地址:
        ```javascript
        if (isGitHubPages) {
          baseUrl = 'https://你的API服务器地址';  // 修改为您的实际API地址
        }
        ```
      - 重新构建前端并更新`docs`目录:
        ```bash
        cd youthgain_project/frontend
        npm run build
        # 将build目录内容复制到项目根目录的docs文件夹
        ```

## 3. 测试部署

1. 访问`https://xiaocow666.github.io/YouthGain/`检查前端是否正常加载
2. 测试与后端的连接，确保API请求正常工作
3. 如遇到跨域问题，检查后端CORS配置

## 4. 故障排除

- **页面不显示或显示README**: 确保`.nojekyll`文件存在且GitHub Pages设置正确
- **路由问题**: 检查是否正确使用`HashRouter`
- **API连接失败**: 检查API地址配置和CORS设置
- **资源加载失败**: 确保所有资源使用相对路径引用

## 5. 本地测试

如果您需要在本地测试GitHub Pages部署:

```bash
# 安装serve
npm install -g serve

# 以GitHub Pages的方式提供docs目录
serve -s docs
```

## 6. 更新部署

每次需要更新部署时:

1. 修改代码
2. 如有必要，重新构建前端并更新docs目录
3. 提交并推送更改
4. GitHub Pages将自动更新