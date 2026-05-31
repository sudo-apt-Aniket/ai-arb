import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SCAN_INTERVAL_SECONDS: z.coerce.number().default(120),
  ANAKIN_WIRE_BASE_URL: z.string().url().default("https://api.anakin.io/v1/wire"),
  ANAKIN_API_KEY: z.string().min(1, "Anakin API Key is missing"),
  ANAKIN_ACTION_ID: z.string().min(1, "Anakin Action ID is missing"),
  ANAKIN_SEARCH_PARAMS_JSON: z.string().default('{"query":"used camera","limit":20}'),
  NVIDIA_NIM_API_KEY: z.string().optional(),
  NVIDIA_NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  DEEPSEEK_MODEL: z.string().default("deepseek-ai/deepseek-v4-flash"),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  APPRAISAL_PROVIDER: z.enum(["nvidia", "openrouter", "gemini"]).default("nvidia"),
  DATABASE_PATH: z.string().default("data/ai-arb.sqlite")
});

const parsed = envSchema.parse(process.env);

function parseSearchParams(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("ANAKIN_SEARCH_PARAMS_JSON must be a JSON object");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid ANAKIN_SEARCH_PARAMS_JSON: ${message}`);
  }
}

console.log("🚀 Loaded Config ANAKIN_KEY:", parsed.ANAKIN_API_KEY ? "EXISTS" : "MISSING");
console.log("🚀 Loaded Config ACTION_ID:", parsed.ANAKIN_ACTION_ID ? "EXISTS" : "MISSING");

export const appConfig = {
  ...parsed,
  DATABASE_PATH: path.resolve(parsed.DATABASE_PATH),
  ANAKIN_SEARCH_PARAMS: parseSearchParams(parsed.ANAKIN_SEARCH_PARAMS_JSON)
};

export type AppConfig = typeof appConfig;
