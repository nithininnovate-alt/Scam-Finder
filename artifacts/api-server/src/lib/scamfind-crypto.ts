import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { GetScanResponse } from "@workspace/api-zod";

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required to protect case data.");
const key = createHash("sha256").update(`scamfind:encryption:${process.env.SESSION_SECRET}`).digest();
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString("base64")).join(".");
}

export function decrypt(envelope: string) {
  const parts = envelope.split(".").map(p => Buffer.from(p, "base64"));
  if (parts.length !== 3) throw new Error("Invalid encryption envelope");
  const decipher = createDecipheriv("aes-256-gcm", key, parts[0]!);
  decipher.setAuthTag(parts[1]!);
  const data = Buffer.concat([decipher.update(parts[2]!), decipher.final()]);
  return GetScanResponse.parse(JSON.parse(data.toString("utf8")));
}
