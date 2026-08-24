function hexToBytes(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined;
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function verifiedInteractionBody(
  request: Request,
  publicKeyHex: string,
  now = Date.now()
): Promise<string | undefined> {
  const signatureHex = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signatureHex || !timestamp) return undefined;

  const timestampMilliseconds = Number(timestamp) * 1_000;
  if (!Number.isFinite(timestampMilliseconds) || Math.abs(now - timestampMilliseconds) > 5 * 60_000) {
    return undefined;
  }

  const publicKey = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (!publicKey || publicKey.length !== 32 || !signature || signature.length !== 64) return undefined;

  const body = await request.text();
  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signature,
      new TextEncoder().encode(`${timestamp}${body}`)
    );
    return valid ? body : undefined;
  } catch {
    return undefined;
  }
}
