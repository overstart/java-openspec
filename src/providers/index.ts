import type { LLMProvider } from "../types";
import { OpenAIProvider } from "./openai-provider";
import { ACPProvider } from "./acp-provider";
import { t } from "../i18n";

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

  throw new Error(t.notConfigured);
}
