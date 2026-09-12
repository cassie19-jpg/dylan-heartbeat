function stripLeadingTimestamp(content) {
  return String(content || "")
    .replace(/^（?\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]?)\d{1,2}[:：]\d{2}[）\s]*/, "")
    .trim();
}

function messageFingerprint(msg, normalizeContent = value => String(value || "")) {
  const content = normalizeContent(msg?.content).trim().slice(0, 150);
  return `${msg?.role || ""}::${content}`;
}

function strippedMessageFingerprint(msg, normalizeContent = value => String(value || "")) {
  const content = stripLeadingTimestamp(normalizeContent(msg?.content)).slice(0, 150);
  return `${msg?.role || ""}::${content}`;
}

function rememberLatestUserReceipt(messages, timestampDB, receivedAt = new Date(), normalizeContent) {
  const latestUser = [...messages].reverse().find(msg => msg?.role === "user");
  if (!latestUser) return false;

  const parsedReceivedAt = new Date(receivedAt);
  if (Number.isNaN(parsedReceivedAt.getTime())) return false;

  const rememberedAt = parsedReceivedAt.toISOString();
  const keys = [
    messageFingerprint(latestUser, normalizeContent),
    strippedMessageFingerprint(latestUser, normalizeContent)
  ];

  let dirty = false;
  for (const key of new Set(keys)) {
    if (timestampDB[key] === rememberedAt) continue;
    timestampDB[key] = rememberedAt;
    dirty = true;
  }
  return dirty;
}

module.exports = {
  messageFingerprint,
  rememberLatestUserReceipt,
  strippedMessageFingerprint,
  stripLeadingTimestamp
};
