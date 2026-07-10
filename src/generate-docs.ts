import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { AnalysisResult, SpecDoc, DiagramFile } from "./types";
import { stripPreamble } from "./postprocess";

// 加载 .env
const envFile = await readFile(join(import.meta.dirname!, "..", ".env"), "utf-8");
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq > 0) {
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing",
  baseURL: process.env.LLM_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/coding/v3",
});

const MODEL = process.env.LLM_MODEL ?? "deepseek-v4-flash";
const MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS ?? "8192", 10);
const TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? "0.3");

async function loadTemplate(name: string): Promise<string> {
  const path = join(import.meta.dirname!, "..", "templates", `${name}.md`);
  return readFile(path, "utf-8");
}

async function loadSpecTemplate(name: string): Promise<Record<string, unknown>> {
  const path = join(import.meta.dirname!, "..", "spec-templates", `${name}.json`);
  return JSON.parse(await readFile(path, "utf-8"));
}

function formatAnalysisForLLM(result: AnalysisResult, templateName: string): string {
  const { projectInfo, globalPatterns, securityInfo } = result;

  const parts: string[] = [];

  parts.push(`## 项目信息`);
  parts.push(`- GroupId: ${projectInfo.groupId}`);
  parts.push(`- ArtifactId: ${projectInfo.artifactId}`);
  parts.push(`- 服务模块: ${projectInfo.serviceModules.map((m) => m.artifactId).join(", ")}`);
  parts.push(`- 公共库模块: ${projectInfo.libraryModules.map((m) => m.artifactId).join(", ")}`);

  // 版本信息
  if (projectInfo.serviceModules.length > 0) {
    const first = projectInfo.serviceModules[0]!;
    const versions = first.dependencyVersions;
    if (Object.keys(versions).length > 0) {
      parts.push(`- 关键依赖版本:`);
      for (const [dep, ver] of Object.entries(versions)) {
        parts.push(`  - ${dep}: ${ver}`);
      }
    }
    if (first.springBootVersion) parts.push(`- Spring Boot: ${first.springBootVersion}`);
    if (first.springCloudVersion) parts.push(`- Spring Cloud: ${first.springCloudVersion}`);
  }
  parts.push(``);

  if (templateName === "coding-style" || templateName === "overview") {
    parts.push(`## 命名模式`);
    parts.push(`- Controller: ${globalPatterns.namingPatterns[0]?.examples.join(", ") ?? "无"}`);
    parts.push(`- Service: ${globalPatterns.namingPatterns[1]?.examples.join(", ") ?? "无"}`);
    parts.push(`- 业务前缀: ${globalPatterns.businessPrefixes.join(", ")}`);
    parts.push(`- DTO 后缀: ${globalPatterns.dtoSuffixes.join(", ")}`);
    parts.push(`- 实体后缀: ${globalPatterns.entitySuffixes.join(", ")}`);
    parts.push(`- 包结构: ${globalPatterns.packageStructure.join(", ")}`);
    parts.push(``);
  }

  if (templateName === "architecture" || templateName === "overview") {
    parts.push(`## 模块依赖`);
    for (const [mod, deps] of Object.entries(projectInfo.dependencyGraph)) {
      if (deps.length > 0) {
        parts.push(`- ${mod} → ${deps.join(", ")}`);
      }
    }
    parts.push(``);
  }

  if (templateName === "security") {
    parts.push(`## 安全信息`);
    parts.push(`- 加密算法: ${securityInfo.encryptionAlgorithms.join(", ") || "未检测到"}`);
    parts.push(`- 加密库: ${securityInfo.encryptionLibraries.join(", ") || "未检测到"}`);
    parts.push(`- 认证框架: ${securityInfo.authFramework}`);
    parts.push(`- 权限注解: ${securityInfo.authAnnotations.join(", ") || "未检测到"}`);
    parts.push(`- 编程式权限API: ${securityInfo.authProgrammaticAPIs.join(", ") || "未检测到"}`);
    parts.push(`- 双账户体系: ${securityInfo.hasMultiAccount ? "是" : "否"}`);
    parts.push(`- 敏感字段: ${securityInfo.sensitiveFields.join(", ") || "未检测到"}`);
    parts.push(``);
  }

  if (templateName === "overview") {
    parts.push(`## 各服务 Controller 统计`);
    for (const [name, analysis] of Object.entries(result.serviceAnalyses)) {
      parts.push(`- ${name}: ${analysis.controllers.length} Controllers`);
    }
    parts.push(``);
  }

  return parts.join("\n");
}

