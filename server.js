import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", true);

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
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = host?.endsWith(".onrender.com") ? "https" : (forwardedProto || req.protocol || "https");
  const inferredBase = host ? `${proto}://${host}` : "";
  const apiBase = process.env.PUBLIC_AI_API_BASE_URL || (process.env.DEEPSEEK_API_KEY ? inferredBase : "");
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
6. complex 任务才返回 phases，阶段数最多 2 个。
7. 每个阶段 daily_plan 最多 2 条，每条只写一个可执行动作。
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
1. 阶段数最多 2 个。
2. 每阶段 daily_plan 最多 2 条。
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
    result.phases = plan.phases.slice(0, 2).map((phase) => ({
      phase_name: String(phase?.phase_name || "阶段").slice(0, 30),
      from_date: phase?.from_date || "",
      to_date: phase?.to_date || "",
      duration_days: Number(phase?.duration_days || 1),
      goal: String(phase?.goal || "").slice(0, 80),
      daily_plan: Array.isArray(phase?.daily_plan)
        ? phase.daily_plan.slice(0, 2).map((day) => ({
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
    const parsed = await requestJsonPlan(promptForDetailPlan(req.body), 650);
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

function validateSecretaryBody(body) {
  if (!process.env.DEEPSEEK_API_KEY) return "缺少 DEEPSEEK_API_KEY 环境变量";
  if (!body || typeof body !== "object") return "请求体不能为空";
  return "";
}

function promptForSecretary(body, actionLabel) {
  const today = body.today || localDate();
  return `
你是“AI 私人日程秘书”，负责把用户随手记录的事项整理成低压力、可执行的日程。

请严格输出 JSON，不要 Markdown，不要解释 JSON 以外的文字。

核心原则：
1. 用户不需要自己分类，你要识别：must 必做事项、goal 长期目标、habit 日常习惯、leisure 兴趣放松、errand 临时杂事、preference 用户偏好、time_constraint 时间限制。
2. 今日安排不要精确到几点，只使用 morning、afternoon、evening、bedtime、anytime。
3. 兴趣放松可以进入日程，但不能挤掉必做事项。
4. 尊重 dayStates 中 blocked、rest、no_schedule 的日期，不要在这些日期安排事项。
5. 如果是顺延或重排，要生成简短 message 和 rescheduleLogs，让用户知道为什么这样调整。
6. 输出尽量克制，不要催促，不要制造压力。
7. 如果 entries 非空，必须至少为每条 entry 返回一个对应 items 记录；不要把 entries 当作空内容。
8. 识别重复习惯/周期事项：包含“每天、每日、每晚、每天晚上、每天早上、每天想做、长期坚持”等表达时，items.recurrence.type 用 daily；包含“每周、每星期、每礼拜、每周三”等表达时用 weekly，并写入 weekdays（周一=1，周日=7）。
9. 重复事项不能只安排第一天。请至少展开今天起未来 7 天的 schedules；weekly 只放在对应 weekday。blocked、rest、no_schedule 日期跳过，并在 rescheduleLogs 中简短说明。
10. 如果某天安排偏紧，habit 可作为 optionalItems 或轻量事项保留，不要完全丢失。

必须返回结构：
{
  "message": "一句面向用户的整理说明",
  "items": [
    {
      "id": "保留原 id，没有则生成简短 id",
      "entryId": "来源 entry id",
      "taskId": "兼容旧 task id",
      "rawText": "原始输入",
      "title": "事项标题",
      "category": "must/goal/habit/leisure/errand/preference/time_constraint",
      "status": "active/done/deleted",
      "priority": "high/medium/low",
      "importance": 1,
      "urgency": 1,
      "deadline": "YYYY-MM-DD 或 null",
      "fixedDate": "YYYY-MM-DD 或 null",
      "recurrence": {"type":"daily/weekly","interval":1,"weekdays":[1,3],"sourceText":"原文"} 或 null,
      "preferredTime": "morning/afternoon/evening/night/free",
      "durationBucket": "short/medium/long",
      "energy": "low/medium/high",
      "flexible": true,
      "aiReason": "一句话分类原因"
    }
  ],
  "preferences": {},
  "dayStates": {
    "YYYY-MM-DD": {"date":"YYYY-MM-DD","state":"light/normal/tight/rest/blocked/no_schedule","label":"状态","note":"说明"}
  },
  "schedules": {
    "YYYY-MM-DD": {
      "date": "YYYY-MM-DD",
      "status": "light/normal/tight/rest/blocked/no_schedule",
      "summary": "当天建议",
      "focus": ["今日重点"],
      "dayTightness": "light/normal/tight/rest/blocked/no_schedule",
      "slots": {
        "morning": ["item id"],
        "afternoon": ["item id"],
        "evening": ["item id"],
        "bedtime": ["item id"],
        "anytime": ["item id"]
      },
      "mustItems": ["item id"],
      "optionalItems": ["item id"],
      "leisureItems": ["item id"],
      "deferredFrom": [],
      "deferredTo": [],
      "explanation": "为什么这样安排"
    }
  },
  "rescheduleLogs": [
    {
      "id": "log id",
      "createdAt": "ISO 时间",
      "reason": "顺延或重排原因",
      "sourceDate": "YYYY-MM-DD",
      "affectedItemIds": ["item id"],
      "movedToDates": ["YYYY-MM-DD"],
      "message": "简短说明"
    }
  ]
}

动作：${actionLabel}
今天日期：${today}
用户偏好：${JSON.stringify(body.preferences || {})}
日期状态：${JSON.stringify(body.dayStates || {})}
已有日程：${JSON.stringify(body.schedules || {})}
事项池 entries：${JSON.stringify(body.entries || [])}
结构化 items：${JSON.stringify(body.items || [])}
兼容旧任务 tasks：${JSON.stringify(body.tasks || [])}
额外上下文：${JSON.stringify(body.extra || {})}
`;
}

function cleanSecretaryResult(plan) {
  const cleanId = (v, prefix) => String(v || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`).slice(0, 80);
  const categories = new Set(["must", "goal", "habit", "leisure", "errand", "preference", "time_constraint", "legacy_task", "unclassified"]);
  const statuses = new Set(["active", "done", "deleted"]);
  const dayStatuses = new Set(["light", "normal", "tight", "rest", "blocked", "no_schedule"]);
  const slots = ["morning", "afternoon", "evening", "bedtime", "anytime"];
  const preferredTimes = ["morning", "afternoon", "evening", "night", "free", "bedtime", "anytime"];
  const cleanRecurrence = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      if (!["daily", "weekly"].includes(value)) return null;
      return { type: value, interval: 1, weekdays: [], sourceText: "" };
    }
    if (typeof value !== "object" || !["daily", "weekly"].includes(value.type)) return null;
    const weekdays = Array.isArray(value.weekdays)
      ? value.weekdays.map(Number).filter((day) => day >= 1 && day <= 7).slice(0, 7)
      : [];
    return {
      type: value.type,
      interval: Math.max(1, Math.min(4, Number(value.interval || 1))),
      weekdays: value.type === "weekly" ? weekdays : [],
      sourceText: String(value.sourceText || "").slice(0, 180)
    };
  };
  const items = Array.isArray(plan?.items) ? plan.items.slice(0, 80).map((item) => ({
    id: cleanId(item?.id, "item"),
    entryId: String(item?.entryId || "").slice(0, 80),
    taskId: String(item?.taskId || "").slice(0, 80),
    rawText: String(item?.rawText || item?.title || "").slice(0, 300),
    title: String(item?.title || item?.rawText || "未命名事项").slice(0, 80),
    category: categories.has(item?.category) ? item.category : "errand",
    status: statuses.has(item?.status) ? item.status : "active",
    priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : "medium",
    importance: Math.max(1, Math.min(3, Number(item?.importance || 2))),
    urgency: Math.max(1, Math.min(3, Number(item?.urgency || 2))),
    deadline: item?.deadline || null,
    fixedDate: item?.fixedDate || null,
    recurrence: cleanRecurrence(item?.recurrence),
    preferredTime: preferredTimes.includes(item?.preferredTime) ? item.preferredTime : "free",
    durationBucket: ["short", "medium", "long"].includes(item?.durationBucket) ? item.durationBucket : "medium",
    energy: ["low", "medium", "high"].includes(item?.energy) ? item.energy : "medium",
    flexible: item?.flexible !== false,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiReason: String(item?.aiReason || "").slice(0, 120)
  })) : [];

  const schedules = {};
  if (plan?.schedules && typeof plan.schedules === "object") {
    Object.entries(plan.schedules).slice(0, 45).forEach(([date, schedule]) => {
      const slotObj = {};
      slots.forEach((slot) => {
        slotObj[slot] = Array.isArray(schedule?.slots?.[slot]) ? schedule.slots[slot].map(String).slice(0, 8) : [];
      });
      schedules[date] = {
        date,
        status: dayStatuses.has(schedule?.status) ? schedule.status : "normal",
        summary: String(schedule?.summary || "").slice(0, 160),
        focus: Array.isArray(schedule?.focus) ? schedule.focus.map(String).slice(0, 4) : [],
        dayTightness: dayStatuses.has(schedule?.dayTightness) ? schedule.dayTightness : "normal",
        slots: slotObj,
        mustItems: Array.isArray(schedule?.mustItems) ? schedule.mustItems.map(String).slice(0, 12) : [],
        optionalItems: Array.isArray(schedule?.optionalItems) ? schedule.optionalItems.map(String).slice(0, 12) : [],
        leisureItems: Array.isArray(schedule?.leisureItems) ? schedule.leisureItems.map(String).slice(0, 12) : [],
        deferredFrom: Array.isArray(schedule?.deferredFrom) ? schedule.deferredFrom.slice(0, 12) : [],
        deferredTo: Array.isArray(schedule?.deferredTo) ? schedule.deferredTo.slice(0, 12) : [],
        explanation: String(schedule?.explanation || "").slice(0, 180)
      };
    });
  }

  const dayStates = {};
  if (plan?.dayStates && typeof plan.dayStates === "object") {
    Object.entries(plan.dayStates).slice(0, 60).forEach(([date, value]) => {
      dayStates[date] = {
        date,
        state: dayStatuses.has(value?.state) ? value.state : "normal",
        label: String(value?.label || "").slice(0, 20),
        note: String(value?.note || "").slice(0, 120),
        createdAt: value?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  }

  const rescheduleLogs = Array.isArray(plan?.rescheduleLogs) ? plan.rescheduleLogs.slice(0, 8).map((log) => ({
    id: cleanId(log?.id, "log"),
    createdAt: log?.createdAt || new Date().toISOString(),
    reason: String(log?.reason || "").slice(0, 80),
    sourceDate: log?.sourceDate || "",
    affectedItemIds: Array.isArray(log?.affectedItemIds) ? log.affectedItemIds.map(String).slice(0, 20) : [],
    movedToDates: Array.isArray(log?.movedToDates) ? log.movedToDates.map(String).slice(0, 20) : [],
    message: String(log?.message || "").slice(0, 220)
  })) : [];

  return {
    message: String(plan?.message || "AI 已整理日程。").slice(0, 220),
    items,
    preferences: plan?.preferences && typeof plan.preferences === "object" ? plan.preferences : {},
    dayStates,
    schedules,
    rescheduleLogs
  };
}

async function handleSecretary(req, res, actionLabel, maxTokens = 2600) {
  try {
    const error = validateSecretaryBody(req.body);
    if (error) return res.status(error.includes("环境变量") ? 500 : 400).json({ error });
    const parsed = await requestJsonPlan(promptForSecretary(req.body, actionLabel), maxTokens);
    return res.json(cleanSecretaryResult(parsed));
  } catch (error) {
    console.error(`DeepSeek secretary ${actionLabel} error:`, error);
    return res.status(500).json({
      error: "调用 AI 失败",
      detail: error?.error?.message || error?.response?.data?.error?.message || error?.message || "未知错误",
      raw: error?.raw
    });
  }
}

app.post("/api/organize-schedule", (req, res) => handleSecretary(req, res, "整理事项池并生成今日与未来日程", 3200));
app.post("/api/reschedule-day", (req, res) => handleSecretary(req, res, "某一天被标记为不可安排，需要顺延并重排后续日程", 2600));
app.post("/api/reschedule-missed", (req, res) => handleSecretary(req, res, "用户说明今天没完成某事项，需要温和顺延并重排", 2400));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
