const test = require("node:test");
const assert = require("node:assert/strict");
const { rememberLatestUserReceipt } = require("../message_timestamp_memory");

test("remembers Gateway receipt time for the latest user message without a Kelivo timestamp", () => {
  const messages = [
    { role: "user", content: "older message" },
    { role: "assistant", content: "older reply" },
    { role: "user", content: "current message" }
  ];
  const timestampDB = {};

  assert.equal(
    rememberLatestUserReceipt(messages, timestampDB, "2026-09-12T10:00:00.000Z"),
    true
  );
  assert.deepEqual(timestampDB, {
    "user::current message": "2026-09-12T10:00:00.000Z"
  });
});

test("refreshes a repeated latest user message to the current request time", () => {
  const timestampDB = {
    "user::ok": "2026-09-12T09:00:00.000Z"
  };

  rememberLatestUserReceipt(
    [{ role: "user", content: "ok" }],
    timestampDB,
    "2026-09-12T10:00:00.000Z"
  );

  assert.equal(timestampDB["user::ok"], "2026-09-12T10:00:00.000Z");
});
