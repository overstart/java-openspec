import type { TokenUsage } from "./generate-docs";

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
  const cost = estimateCost(model, usage);
  const lines = [
    "",
    "┌─────────────────────────────────────┐",
    "│  Token 消费                          │",
    `│  Model:   ${model.padEnd(28)}│`,
    `│  Input:   ${usage.promptTokens.toLocaleString().padEnd(28)}│`,
    `│  Output:  ${usage.completionTokens.toLocaleString().padEnd(28)}│`,
    `│  Total:   ${usage.totalTokens.toLocaleString().padEnd(28)}│`,
    `│  Est.Cost: $${cost.toFixed(4).padEnd(27)}│`,
    "└─────────────────────────────────────┘",
  ];
  return lines.join("\n");
}