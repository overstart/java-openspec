import type { LLMProvider } from "../types";
import { OpenAIProvider } from "./openai-provider";
import { ACPProvider } from "./acp-provider";

// Provider 选择逻辑:
// 1. OPENAI_API_KEY 存在 -> OpenAIProvider
// 2. ACP_AGENT_CMD 存在 -> ACPProvider
// 3. 都没有 -> 报错
export function createProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }

  if (process.env.ACP_AGENT_CMD) {
    return new ACPProvider(process.env.ACP_AGENT_CMD);
  }

  throw new Error(
    "No LLM provider configured. Set OPENAI_API_KEY for OpenAI mode, or ACP_AGENT_CMD for ACP mode (e.g. ACP_AGENT_CMD=opencode acp)."
  );
}
