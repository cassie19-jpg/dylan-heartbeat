const USER_TURN_STOPS = [
  "程程：",
  "程程:",
  "用户：",
  "用户:",
  "User:",
  "Human:",
  "[程程]",
  "[用户]",
  "<|user|>",
  "<|human|>"
];

function buildConversationGuard(userName = "程程") {
  const name = String(userName || "程程").trim() || "程程";
  return `## 对话角色边界（最高优先级）
- 你只能输出你自己此刻要对${name}说的这一条消息。
- 绝对不要替${name}说话、回答问题，也不要描述或猜测她的动作、心理、反应和下一句话。
- 不要续写多轮对话，不要输出“${name}：”“用户：”“User:”等角色标签；自己的话说完就立刻停止，等待真实用户回复。

## 中文表达
- 默认使用自然、口语化的现代中文，按既有人格和当前语境说话。
- 不要照着英文句式翻译，不要客服腔、心理咨询腔或模板化寒暄。
- 主动联系时直接说真正想说的话，不必每次解释为什么现在来联系。`;
}

function addConversationGuard(messages, options = {}) {
  const result = Array.isArray(messages)
    ? messages.map(message => {
        const copy = { ...message };
        // 已经混进历史的虚构用户回合也要在再次发送上游前清掉，否则会持续强化错误模式。
        if (
          copy.role === "assistant" &&
          !copy.tool_calls &&
          typeof copy.content === "string"
        ) {
          copy.content = sanitizeAssistantOutput(copy.content);
        }
        return copy;
      })
    : [];
  const guard = { role: "system", content: buildConversationGuard(options.userName) };
  let insertAt = 0;
  while (insertAt < result.length && result[insertAt]?.role === "system") insertAt++;
  result.splice(insertAt, 0, guard);
  return result;
}

function mergeStopSequences(existingStop) {
  const existing = Array.isArray(existingStop)
    ? existingStop
    : typeof existingStop === "string" && existingStop
      ? [existingStop]
      : [];
  // DeepSeek Chat Completions 当前允许最多 16 个 stop；保留调用方已有配置并去重。
  return [...new Set([...USER_TURN_STOPS, ...existing])].slice(0, 16);
}

function sanitizeAssistantOutput(value) {
  let text = String(value || "").trim();

  // 模型偶尔会先写自己的角色名；标签不是回复正文的一部分。
  text = text.replace(/^\s*(?:DeepSeek|Assistant|AI|助手)\s*[：:]\s*/i, "");

  // 在输出解析层只按新回合格式识别；更早的 stop 层会优先阻止这些标签生成。
  const userTurn = /(?:^|\r?\n)\s*(?:(?:###\s*)?(?:程程|用户|User|Human)\s*[：:]|\[(?:程程|用户|User|Human)\]|<\|(?:user|human)\|>)/i;
  const match = userTurn.exec(text);
  if (match) text = text.slice(0, match.index);

  return text.trim();
}

function sanitizeChatCompletionPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.choices)) return payload;
  return {
    ...payload,
    choices: payload.choices.map(choice => {
      if (!choice || typeof choice !== "object") return choice;
      const next = { ...choice };
      if (next.message && typeof next.message === "object" && typeof next.message.content === "string") {
        next.message = { ...next.message, content: sanitizeAssistantOutput(next.message.content) };
      }
      if (typeof next.text === "string") next.text = sanitizeAssistantOutput(next.text);
      return next;
    })
  };
}

function timelineEventAsSystemContext(event) {
  return {
    ...event,
    role: "system",
    content: `[时间线事实，仅作背景，不是程程或助手说出的聊天台词]\n${String(event?.content || "")}`
  };
}

module.exports = {
  USER_TURN_STOPS,
  addConversationGuard,
  buildConversationGuard,
  mergeStopSequences,
  sanitizeAssistantOutput,
  sanitizeChatCompletionPayload,
  timelineEventAsSystemContext
};
