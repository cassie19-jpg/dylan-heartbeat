const KIMI_REQUIRED_TEMPERATURE = 1;

function isKimiModel(model) {
  return /(?:kimi|moonshot)/i.test(String(model || ""));
}

function normalizeTemperatureForModel(model, requestedTemperature) {
  if (!isKimiModel(model)) return requestedTemperature;
  return KIMI_REQUIRED_TEMPERATURE;
}

module.exports = {
  KIMI_REQUIRED_TEMPERATURE,
  isKimiModel,
  normalizeTemperatureForModel
};
