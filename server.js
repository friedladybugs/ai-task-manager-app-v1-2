import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, aiConfigured: !!process.env.DEEPSEEK_API_KEY });
});

app.get("/config.js", (req, res) => {
  const apiBase = process.env.PUBLIC_AI_API_BASE_URL || (process.env.DEEPSEEK_API_KEY ? `${req.protocol}://${req.get("host")}` : "");
  res.type("application/javascript").send(`window.AI_TASK_API_BASE_URL=${JSON.stringify(apiBase)};`);
});

function promptForPlan(body) {
  const today = localDate();
  return `
你是一个严谨、克制的中文任务规划助手。产品原则是“用户主导，AI 辅助”。

请先做轻量判断，再按需补全计划：
1. 判断任务是 simple 还是 complex。
2. simple 指一次性、短期、杂事类、无需复杂拆解的任务。
3. complex 指需要多阶段完成、需要排序、节奏安排或跨多天推进的任务。
4. 所有任务都返回 complexity、priority、priority_reason、today_focus。
5. simple 任务不要返回阶段计划，phases 必须是空数组。
6. complex 任务才返回 phases，阶段数最多 3 个。
7. 每个阶段 daily_plan 最多 3 条，每条只写一个可执行动作。
8. 默认用户每天投入 1 到 2 小时，安排要现实、简洁。
9. priorityMode 是 manual_p1 / manual_p2 / manual_p3 时，priority 必须遵循用户指定。
10. adjustmentContext 存在时，基于反馈微调后续节奏，保持目标不变。
11. 只输出严格 JSON，不要输出 Markdown 或解释文字。

JSON 结构：
{
  "complexity": "simple 或 complex",
  "complexity_reason": "一句话说明",
  "priority": "p1/p2/p3",
  "priority_reason": "一句话说明",
  "difficulty": "简单/中等/困难",
  "effort_estimate": "如 2小时 / 4天",
  "summary": "一句话总结",
  "today_focus": "今天建议先做什么",
  "encouragement": "一句鼓励",
  "phases": [
    {
      "phase_name": "阶段名称",
      "from_date": "YYYY-MM-DD",
      "to_date": "YYYY-MM-DD",
      "duration_days": 3,
      "goal": "阶段目标",
      "daily_plan": [
        {"day_label": "第1天", "date": "YYYY-MM-DD", "time_range": "19:00-20:30", "task": "当日动作"}
      ],
      "rest_after_phase": {"needed": true, "days": 1, "suggestion": "休息建议"}
    }
  ]
}

用户任务：${body.task}
今天日期：${today}
开始日期：${body.startDate || today}
截止日期：${body.endDate}
提醒时间：${body.reminderTime || "未设置"}
优先级模式：${body.priorityMode || "ai"}
用户手动难度：${body.difficulty || "未填写，请你判断"}
用户手动预计总耗时：${body.effortEstimate || "未填写，请你估计"}
鼓励风格：${body.tone || "gentle"}
反馈上下文：${body.adjustmentContext ? JSON.stringify(body.adjustmentContext) : "无"}
`;
}

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function promptForQuickPlan(body) {
  const today = localDate();
  return `
你是一个中文任务规划助手。先给用户一个轻量判断，越快越好。

只输出严格 JSON，不要 Markdown。不要返回 phases。
字段必须简洁：
{
  "complexity": "simple 或 complex",
  "complexity_reason": "一句话说明",
  "priority": "p1/p2/p3",
  "priority_reason": "一句话理由",
  "difficulty": "简单/中等/困难",
  "effort_estimate": "极短估计",
  "summary": "一句话总结",
  "today_focus": "今天先做什么",
  "encouragement": "一句简短鼓励",
  "phases": []
}

规则：
1. simple 指一次性、短期、杂事类、无需复杂拆解的任务。
2. complex 指需要多阶段、排序、节奏安排或跨多天推进。
3. priorityMode 是 manual_p1 / manual_p2 / manual_p3 时，priority 必须遵循用户指定。
4. phases 必须是空数组。

用户任务：${body.task}
今天日期：${today}
开始日期：${body.startDate || today}
截止日期：${body.endDate}
提醒时间：${body.reminderTime || "未设置"}
优先级模式：${body.priorityMode || "ai"}
用户手动难度：${body.difficulty || "未填写"}
用户手动预计总耗时：${body.effortEstimate || "未填写"}
反馈上下文：${body.adjustmentContext ? JSON.stringify(body.adjustmentContext) : "无"}
`;
}

