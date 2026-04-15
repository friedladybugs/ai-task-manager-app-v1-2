AI任务规划 App 版 v1.2

这版修复了上个包没有真正带上 AI 开关的问题。

包含文件：
- index.html
- help.html
- server.js
- package.json

更新点：
- 添加任务页新增“启用 AI 规划”开关，默认关闭
- 任务详情页可后期开启 AI 规划
- 今日页仅展示已启用 AI 规划的复杂任务
- 添加按钮改为“添加任务”，不再默认分析

手机浏览器试用：
1. 只打开 index.html 也可以使用本地模式
2. 本地模式支持添加任务、列表、筛选、详情、完成状态、今日页和本地存储
3. 未连接 AI 服务时，点击 AI 规划会提示“当前未连接 AI 服务，先以本地模式使用。”

连接 AI 服务：
1. 可以继续使用 server.js 作为后端，也可以接任意线上后端
2. 前端不再默认强绑 localhost
3. 线上后端需要提供：
   - POST /api/plan-task-quick
   - POST /api/plan-task-detail
4. 前端配置方式任选其一：
   - 在页面加载前设置 window.AI_TASK_API_BASE_URL
   - 打开 index.html?ai_api=https://你的域名
   - 在 localStorage 写入 AI_TASK_API_BASE_URL
5. 如需自定义路径，可设置 window.AI_TASK_API_PATHS = { quick: "...", detail: "..." }
6. 如需自定义超时，可设置 window.AI_TASK_API_TIMEOUT_MS 或 localStorage 里的 AI_TASK_API_TIMEOUT_MS

最小线上试用方式（Render）：
1. 把本项目推到 GitHub
2. 在 Render 新建 Web Service，连接这个仓库
3. Build Command 使用 npm install
4. Start Command 使用 npm start
5. 设置环境变量 DEEPSEEK_API_KEY
6. 部署完成后，直接用手机浏览器打开 Render 给出的 HTTPS 地址
7. 页面会自动加载 /config.js，并把 AI 接口基地址配置成当前线上服务

可选环境变量：
- DEEPSEEK_BASE_URL：默认 https://api.deepseek.com
- ALLOWED_ORIGINS：逗号分隔的前端域名；留空表示允许所有来源
- PUBLIC_AI_API_BASE_URL：需要前端连接其他 API 域名时填写
- AI_TASK_API_TIMEOUT_MS：前端 AI 请求超时，默认 30000 毫秒
