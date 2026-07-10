// 去除 LLM 输出中的前导文本（preamble stripping）
// 删除第一个 ### 标题之前的所有内容
export function stripPreamble(content: string): string {
  const headingMatch = content.match(/^#{1,4}\s+\S/m);
  if (!headingMatch) return content;

  const idx = headingMatch.index!;
  if (idx === 0) return content;

  return content.slice(idx).trimStart();
}