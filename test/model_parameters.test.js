const test = require("node:test");
const assert = require("node:assert/strict");
const {
  KIMI_MAX_TEMPERATURE,
  isKimiModel,
  normalizeTemperatureForModel
} = require("../model_parameters");

test("识别 Kimi 和 Moonshot 模型 ID", () => {
  assert.equal(isKimiModel("kimi-k2.5"), true);
  assert.equal(isKimiModel("moonshotai/kimi-k2"), true);
  assert.equal(isKimiModel("anthropic/claude-sonnet-4.6"), false);
});

test("Kimi 温度缺失或过高时限制为 0.6", () => {
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", undefined), KIMI_MAX_TEMPERATURE);
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", 0.8), KIMI_MAX_TEMPERATURE);
  assert.equal(normalizeTemperatureForModel("moonshotai/kimi-k2", "1"), KIMI_MAX_TEMPERATURE);
});

test("Kimi 合法低温与其他模型参数保持不变", () => {
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", 0.5), 0.5);
  assert.equal(normalizeTemperatureForModel("kimi-k2.5", -1), 0);
  assert.equal(normalizeTemperatureForModel("anthropic/claude-sonnet-4.6", 0.8), 0.8);
  assert.equal(normalizeTemperatureForModel("deepseek-chat", undefined), undefined);
});
