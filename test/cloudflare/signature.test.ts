import assert from "node:assert/strict";
import test from "node:test";
import { verifiedInteractionBody } from "../../src/discord/signature.js";

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("aceita somente interações Discord com assinatura Ed25519 válida e recente", async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = JSON.stringify({ type: 1, application_id: "123" });
  const signature = hex(await crypto.subtle.sign(
    { name: "Ed25519" },
    keys.privateKey,
    new TextEncoder().encode(`${timestamp}${body}`)
  ));

  const validRequest = new Request("https://example.com/interactions", {
    method: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp
    },
    body
  });
  assert.equal(await verifiedInteractionBody(validRequest, publicKey), body);

  const tamperedRequest = new Request("https://example.com/interactions", {
    method: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp
    },
    body: `${body} `
  });
  assert.equal(await verifiedInteractionBody(tamperedRequest, publicKey), undefined);

  const staleRequest = new Request("https://example.com/interactions", {
    method: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp
    },
    body
  });
  assert.equal(await verifiedInteractionBody(staleRequest, publicKey, Date.now() + 6 * 60_000), undefined);
});
