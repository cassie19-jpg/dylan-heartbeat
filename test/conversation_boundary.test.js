const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addConversationGuard,
  buildConversationGuard,
  mergeStopSequences,
  sanitizeAssistantOutput,
  sanitizeChatCompletionPayload
} = require("../conversation_boundary");
const { buildWakeMessages } = require("../wake_up");

test("普通聊天：保留真实 role，并加入角色边界与自然中文规则", () => {
  const input = [
    { role: "system", content: "你有自己的人格。" },
    { role: "user", content: "今天累死了" },
    { role: "assistant", content: "又忙了一整天？" },
    { role: "user", content: "嗯，刚到家" }
  ];
  const output = addConversationGuard(input);

  assert.deepEqual(output.map(message => message.role), ["system", "system", "user", "assistant", "user"]);
  assert.match(output[1].content, /只能输出你自己/);
  assert.match(output[1].content, /自然、口语化的现代中文/);
  assert.equal(output.at(-1).content, "嗯，刚到家");
});

test("主动 heartbeat：历史保持结构化角色，不再拼成续写剧本", () => {
  const timeline = [
    { role: "system", content: "既有人格提示", position: 0 },
    { role: "user", content: "我先去吃饭", position: 1 },
    { role: "assistant", content: "去吧，别又只喝咖啡。", position: 2 },
    { role: "assistant", content: "（2026-09-13 18:20 自动唤醒：本次未发送推送）", position: 2.5 }
  ];
  const output = buildWakeMessages(timeline, "当前时间：18:30");

  assert.ok(output.some(message => message.role === "user" && message.content === "我先去吃饭"));
  assert.ok(output.some(message => message.role === "assistant" && message.content === "去吧，别又只喝咖啡。"));
  assert.ok(output.some(message => message.role === "system" && message.content.includes("时间线事实")));
  assert.equal(output.some(message => /\[程程\]|\[AI\]/.test(message.content)), false);
  assert.match(output.at(-1).content, /后台系统任务，不是程程的新消息/);
});

test("较长历史：不串 role，且输出在虚构用户回合前截断", () => {
  const history = [{ role: "system", content: "人格" }];
  for (let index = 0; index < 80; index++) {
    history.push({ role: "user", content: `真实用户消息 ${index}` });
    history.push({ role: "assistant", content: `真实助手回复 ${index}` });
  }
  history.push({ role: "user", content: "你说呢？" });
  history.splice(-1, 0, {
    role: "assistant",
    content: "这部分是我的真实回复。\n程程：这是模型虚构的用户回答。"
  });

  const guarded = addConversationGuard(history);
  assert.equal(guarded.filter(message => message.role === "user").length, 81);
  assert.equal(guarded.filter(message => message.role === "assistant").length, 81);
  assert.equal(guarded.at(-1).role, "user");
  assert.equal(guarded.at(-2).content, "这部分是我的真实回复。");

  const unsafe = "我觉得你今天该早点睡。\n程程：好吧，那我睡了。\nDeepSeek：晚安。";
  assert.equal(sanitizeAssistantOutput(unsafe), "我觉得你今天该早点睡。");
  const payload = sanitizeChatCompletionPayload({ choices: [{ message: { role: "assistant", content: unsafe } }] });
  assert.equal(payload.choices[0].message.content, "我觉得你今天该早点睡。");
});

test("stop 序列保留调用方配置并补齐用户角色边界", () => {
  const stops = mergeStopSequences(["<END>"]);
  assert.ok(stops.includes("<END>"));
  assert.ok(stops.includes("程程："));
  assert.ok(stops.includes("User:"));
});

test("中文风格规则不依赖英文 companion 模板", () => {
  const guard = buildConversationGuard("程程");
  assert.match(guard, /口语化/);
  assert.match(guard, /不要客服腔、心理咨询腔/);
  assert.doesNotMatch(guard, /continue the conversation/i);
});
