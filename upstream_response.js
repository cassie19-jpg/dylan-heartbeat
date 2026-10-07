function contentText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(part => typeof part === "string" ? part : String(part?.text || part?.content || "")).join("");
}

function parseSseChatCompletion(text) {
  let streamed = "";
  let completed = "";
  let lastPayload = null;
  const calls = new Map();
  let reasoning = '';
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^data:\s*(.*)$/i);
    if (!match) continue;
    const raw = match[1].trim();
    if (!raw || raw === "[DONE]") continue;
    let payload;
    try { payload = JSON.parse(raw); } catch { continue; }
    if (payload?.error) throw new Error(payload.error.message || JSON.stringify(payload.error));
    lastPayload = payload;
    const choice = payload?.choices?.[0] || {};
    if (typeof choice.delta?.reasoning_content === 'string') reasoning += choice.delta.reasoning_content;
    for (const part of choice.delta?.tool_calls || []) {
      const index = part.index ?? 0;
      const call = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (part.id) call.id = part.id;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
      calls.set(index, call);
    }
    const delta = contentText(choice.delta?.content);
    const message = contentText(choice.message?.content);
    const legacy = contentText(choice.text);
    if (delta) streamed += delta;
    else if (message || legacy) completed = message || legacy;
  }
  const content = streamed || completed;
  if (!content && !lastPayload) throw new Error("SSE 响应中没有可读取的 data JSON");
  return {
    ...(lastPayload || {}),
    choices: [{ ...(lastPayload?.choices?.[0] || {}), message: { ...(lastPayload?.choices?.[0]?.message || {}), content, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(calls.size ? { tool_calls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call) } : {}) } }]
  };
}

function parseChatCompletionResponse(text, contentType = "") {
  const raw = String(text || "");
  // 批注 2026-08-10：官方在 stream=false 时返回 JSON；少数兼容端仍会回 data: SSE。
  // 先按真实响应识别再解析，保护官方 JSON 快路径，也避免兼容端让整次唤醒误报“不是 JSON”。
  if (/text\/event-stream/i.test(contentType) || /^\s*(?:event:.*\r?\n)?data:/i.test(raw)) {
    return parseSseChatCompletion(raw);
  }
  return JSON.parse(raw);
}

module.exports = { parseChatCompletionResponse, parseSseChatCompletion };
