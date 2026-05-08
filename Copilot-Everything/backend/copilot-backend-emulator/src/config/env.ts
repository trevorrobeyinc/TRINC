import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8789),
  SELF_HOST_API_KEY: z.string().default(""),
  SELF_HOST_DEFAULT_MODEL_KEY: z.string().default("raycast-default|lm-studio"),
  SELF_HOST_DEFAULT_MODEL_NAME: z.string().default("qwen2.5-coder-7b-instruct"),
  SELF_HOST_DEFAULT_MODEL_PROVIDER: z.string().default("lm-studio"),
  SELF_HOST_DEFAULT_MODEL_BASE_URL: z.string().default("http://127.0.0.1:1234/v1"),
  SELF_HOST_DEFAULT_MODEL_API_KEY: z.string().default(""),
  SELF_HOST_DEFAULT_MODEL_TEMPERATURE: z.coerce.number().default(0.2),
  SELF_HOST_DEFAULT_MODEL_MAX_TOKENS: z.coerce.number().int().positive().default(6000),
  SELF_HOST_DEFAULT_MODEL_TOP_P: z.coerce.number().default(0.9),
  SELF_HOST_DEFAULT_MODEL_REASONING_EFFORT: z.string().default("low"),
  SELF_HOST_DEFAULT_MODEL_VERBOSITY: z.string().default("medium"),
  SELF_HOST_DEFAULT_MODEL_STREAM: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SELF_HOST_DEFAULT_MODEL_STREAM_USAGE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SELF_HOST_DEFAULT_MODEL_NUM_CTX: z.coerce.number().int().positive().default(32768),
  MCP_BRIDGE_BASE_URL: z.string().default("https://127.0.0.1:8798"),
  MCP_BRIDGE_AUTH_TOKEN: z.string().default(""),
  MIYO_BASE_URL: z.string().default(""),
  MIYO_AUTH: z.string().default(""),
  MIYO_DEFAULT_VAULT: z.string().default(""),
  DEFAULT_VAULT_NAME: z.string().default("My Digital Garden"),
  DEFAULT_VAULT_ROOT: z.string().default("/Volumes/ExtraCurricular/My Digital Garden"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  ENABLE_VERBOSE_LOGS: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
});

export type EmulatorEnv = z.infer<typeof envSchema>;

export function loadEnv(): EmulatorEnv {
  return envSchema.parse(process.env);
}
