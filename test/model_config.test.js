const test = require("node:test");
const assert = require("node:assert/strict");
const {
  configuredDefaultModel,
  configuredModelNames,
  parseModelList,
  selectRequestedModel,
  selectWakeModel
} = require("../model_config");

test("MODEL_LIST 支持逗号和换行，且自动去重", () => {
  assert.deepEqual(
    parseModelList("deepseek/chat, anthropic/claude\ndeepseek/chat"),
    ["deepseek/chat", "anthropic/claude"]
  );
});

test("未配置 MODEL_LIST 时保持单模型兼容", () => {
  const env = { MODEL_NAME: "legacy-model" };
  assert.deepEqual(configuredModelNames(env), ["legacy-model"]);
  assert.equal(configuredDefaultModel(env), "legacy-model");
  assert.equal(selectRequestedModel("legacy-model", env).valid, true);
});

test("Kelivo 可在白名单中的 DeepSeek 和 Claude 之间选择", () => {
  const env = {
    MODEL_LIST: "deepseek/chat,anthropic/claude-sonnet",
    MODEL_NAME: "deepseek/chat",
    WAKE_MODEL: "anthropic/claude-sonnet"
  };

  assert.equal(selectRequestedModel("deepseek/chat", env).valid, true);
  assert.equal(selectRequestedModel("anthropic/claude-sonnet", env).valid, true);
  assert.equal(selectRequestedModel("unknown/model", env).valid, false);
  assert.equal(selectWakeModel(env).model, "anthropic/claude-sonnet");
  assert.equal(selectWakeModel(env).valid, true);
});

test("MODEL_LIST 为权威白名单，拼错的默认或唤醒模型不会静默放行", () => {
  const env = {
    MODEL_LIST: "deepseek/chat,anthropic/claude-sonnet",
    MODEL_NAME: "old-model",
    WAKE_MODEL: "anthropic/claude-sonnett"
  };

  assert.equal(configuredDefaultModel(env), "deepseek/chat");
  assert.equal(selectRequestedModel(undefined, env).model, "deepseek/chat");
  assert.equal(selectWakeModel(env).valid, false);
});