async function callLLM(systemPrompt: string, userContent: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return stripPreamble(raw);
}

// 使用 unified + remark-parse 校验 Markdown 结构
async function validateSpecStructure(
  content: string,
  templateName: string
): Promise<{ valid: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const specTemplate = await loadSpecTemplate(templateName);
  const requiredSections = specTemplate.requiredSections as string[];

  // 解析 Markdown AST
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

  // 提取所有标题
  const headings: Array<{ text: string; depth: number }> = [];
  for (const node of tree.children) {
    if (node.type === "heading") {
      const heading = node as { type: "heading"; depth: number; children: Array<{ value?: string }> };
      const text = heading.children.map((c) => c.value ?? "").join("");
      headings.push({ text, depth: heading.depth });
    }
  }

  // 检查必填章节
  for (const section of requiredSections) {
    const found = headings.find((h) => h.text === section);
    if (!found) {
      warnings.push(`缺少必填章节: ${section}`);
    }
  }

  // 检查表格存在性
  const requiredTables = (specTemplate.requiredTables as string[]) ?? [];
  const hasTable = tree.children.some((n) => n.type === "table");
  if (requiredTables.length > 0 && !hasTable) {
    warnings.push(`缺少表格，需要 ${requiredTables.join(", ")} 表格`);
  }

  return { valid: warnings.length === 0, warnings };
}

export async function generateDocs(
  result: AnalysisResult,
  diagrams: DiagramFile[]
): Promise<SpecDoc[]> {
  const docs: SpecDoc[] = [];

  const specTypes = [
    { name: "overview", global: true },
    { name: "coding-style", global: true },
    { name: "architecture", global: true },
    { name: "security", global: true },
  ];

  // 5.4-5.7: 全局 spec 生成
  for (const spec of specTypes) {
    console.log(`  Generating ${spec.name}.md...`);
    const template = await loadTemplate(spec.name);
    const analysis = formatAnalysisForLLM(result, spec.name);

    const content = await callLLM(template, analysis);

    // 5.9: 模板结构校验
    const validation = await validateSpecStructure(content, spec.name);
    if (!validation.valid) {
      console.warn(`  ⚠ ${spec.name}.md validation warnings:`, validation.warnings);
    }

    docs.push({
      filename: `${spec.name}.md`,
      content,
      path: `openspec/specs/${spec.name}.md`,
    });
  }

// 5.8: 按服务 spec 生成
  for (const svc of result.projectInfo.serviceModules) {
    if (svc.artifactId === "mall-common" || svc.artifactId === "mall-mbg") continue;

    const analysis = result.serviceAnalyses[svc.artifactId];
    const svcContext = [
      `## 服务: ${svc.artifactId}`,
      `- 路径: ${svc.path}`,
      `- Controllers: ${analysis?.controllers.length ?? 0} 个`,
      `- Services: ${analysis?.services.length ?? 0} 个`,
      `- Controller列表: ${analysis?.controllers.map(c => c.className).join(", ") ?? "无"}`,
      `- Feign客户端: ${analysis?.feignClients.map(f => `${f.className}→${f.targetService}`).join(", ") ?? "无"}`,
      `- 包结构: ${analysis?.packageTree.join(", ") ?? "无"}`,
      `- 依赖: ${svc.dependencies.join(", ")}`,
      `- 图表: diagrams/${svc.artifactId}-container.mmd, diagrams/${svc.artifactId}-flow.mmd`,
    ].join("\n");

    console.log(`  Generating ${svc.artifactId}/overview.md...`);
    const svcOverview = await callLLM(await loadTemplate("overview"), svcContext);

    docs.push({
      filename: "overview.md",
      content: svcOverview,
      path: `openspec/specs/${svc.artifactId}/overview.md`,
    });

    console.log(`  Generating ${svc.artifactId}/architecture.md...`);
    const svcArch = await callLLM(await loadTemplate("architecture"), svcContext);

    docs.push({
      filename: "architecture.md",
      content: svcArch,
      path: `openspec/specs/${svc.artifactId}/architecture.md`,
    });
  }

  console.log(`  Generated ${docs.length} spec documents`);
  return docs;
}