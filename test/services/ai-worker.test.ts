import assert from "node:assert/strict";
import test from "node:test";
import { extractResponseText } from "../../src/services/ai-worker.js";

test("extrai texto da resposta REST da Responses API", () => {
  assert.equal(extractResponseText({ output_text: " resposta direta " }), "resposta direta");
  assert.equal(extractResponseText({
    output: [{ content: [{ type: "output_text", text: "resposta estruturada" }] }]
  }), "resposta estruturada");
});
