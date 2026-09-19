# 青盈应用脚本说明

这个目录包含了青盈应用的必要启动脚本，经过精简后只保留最关键的功能。

## 目录结构

```
scripts/
  ├── start.cmd        # 主启动菜单
  ├── local/           # 本地开发启动脚本
  │   ├── start.cmd    # 启动本地服务(后端+代理)
  │   └── proxy-server.js  # 代理服务器脚本
  └── tunnel/          # 内网穿透相关脚本
      ├── sunny_ngrok.cmd  # Sunny-Ngrok内网穿透启动脚本
      └── sunnyNgrok/      # Sunny-Ngrok程序目录
```

## 使用方法

### 本地启动

1. 运行 `start.cmd` 选择选项1，或直接运行 `local\start.cmd`
2. 等待后端服务和代理服务器启动
3. 浏览器访问 http://localhost:3000

### 内网穿透

1. 先确保本地服务已启动
2. 运行 `start.cmd` 选择选项2，或直接运行 `tunnel\sunny_ngrok.cmd`
3. 使用Sunny-Ngrok提供的域名访问应用
   
**注意:** 首次使用内网穿透时，可能需要修改 `tunnel\sunny_ngrok.cmd` 脚本中的隧道ID为您自己的ID。 