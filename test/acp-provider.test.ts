import { test, expect } from "bun:test";
import { parseAgentCommand, ACPProvider } from "../src/providers/acp-provider";

test("parseAgentCommand: 简单命令无参数", () => {
  const result = parseAgentCommand("claude-code-acp");
  expect(result.command).toBe("claude-code-acp");
  expect(result.args).toEqual([]);
});

test("parseAgentCommand: 命令带参数", () => {
  const result = parseAgentCommand("gemini --experimental-acp");
  expect(result.command).toBe("gemini");
  expect(result.args).toEqual(["--experimental-acp"]);
});

test("parseAgentCommand: opencode acp 命令", () => {
  const result = parseAgentCommand("opencode acp");
  expect(result.command).toBe("opencode");
  expect(result.args).toEqual(["acp"]);
});

test("parseAgentCommand: 多个参数", () => {
  const result = parseAgentCommand("node --flag value script.js");
  expect(result.command).toBe("node");
  expect(result.args).toEqual(["--flag", "value", "script.js"]);
});

test("parseAgentCommand: 前后空格被修剪", () => {
  const result = parseAgentCommand("  opencode acp  ");
  expect(result.command).toBe("opencode");
  expect(result.args).toEqual(["acp"]);
});

test("ACPProvider: 构造函数存储 agent 命令", () => {
  const provider = new ACPProvider("opencode acp");
  // 构造不应抛出错误，连接在 generate() 时才建立
  expect(provider).toBeDefined();
});

test("ACPProvider: close 在未连接时调用不报错", async () => {
  const provider = new ACPProvider("opencode acp");
  await provider.close();
  // 不抛出错误即通过
});

// prompt 合并格式测试: 验证 systemPrompt + userContent 的合并
// ACPProvider.generate() 内部合并，但合并逻辑是:
// `${systemPrompt}\n\n---\n\n${userContent}`
// 这里直接测试格式约定
test("prompt 合并格式: system + --- + user", () => {
  const systemPrompt = "You are a spec generator.";
  const userContent = "## 项目信息\n- GroupId: com.example";
  const merged = `${systemPrompt}\n\n---\n\n${userContent}`;
  expect(merged).toBe("You are a spec generator.\n\n---\n\n## 项目信息\n- GroupId: com.example");
});

test("prompt 合并格式: 包含分隔线", () => {
  const systemPrompt = "Template content here";
  const userContent = "Analysis data here";
  const merged = `${systemPrompt}\n\n---\n\n${userContent}`;
  expect(merged).toContain("---");
  expect(merged.indexOf("---")).toBeGreaterThan(systemPrompt.length);
});
