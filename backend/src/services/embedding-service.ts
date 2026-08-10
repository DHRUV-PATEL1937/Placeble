import { env } from "../config/env";

export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_PIPELINE_VERSION = "placeble-text-v1";

async function providerError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message?.slice(0, 300) ?? `Embedding request failed (${response.status}).`;
}

async function fetchWithRetry(url: string, init: RequestInit) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, init);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
    await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
  }
  return response!;
}

export function embeddingModelName() {
  return env.EMBEDDING_PROVIDER === "openai" ? env.OPENAI_EMBEDDING_MODEL : env.GEMINI_EMBEDDING_MODEL;
}

export async function embedText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, 18000);
  if (env.EMBEDDING_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when OpenAI embeddings are selected.");
    const response = await fetchWithRetry("https://api.openai.com/v1/embeddings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: env.OPENAI_EMBEDDING_MODEL, input: normalized, dimensions: EMBEDDING_DIMENSIONS }), signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const vector = payload.data?.[0]?.embedding;
    if (!vector?.length) throw new Error("The embedding provider returned an empty vector.");
    return vector;
  }
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for job matching embeddings.");
  const model = env.GEMINI_EMBEDDING_MODEL;
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: normalized }] }, embedContentConfig: { outputDimensionality: EMBEDDING_DIMENSIONS, autoTruncate: true } }), signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(await providerError(response));
  const payload = await response.json() as { embedding?: { values?: number[] } };
  if (!payload.embedding?.values?.length) throw new Error("Gemini returned an empty embedding vector.");
  return payload.embedding.values;
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2; }
  return leftMagnitude && rightMagnitude ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) : 0;
}
