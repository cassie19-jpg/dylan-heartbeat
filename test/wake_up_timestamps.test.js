const test = require("node:test");
const assert = require("node:assert/strict");
const { getLastUserTime } = require("../wake_up");

test("uses the timestamp stored for a Kelivo message after its prefix is removed", () => {
  const messages = [{ role: "user", content: "hello" }];
  const timestampDB = {
    "user::hello": "2026-09-12T02:00:00.000Z"
  };

  assert.equal(getLastUserTime(messages, timestampDB)?.toISOString(), "2026-09-12T02:00:00.000Z");
});
