function parseModelList(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[,\r\n]+/)
    .map(item => item.trim())
    .filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function configuredModelNames(env = process.env) {
  const configured = parseModelList(env.MODEL_LIST);
  if (configured.length > 0) return configured;

  const legacyModel = String(env.MODEL_NAME || "").trim();
  return legacyModel ? [legacyModel] : ["gateway-model"];
}

function configuredDefaultModel(env = process.env) {
  const models = configuredModelNames(env);
  const legacyModel = String(env.MODEL_NAME || "").trim();
  return legacyModel && models.includes(legacyModel) ? legacyModel : models[0];
}

function selectRequestedModel(requestedModel, env = process.env) {
  const allowedModels = configuredModelNames(env);
  const requested = String(requestedModel || "").trim();
  const model = requested || configuredDefaultModel(env);

  return {
    model,
    allowedModels,
    valid: allowedModels.includes(model)
  };
}

function selectWakeModel(env = process.env) {
  const requested = String(env.WAKE_MODEL || env.WAKE_MODEL_NAME || "").trim();
  return selectRequestedModel(requested || configuredDefaultModel(env), env);
}

module.exports = {
  configuredDefaultModel,
  configuredModelNames,
  parseModelList,
  selectRequestedModel,
  selectWakeModel
};
