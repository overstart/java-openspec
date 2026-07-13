import OpenAI from "openai";
import type { LLMProvider, TokenUsage } from "../types";
import { stripPreamble } from "../postprocess";

// 从 generate-docs.ts 提取的 OpenAI provider，保持原有行为
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? (() => {
        throw new Error(
          "LLM API key not found. Set OPENAI_API_KEY in .env or ~/.config/java-openspec/.env"
        );
      })(),
      baseURL:
        process.env.LLM_BASE_URL ??
        "https://ark.cn-beijing.volces.com/api/coding/v3",
    });
    this.model = process.env.LLM_MODEL ?? "deepseek-v4-flash";
    this.maxTokens = parseInt(process.env.LLM_MAX_TOKENS ?? "8192", 10);
    this.temperature = parseFloat(process.env.LLM_TEMPERATURE ?? "0.3");
  }

  async generate(
    systemPrompt: string,
    userContent: string
  ): Promise<{ content: string; usage: TokenUsage }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    return { content: stripPreamble(content), usage };
  }
}
