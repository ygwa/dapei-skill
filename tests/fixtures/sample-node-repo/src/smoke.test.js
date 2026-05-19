const assert = require("node:assert/strict");
const { summarizeOrder } = require("./index");

const summary = summarizeOrder({ id: "order-1" });

assert.deepEqual(summary, {
  id: "order-1",
  status: "pending"
});

console.log("sample repo smoke test passed");
