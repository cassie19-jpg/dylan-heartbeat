const test = require("node:test");
const assert = require("node:assert/strict");
const {
  KIMI_REQUIRED_TEMPERATURE,
  isKimiModel,
  normalizeTemperatureForModel
} = require("../model_parameters");

test("识别 Kimi 和 Moonshot 模型 ID", () => {
  assert.equal(isKimiModel("kimi-k2.5"), true);
  assert.equal(isKimiModel("moonshotai/kimi-k2"), true);
  assert.equal(isKimiModel("anthropic/claude-sonnet-4.6"), false);
});

test("Kimi 始终使用上游唯一允许的温度 1", () => {
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", undefined), KIMI_REQUIRED_TEMPERATURE);
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", 0.6), KIMI_REQUIRED_TEMPERATURE);
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", 0.8), KIMI_REQUIRED_TEMPERATURE);
  assert.equal(normalizeTemperatureForModel("moonshotai/kimi-k2", "1"), KIMI_REQUIRED_TEMPERATURE);
});

test("其他模型温度参数保持不变", () => {
  assert.equal(normalizeTemperatureForModel("anthropic/claude-sonnet-4.6", 0.8), 0.8);
  assert.equal(normalizeTemperatureForModel("deepseek-chat", undefined), undefined);
});
