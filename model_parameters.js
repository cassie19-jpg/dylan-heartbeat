const KIMI_MAX_TEMPERATURE = 0.6;

function isKimiModel(model) {
  return /(?:kimi|moonshot)/i.test(String(model || ""));
}

function normalizeTemperatureForModel(model, requestedTemperature) {
  if (!isKimiModel(model)) return requestedTemperature;

  const parsed = Number(requestedTemperature);
  if (!Number.isFinite(parsed)) return KIMI_MAX_TEMPERATURE;
  return Math.max(0, Math.min(parsed, KIMI_MAX_TEMPERATURE));
}

module.exports = {
  KIMI_MAX_TEMPERATURE,
  isKimiModel,
  normalizeTemperatureForModel
};
