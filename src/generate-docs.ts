import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { AnalysisResult, SpecDoc, DiagramFile, TokenUsage } from "./types";
import { loadEnv } from "./env";
import { createProvider } from "./providers";
import { t } from "./i18n";

// 加载 .env (三级优先级)
await loadEnv();

// 从 pom.xml 的 dependencyManagement 自动构建技术栈表格
function buildTechStackTable(versions: Record<string, string>): string {
  // 过滤出有意义的依赖（排除内部模块、test scope、lombok 等）
  const skipPrefixes = ["com.macro.mall:", "org.projectlombok:", "org.springframework.boot:spring-boot-configuration-processor"];
  const entries = Object.entries(versions)
    .filter(([key]) => !skipPrefixes.some(p => key.startsWith(p)))
    .filter(([key]) => key.includes(":"));

  if (entries.length === 0) return "";

  const rows = entries.map(([key, ver]) => {
    const artifactId = key.split(":")[1] ?? key;
    return `| ${artifactId} | ${ver} | |`;
  });

  return [
    "### 技术栈",
    "| 依赖 | 版本 | 用途 |",
    "|------|------|------|",
    ...rows,
  ].join("\n");
}

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

  // 预建技术栈表格（从 pom.xml 直接提取，不经 LLM）
  if (projectInfo.serviceModules.length > 0) {
    const first = projectInfo.serviceModules[0]!;
    const table = buildTechStackTable(first.dependencyVersions);
    if (table) parts.push(table);
  }
  parts.push(``);

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
    parts.push(`## 各服务分析`);
    for (const [name, analysis] of Object.entries(result.serviceAnalyses)) {
      parts.push(`- ${name}: ${analysis?.controllers.length ?? 0} Controllers, ${analysis?.services.length ?? 0} Services`);
      if (analysis?.feignClients.length) {
        parts.push(`  Feign: ${analysis.feignClients.map(f => `${f.className}→${f.targetService}`).join(", ")}`);
      }
    }
    parts.push(``);
  }

  return parts.join("\n");
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

function formatServiceContext(svc: import("./types").MavenModule, analysis: import("./types").ServiceAnalysis | undefined): string {
  return [
    `## \u670d\u52a1: ${svc.artifactId}`,
    `- \u8def\u5f84: ${svc.path}`,
    `- Controllers: ${analysis?.controllers.length ?? 0} \u4e2a`,
    `- Controller\u5217\u8868: ${analysis?.controllers.map(c => c.className).join(", ") ?? "\u65e0"}`,
    `- Services: ${analysis?.services.length ?? 0} \u4e2a`,
    `- Feign\u5ba2\u6237\u7aef: ${analysis?.feignClients.map(f => `${f.className}->${f.targetService}`).join(", ") ?? "\u65e0"}`,
    `- \u5305\u7ed3\u6784: ${analysis?.packageTree.join(", ") ?? "\u65e0"}`,
    `- \u4f9d\u8d56: ${svc.dependencies.join(", ")}`,
    `- \u56fe\u8868: diagrams/${svc.artifactId}-container.mmd, diagrams/${svc.artifactId}-flow.mmd`,
  ].join("\n");
}

export async function generateDocs(
  result: AnalysisResult,
  diagrams: DiagramFile[]
): Promise<{ docs: SpecDoc[]; totalUsage: TokenUsage }> {
  const provider = createProvider();
  const docs: SpecDoc[] = [];
  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  function addUsage(u: TokenUsage) {
    totalUsage.promptTokens += u.promptTokens;
    totalUsage.completionTokens += u.completionTokens;
    totalUsage.totalTokens += u.totalTokens;
  }

  // === 无 LLM 模式: 直揮输出分析数据 ===
  if (!provider) {
    const specTypes = ["overview", "coding-style", "architecture", "security"] as const;
    for (const name of specTypes) {
      console.log(t.generatingDoc(name));
      const analysis = formatAnalysisForLLM(result, name);
      docs.push({
        filename: `${name}.md`,
        content: `${t.noLlmHeader}\n\n${analysis}`,
        path: `openspec/docs/${name}.md`,
      });
    }

    const serviceModules = result.projectInfo.serviceModules.filter(
      (svc) => svc.isService && svc.artifactId !== "mall-common"
    );
    for (const svc of serviceModules) {
      const analysis = result.serviceAnalyses[svc.artifactId];
      const svcContext = formatServiceContext(svc, analysis);
      console.log(t.generatingArch(svc.artifactId));
      docs.push({
        filename: "architecture.md",
        content: `${t.noLlmHeader}\n\n${svcContext}`,
        path: `openspec/docs/${svc.artifactId}/architecture.md`,
      });
    }

    console.log(t.generatedDocs(docs.length));
    return { docs, totalUsage };
  }

  // === LLM 模式: 当前行为 ===
  const specTypes = ["overview", "coding-style", "architecture", "security"] as const;
  const globalResults = await Promise.all(
    specTypes.map(async (name) => {
      console.log(t.generatingDoc(name));
      const template = await loadTemplate(name);
      const analysis = formatAnalysisForLLM(result, name);
      const { content, usage } = await provider.generate(template, analysis);
      const validation = await validateSpecStructure(content, name);
      if (!validation.valid) {
        console.warn(t.validationWarning(name), validation.warnings);
      }
      return { name, content, usage };
    })
  );

  for (const r of globalResults) {
    addUsage(r.usage);
    docs.push({
      filename: `${r.name}.md`,
      content: r.content,
      path: `openspec/docs/${r.name}.md`,
    });
  }

  const serviceModules = result.projectInfo.serviceModules.filter(
    (svc) => svc.isService && svc.artifactId !== "mall-common"
  );

  const archResults = await Promise.all(
    serviceModules.map(async (svc) => {
      const analysis = result.serviceAnalyses[svc.artifactId];
      const svcContext = formatServiceContext(svc, analysis);
      console.log(t.generatingArch(svc.artifactId));
      const template = await loadTemplate("architecture");
      const { content, usage } = await provider.generate(template, svcContext);
      return { artifactId: svc.artifactId, content, usage };
    })
  );

  for (const r of archResults) {
    addUsage(r.usage);
    docs.push({
      filename: "architecture.md",
      content: r.content,
      path: `openspec/docs/${r.artifactId}/architecture.md`,
    });
  }

  await provider.close?.();
  console.log(t.generatedDocs(docs.length));
  return { docs, totalUsage };
}