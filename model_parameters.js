function isKimiModel(model) {
  return /(?:kimi|moonshot)/i.test(String(model || ""));
}

function applyModelParameterCompatibility(model, requestBody) {
  if (!isKimiModel(model)) return requestBody;

  // Kimi 官方模型会根据思考模式采用不同的固定采样参数。
  // 官方建议不要显式传入，让 API 自行选择当前模式的合法默认值。
  delete requestBody.temperature;
  delete requestBody.top_p;
  delete requestBody.n;
  delete requestBody.presence_penalty;
  delete requestBody.frequency_penalty;
  return requestBody;
}

module.exports = {
  applyModelParameterCompatibility,
  isKimiModel,
};
