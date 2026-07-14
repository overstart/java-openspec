import type { TokenUsage } from "./types";
import { t } from "./i18n";

interface PricingTier {
  inputPerMillion: number;  // 美元
  outputPerMillion: number; // 美元
}

const PRICING: Record<string, PricingTier> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  "gpt-4o": { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  "deepseek-v4-flash": { inputPerMillion: 0.07, outputPerMillion: 0.28 },
  default: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
};

export function estimateCost(model: string, usage: TokenUsage): number {
  const tier = PRICING[model] ?? PRICING["default"]!;
  const inputCost = (usage.promptTokens / 1_000_000) * tier.inputPerMillion;
  const outputCost = (usage.completionTokens / 1_000_000) * tier.outputPerMillion;
  return inputCost + outputCost;
}

export function formatTokenReport(model: string, usage: TokenUsage): string {
  // ACP 模式下 token 用量为 0（协议不返回或 agent 未提供），显示 N/A
  if (usage.totalTokens === 0) {
    const lines = [
      "",
      "┌─────────────────────────────────────┐",
      `│  ${t.tokenTitle.padEnd(28)}│`,
      `│  ${t.tokenModel}:   ${t.tokenNa.padEnd(28 - t.tokenModel.length - 3)}│`,
      `│  ${t.tokenInput}:   ${t.tokenNa.padEnd(28 - t.tokenInput.length - 3)}│`,
      `│  ${t.tokenOutput}:  ${t.tokenNa.padEnd(28 - t.tokenOutput.length - 3)}│`,
      `│  ${t.tokenTotal}:   ${t.tokenNa.padEnd(28 - t.tokenTotal.length - 3)}│`,
      `│  ${t.tokenCost}: ${t.tokenNa.padEnd(28 - t.tokenCost.length - 2)}│`,
      "└─────────────────────────────────────┘",
    ];
    return lines.join("\n");
  }

  const cost = estimateCost(model, usage);
  const lines = [
    "",
    "┌─────────────────────────────────────┐",
    `│  ${t.tokenTitle.padEnd(28)}│`,
    `│  ${t.tokenModel}:   ${model.padEnd(28 - t.tokenModel.length - 3)}│`,
    `│  ${t.tokenInput}:   ${usage.promptTokens.toLocaleString().padEnd(28 - t.tokenInput.length - 3)}│`,
    `│  ${t.tokenOutput}:  ${usage.completionTokens.toLocaleString().padEnd(28 - t.tokenOutput.length - 3)}│`,
    `│  ${t.tokenTotal}:   ${usage.totalTokens.toLocaleString().padEnd(28 - t.tokenTotal.length - 3)}│`,
    `│  ${t.tokenCost}: $${cost.toFixed(4).padEnd(28 - t.tokenCost.length - 2)}│`,
    "└─────────────────────────────────────┘",
  ];
  return lines.join("\n");
}