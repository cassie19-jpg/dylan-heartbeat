const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyModelParameterCompatibility,
  isKimiModel,
} = require("../model_parameters");

test("识别 Kimi 和 Moonshot 模型 ID", () => {
  assert.equal(isKimiModel("kimi-k2.5"), true);
  assert.equal(isKimiModel("moonshotai/kimi-k2"), true);
  assert.equal(isKimiModel("anthropic/claude-sonnet-4.6"), false);
});

test("Kimi 交由官方 API 按思考模式选择固定采样参数", () => {
  const body = {
    temperature: 0.6,
    top_p: 1,
    n: 2,
    presence_penalty: 0.5,
    frequency_penalty: 0.5,
    messages: [{ role: "user", content: "你好" }]
  };
  applyModelParameterCompatibility("kimi-k2.6", body);
  assert.deepEqual(body, { messages: [{ role: "user", content: "你好" }] });
});

test("其他模型采样参数保持不变", () => {
  const body = { temperature: 0.8, top_p: 0.9 };
  assert.equal(applyModelParameterCompatibility("anthropic/claude-sonnet-4.6", body), body);
  assert.deepEqual(body, { temperature: 0.8, top_p: 0.9 });
});
