import { test, expect } from "bun:test";
import { formatTokenReport, estimateCost } from "../src/pricing";
import type { TokenUsage } from "../src/types";

test("token 报告: ACP 模式 (全零 usage) 显示 N/A", () => {
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const report = formatTokenReport("opencode-acp", usage);
  expect(report).toContain("N/A (ACP mode)");
  expect(report).not.toContain("$0.0000");
});

test("token 报告: OpenAI 模式显示真实数据", () => {
  const usage: TokenUsage = {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
  };
  const report = formatTokenReport("gpt-4o-mini", usage);
  expect(report).toContain("1,000");
  expect(report).toContain("500");
  expect(report).toContain("1,500");
  expect(report).toContain("$");
  expect(report).not.toContain("N/A");
});

test("token 报告: ACP 模式不显示费用", () => {
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const report = formatTokenReport("unknown", usage);
  expect(report).toContain("Est.Cost: N/A");
});

test("estimateCost: 正常计算", () => {
  const usage: TokenUsage = {
    promptTokens: 1000000,
    completionTokens: 1000000,
    totalTokens: 2000000,
  };
  // gpt-4o-mini: input $0.15/M, output $0.60/M
  const cost = estimateCost("gpt-4o-mini", usage);
  expect(cost).toBeCloseTo(0.75, 2);
});
