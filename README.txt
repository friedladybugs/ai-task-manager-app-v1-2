AI 私人日程秘书 v2.0

产品定位：
用户只负责把脑子里的事情随手记录下来，AI 负责理解、分类、排序、安排、顺延和必要时重排。

包含文件：
- index.html
- help.html
- server.js
- config.js
- package.json
- render.yaml

v2.0 核心能力：
- 统一输入入口：“记录我想做的事 / 记录事项”
- 事项池：先保存原始输入，不逐条自动调用 AI
- AI整理日程：用户主动点击后，批量整理 entries/items/tasks/preferences/dayStates
- 今日安排：今日建议、今日重点、上午/下午/晚上/睡前/空闲时安排、节奏提示
- 日历页：月视图轻标记，日期详情，支持全天有事/休息日/不安排
- 事项库：按必做事项、长期目标、日常习惯、兴趣放松、临时杂事、用户偏好、时间限制、已完成筛选
- 设置页：重要事项时间段、每日重点数、放松时间、运动、周末轻松、安排倾向、鼓励语风格
- 顺延/重排：某天不可安排、今天没完成时可选择原因并顺延
- 旧任务兼容：继续保留 tasks/settings，旧任务详情的“生成 AI 计划 / 重新生成 AI 计划”仍可用

本地模式：
1. 直接打开 index.html 可以使用本地模式。
2. 未连接 AI 服务时，新增事项、事项池、今日页、日历页、事项库、设置偏好、本地顺延和重排都可用。
3. 点击 AI整理日程、顺延或重排时，会提示“当前未连接 AI 服务，先以本地模式使用。”并使用本地规则生成草案。

AI 接口：
保留原有接口：
- POST /api/plan-task-quick
- POST /api/plan-task-detail
- POST /api/plan-task

新增接口：
- POST /api/organize-schedule
- POST /api/reschedule-day
- POST /api/reschedule-missed

前端配置：
- 页面会加载 /config.js
- 可以通过 window.AI_TASK_API_BASE_URL、URL 参数 ?ai_api=、localStorage 中的 AI_TASK_API_BASE_URL 配置 API 基地址
- Render 同源部署时，server.js 会自动给 /config.js 注入当前服务地址

Render 部署：
1. 推送到 GitHub
2. Render Web Service 连接仓库
3. Build Command: npm install
4. Start Command: npm start
5. 设置环境变量 DEEPSEEK_API_KEY
6. 可选 DEEPSEEK_BASE_URL，默认 https://api.deepseek.com

注意：
- 不包含账号系统、多人协作、支付、权限体系、第三方日历同步或微信原生小程序工程
- 数据存储在当前浏览器 localStorage
- 旧数据迁移前会备份到 ai_task_manager_app_v12_backup_before_v2
