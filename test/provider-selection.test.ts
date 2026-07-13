import { test, expect, beforeEach, afterEach } from "bun:test";
import { createProvider } from "../src/providers";
import { OpenAIProvider } from "../src/providers/openai-provider";
import { ACPProvider } from "../src/providers/acp-provider";

// 保存和恢复环境变量
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  savedEnv.ACP_AGENT_CMD = process.env.ACP_AGENT_CMD;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ACP_AGENT_CMD;
});

afterEach(() => {
  if (savedEnv.OPENAI_API_KEY !== undefined) {
    process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
  if (savedEnv.ACP_AGENT_CMD !== undefined) {
    process.env.ACP_AGENT_CMD = savedEnv.ACP_AGENT_CMD;
  } else {
    delete process.env.ACP_AGENT_CMD;
  }
});

test("createProvider: OPENAI_API_KEY 存在时返回 OpenAIProvider", () => {
  process.env.OPENAI_API_KEY = "sk-test-key";
  const provider = createProvider();
  expect(provider).toBeInstanceOf(OpenAIProvider);
});

test("createProvider: 无 API key 但有 ACP_AGENT_CMD 时返回 ACPProvider", () => {
  process.env.ACP_AGENT_CMD = "opencode acp";
  const provider = createProvider();
  expect(provider).toBeInstanceOf(ACPProvider);
});

test("createProvider: 两者都未配置时抛出错误", () => {
  expect(() => createProvider()).toThrow(/No LLM provider configured/);
});

test("createProvider: OPENAI_API_KEY 优先于 ACP_AGENT_CMD", () => {
  process.env.OPENAI_API_KEY = "sk-test-key";
  process.env.ACP_AGENT_CMD = "opencode acp";
  const provider = createProvider();
  expect(provider).toBeInstanceOf(OpenAIProvider);
});
