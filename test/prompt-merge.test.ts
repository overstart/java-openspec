import { test, expect } from "bun:test";

// prompt 合并格式测试 (独立于 ACPProvider 实现)
// 约定: `${systemPrompt}\n\n---\n\n${userContent}`

test("prompt 合并: 基本格式", () => {
  const system = "SYSTEM_PROMPT";
  const user = "USER_CONTENT";
  const result = `${system}\n\n---\n\n${user}`;
  expect(result).toBe("SYSTEM_PROMPT\n\n---\n\nUSER_CONTENT");
});

test("prompt 合并: system 在前 user 在后", () => {
  const system = "template";
  const user = "data";
  const result = `${system}\n\n---\n\n${user}`;
  const parts = result.split("\n\n---\n\n");
  expect(parts[0]).toBe("template");
  expect(parts[1]).toBe("data");
});

test("prompt 合并: 分隔线 --- 存在", () => {
  const result = `sys\n\n---\n\nusr`;
  expect(result).toContain("---");
  expect(result.split("---").length).toBe(2);
});

test("prompt 合并: 多行内容保持原样", () => {
  const system = "Line1\nLine2";
  const user = "## Heading\n- item1\n- item2";
  const result = `${system}\n\n---\n\n${user}`;
  expect(result).toContain("Line1\nLine2");
  expect(result).toContain("## Heading\n- item1\n- item2");
});