function promptForDetailPlan(body) {
  const today = localDate();
  const quick = body.quickPlan ? JSON.stringify(body.quickPlan) : "无";
  return `
你是一个中文任务规划助手。现在只为 complex 任务补完整计划。

只输出严格 JSON，不要 Markdown。文案短，计划不要贪多。
返回结构：
{
  "complexity": "complex",
  "complexity_reason": "一句话说明",
  "priority": "p1/p2/p3",
  "priority_reason": "一句话理由",
  "difficulty": "简单/中等/困难",
  "effort_estimate": "极短估计",
  "summary": "一句话总结",
  "today_focus": "今天先做什么",
  "encouragement": "一句简短鼓励",
  "phases": [
    {
      "phase_name": "阶段名称",
      "from_date": "YYYY-MM-DD",
      "to_date": "YYYY-MM-DD",
      "duration_days": 1,
      "goal": "阶段目标",
      "daily_plan": [
        {"day_label": "第1天", "date": "YYYY-MM-DD", "time_range": "19:00-20:00", "task": "当日动作"}
      ],
      "rest_after_phase": {"needed": false, "days": 0, "suggestion": "简短建议"}
    }
  ]
}

规则：
1. 阶段数最多 3 个。
2. 每阶段 daily_plan 最多 3 条。
3. 每条 daily_plan 只写一个可执行动作。
4. 默认每天投入 1 到 2 小时，安排要现实。
5. 尽量包含今天日期 ${today} 的 daily_plan。
6. 以 quickPlan 的 complexity、priority、today_focus 为准，不要改成 simple。

quickPlan：${quick}
用户任务：${body.task}
今天日期：${today}
开始日期：${body.startDate || today}
截止日期：${body.endDate}
提醒时间：${body.reminderTime || "未设置"}
优先级模式：${body.priorityMode || "ai"}
用户手动难度：${body.difficulty || "未填写"}
用户手动预计总耗时：${body.effortEstimate || "未填写"}
反馈上下文：${body.adjustmentContext ? JSON.stringify(body.adjustmentContext) : "无"}
`;
}

function cleanPlan(plan) {
  const result = {
    complexity: plan?.complexity === "complex" ? "complex" : "simple",
    complexity_reason: String(plan?.complexity_reason || "").slice(0, 80),
    priority: ["p1", "p2", "p3"].includes(plan?.priority) ? plan.priority : "p2",
    priority_reason: String(plan?.priority_reason || "").slice(0, 80),
    difficulty: plan?.difficulty || "中等",
    effort_estimate: plan?.effort_estimate || "",
    summary: String(plan?.summary || "").slice(0, 100),
    today_focus: String(plan?.today_focus || "").slice(0, 100),
    encouragement: String(plan?.encouragement || "").slice(0, 100),
    phases: []
  };

  if (result.complexity === "complex" && Array.isArray(plan?.phases)) {
    result.phases = plan.phases.slice(0, 3).map((phase) => ({
      phase_name: String(phase?.phase_name || "阶段").slice(0, 30),
      from_date: phase?.from_date || "",
      to_date: phase?.to_date || "",
      duration_days: Number(phase?.duration_days || 1),
      goal: String(phase?.goal || "").slice(0, 80),
      daily_plan: Array.isArray(phase?.daily_plan)
        ? phase.daily_plan.slice(0, 3).map((day) => ({
            day_label: String(day?.day_label || "当天").slice(0, 20),
            date: day?.date || "",
            time_range: String(day?.time_range || "").slice(0, 30),
            task: String(day?.task || "").slice(0, 100)
          }))
        : [],
      rest_after_phase: {
        needed: !!phase?.rest_after_phase?.needed,
        days: Number(phase?.rest_after_phase?.days || 0),
        suggestion: String(phase?.rest_after_phase?.suggestion || "").slice(0, 80)
      }
    }));
  }

  return result;
}

function cleanQuickPlan(plan) {
  const result = cleanPlan(plan);
  result.phases = [];
  return result;
}

async function requestJsonPlan(prompt, maxTokens) {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "你是一个只输出严格 JSON 的中文任务规划助手。" },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: maxTokens
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI 没有返回内容");

  try {
    return JSON.parse(text);
  } catch (e) {
    const error = new Error("AI 返回的不是有效 JSON");
    error.raw = text;
    throw error;
  }
}

function validateBody(body) {
  const { task, endDate } = body || {};
  if (!task || !task.trim()) return "任务内容不能为空";
  if (!endDate) return "截止日期不能为空";
  if (!process.env.DEEPSEEK_API_KEY) return "缺少 DEEPSEEK_API_KEY 环境变量";
  return "";
}

app.post("/api/plan-task-quick", async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(error.includes("环境变量") ? 500 : 400).json({ error });
    const parsed = await requestJsonPlan(promptForQuickPlan(req.body), 360);
    return res.json(cleanQuickPlan(parsed));
  } catch (error) {
    console.error("DeepSeek quick error:", error);
    return res.status(500).json({
      error: "调用 AI 失败",
      detail: error?.error?.message || error?.response?.data?.error?.message || error?.message || "未知错误",
      raw: error?.raw
    });
  }
});

app.post("/api/plan-task-detail", async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(error.includes("环境变量") ? 500 : 400).json({ error });
    const parsed = await requestJsonPlan(promptForDetailPlan(req.body), 850);
    const cleaned = cleanPlan({ ...req.body.quickPlan, ...parsed, complexity: "complex" });
    return res.json(cleaned);
  } catch (error) {
    console.error("DeepSeek detail error:", error);
    return res.status(500).json({
      error: "调用 AI 失败",
      detail: error?.error?.message || error?.response?.data?.error?.message || error?.message || "未知错误",
      raw: error?.raw
    });
  }
});

app.post("/api/plan-task", async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(error.includes("环境变量") ? 500 : 400).json({ error });
    const parsed = await requestJsonPlan(promptForPlan(req.body), 900);
    return res.json(cleanPlan(parsed));
  } catch (error) {
    console.error("DeepSeek error:", error);
    return res.status(500).json({
      error: "调用 AI 失败",
      detail: error?.error?.message || error?.response?.data?.error?.message || error?.message || "未知错误",
      raw: error?.raw
    });
  }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
