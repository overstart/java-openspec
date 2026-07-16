import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { AnalysisResult, ServiceAnalysis, SpecDoc, DiagramFile, TokenUsage } from "./types";
import { loadEnv } from "./env";
import { createProvider } from "./providers";
import { t, lang } from "./i18n";

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
    t.lblTechStack,
    "| 依赖 | 版本 | 用途 |",
    "|------|------|------|",
    ...rows,
  ].join("\n");
}

async function loadTemplate(name: string): Promise<string> {
  const path = join(import.meta.dirname!, "..", "templates", lang, `${name}.md`);
  return readFile(path, "utf-8");
}

async function loadSpecTemplate(name: string): Promise<Record<string, unknown>> {
  const path = join(import.meta.dirname!, "..", "spec-templates", lang, `${name}.json`);
  return JSON.parse(await readFile(path, "utf-8"));
}

function formatAnalysisForLLM(result: AnalysisResult, templateName: string): string {
  const { projectInfo, globalPatterns, securityInfo } = result;

  const parts: string[] = [];

  parts.push(t.lblProjectInfo);
  parts.push(`${t.lblGroupId}: ${projectInfo.groupId}`);
  parts.push(`${t.lblArtifactId}: ${projectInfo.artifactId}`);
  parts.push(`${t.lblServiceModules}: ${projectInfo.serviceModules.map((m) => m.artifactId).join(", ")}`);
  parts.push(`${t.lblLibraryModules}: ${projectInfo.libraryModules.map((m) => m.artifactId).join(", ")}`);

  // 预建技术栈表格（从 pom.xml 直接提取，不经 LLM）
  if (projectInfo.serviceModules.length > 0) {
    const first = projectInfo.serviceModules[0]!;
    const table = buildTechStackTable(first.dependencyVersions);
    if (table) parts.push(table);
  }
  parts.push(``);

  parts.push(``);

  if (templateName === "coding-style" || templateName === "overview") {
    parts.push(t.lblNamingPatterns);
    parts.push(`${t.lblController}: ${globalPatterns.namingPatterns[0]?.examples.join(", ") ?? t.lblNotDetected}`);
    parts.push(`${t.lblServiceLabel}: ${globalPatterns.namingPatterns[1]?.examples.join(", ") ?? t.lblNotDetected}`);
    parts.push(`${t.lblBusinessPrefix}: ${globalPatterns.businessPrefixes.join(", ")}`);
    parts.push(`${t.lblDtoSuffix}: ${globalPatterns.dtoSuffixes.join(", ")}`);
    parts.push(`${t.lblEntitySuffix}: ${globalPatterns.entitySuffixes.join(", ")}`);
    parts.push(`${t.lblPackageStructure}: ${globalPatterns.packageStructure.join(", ")}`);
    parts.push(``);
  }

  if (templateName === "architecture" || templateName === "overview") {
    parts.push(t.lblModuleDeps);
    for (const [mod, deps] of Object.entries(projectInfo.dependencyGraph)) {
      if (deps.length > 0) {
        parts.push(`- ${mod} → ${deps.join(", ")}`);
      }
    }
    parts.push(``);
  }

  if (templateName === "security") {
    parts.push(t.lblSecurityInfo);
    parts.push(`${t.lblEncryptionAlgo}: ${securityInfo.encryptionAlgorithms.join(", ") || t.lblNotDetected}`);
    parts.push(`${t.lblEncryptionLib}: ${securityInfo.encryptionLibraries.join(", ") || t.lblNotDetected}`);
    parts.push(`${t.lblAuthFramework}: ${securityInfo.authFramework}`);
    parts.push(`${t.lblAuthAnnotation}: ${securityInfo.authAnnotations.join(", ") || t.lblNotDetected}`);
    parts.push(`${t.lblAuthProgrammatic}: ${securityInfo.authProgrammaticAPIs.join(", ") || t.lblNotDetected}`);
    parts.push(`${t.lblMultiAccount}: ${securityInfo.hasMultiAccount ? "是" : "否"}`);
    parts.push(`${t.lblSensitiveFields}: ${securityInfo.sensitiveFields.join(", ") || t.lblNotDetected}`);
    parts.push(``);
  }

  if (templateName === "overview") {
    parts.push(t.lblServiceAnalysis);
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
      warnings.push(`${t.lblMissingSection} ${section}`);
    }
  }

  // 检查表格存在性
  const requiredTables = (specTemplate.requiredTables as string[]) ?? [];
  const hasTable = tree.children.some((n) => n.type === "table");
  if (requiredTables.length > 0 && !hasTable) {
    warnings.push(`${t.lblMissingTable} ${requiredTables.join(", ")} 表格`);
  }

  return { valid: warnings.length === 0, warnings };
}

function formatServiceContext(svc: import("./types").MavenModule, analysis: import("./types").ServiceAnalysis | undefined): string {
  return [
    `${t.lblService} ${svc.artifactId}`,
    `${t.lblPath} ${svc.path}`,
    `${t.lblControllers} ${analysis?.controllers.length ?? 0}`,
    `${t.lblControllerList} ${analysis?.controllers.map(c => c.className).join(", ") ?? t.lblNotDetected}`,
    `${t.lblServices} ${analysis?.services.length ?? 0}`,
    `${t.lblFeignClients} ${analysis?.feignClients.map(f => `${f.className}->${f.targetService}`).join(", ") ?? t.lblNotDetected}`,
    `${t.lblPackageTree} ${analysis?.packageTree.join(", ") ?? t.lblNotDetected}`,
    `${t.lblDependencies} ${svc.dependencies.join(", ")}`,
    `${t.lblDiagrams} diagrams/${svc.artifactId}-container.mmd, diagrams/${svc.artifactId}-flow.mmd`,
  ].join("\n");
}


// 业务前缀字典
const DOMAIN_PREFIXES: Record<string, { en: string; zh: string }> = {
  Pms: { en: "Product Management", zh: "商品管理" },
  Oms: { en: "Order Management", zh: "订单管理" },
  Ums: { en: "User Management", zh: "用户管理" },
  Sms: { en: "Sales/Marketing Management", zh: "营销管理" },
  Es: { en: "Elasticsearch Search", zh: "搜索" },
  Cms: { en: "Content Management", zh: "内容管理" },
};

// 免 LLM 生成每个服务的 business-domains（与 LLM 模板结构对齐）
function generateServiceBusinessDomains(
  svc: import("./types").MavenModule,
  analysis: ServiceAnalysis | undefined,
  prefixes: string[]
): string {
  if (!analysis) return "";
  const lines: string[] = [`## ${svc.artifactId} ${t.lblBusinessDomains}`];

  // === Controllers by Domain ===
  lines.push("\n### Controllers by Domain");

  for (const prefix of prefixes) {
    const domain = DOMAIN_PREFIXES[prefix];
    const domainName = domain ? domain[lang === "zh" ? "zh" : "en"] : t.lblUnknownDomain;
    const ctrls = analysis.controllers.filter(c => c.className.startsWith(prefix));
    if (ctrls.length === 0) continue;

    lines.push(`\n#### ${prefix} — ${domainName}`);

    let hasMethods = false;
    for (const ctrl of ctrls) {
      if (ctrl.methods.length === 0) continue;
      hasMethods = true;

      lines.push(`\n**${ctrl.className}**${ctrl.requestMapping ? ` — base path: \`${ctrl.requestMapping}\`` : ""}`);
      lines.push("");
      lines.push("| Controller | Method | HTTP | Path |");
      lines.push("|------------|--------|------|------|");
      for (const method of ctrl.methods) {
        lines.push(`| ${ctrl.className} | ${method.name} | ${method.httpMethod} | \`${method.path}\` |`);
      }
    }

    if (!hasMethods) {
      lines.push("No methods detected");
    }
  }

  return lines.join("\n");
}

// 免 LLM 生成全局 business-domains 导航索引（按领域 → 服务）
function generateBusinessDomainsIndex(result: AnalysisResult): string {
  const serviceModules = result.projectInfo.serviceModules.filter(svc => svc.isService);
  const lines: string[] = [`# ${t.lblBusinessDomains}`];
  lines.push("");

  for (const prefix of result.globalPatterns.businessPrefixes) {
    const domain = DOMAIN_PREFIXES[prefix];
    const domainName = domain ? domain[lang === "zh" ? "zh" : "en"] : t.lblUnknownDomain;

    // 收集该领域涉及的所有服务
    const related: { artifactId: string; ctrlCount: number; methodCount: number }[] = [];
    for (const svc of serviceModules) {
      const analysis = result.serviceAnalyses[svc.artifactId];
      if (!analysis) continue;
      const ctrls = analysis.controllers.filter(c => c.className.startsWith(prefix));
      if (ctrls.length === 0) continue;
      const methodCount = ctrls.reduce((sum, c) => sum + c.methods.length, 0);
      related.push({ artifactId: svc.artifactId, ctrlCount: ctrls.length, methodCount });
    }

    if (related.length === 0) continue;

    lines.push(`\n### ${prefix} — ${domainName}`);
    for (const r of related) {
      lines.push(`- [${r.artifactId}](/${r.artifactId}/business-domains.md) — ${r.ctrlCount} controllers, ${r.methodCount} methods`);
    }
  }

  return lines.join("\n");
}

// 无 LLM 模式生成单个服务的 api-contracts.md
function generateApiContractsRaw(
  svc: import("./types").MavenModule,
  analysis: ServiceAnalysis | undefined
): string {
  if (!analysis || analysis.controllers.length === 0) return "";
  const lines: string[] = [`## ${svc.artifactId} ${t.lblRestApi}`];

  for (const ctrl of analysis.controllers) {
    lines.push(`\n### ${ctrl.className}`);
    lines.push(`- Methods: ${ctrl.methods.length}`);
    if (ctrl.requestMapping) {
      lines.push(`- Base path: ${ctrl.requestMapping}`);
    }
  }

  // Feign 客户端
  if (analysis.feignClients.length > 0) {
    lines.push(`\n## ${t.lblFeignInterfaces}`);
    for (const fc of analysis.feignClients) {
      lines.push(`- ${fc.className} -> ${fc.targetService}`);
    }
  }

  return lines.join("\n");
}

// 添加交叉引用
function addCrossReferences(content: string): string {
  const links = [
    `[architecture.md](architecture.md)`,
    `[coding-style.md](coding-style.md)`,
    `[security.md](security.md)`,
    `[business-domains.md](business-domains.md)`,
  ].join("\n- ");

  return `${content}\n\n## ${t.lblRelatedDocs}\n- ${links}\n`;
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
      (svc) => svc.isService
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

    // per-service business-domains (免 LLM, 方法级表格)
    for (const svc of serviceModules) {
      const analysis = result.serviceAnalyses[svc.artifactId];
      const content = generateServiceBusinessDomains(svc, analysis, result.globalPatterns.businessPrefixes);
      if (content) {
        docs.push({
          filename: "business-domains.md",
          content: `${t.noLlmHeader}\n\n${content}`,
          path: `openspec/docs/${svc.artifactId}/business-domains.md`,
        });
      }
    }

    // 全局 business-domains 导航索引
    console.log(t.generatingDoc("business-domains"));
    docs.push({
      filename: "business-domains.md",
      content: `${t.noLlmHeader}\n\n${generateBusinessDomainsIndex(result)}`,
      path: "openspec/docs/business-domains.md",
    });

    // per-service api-contracts.md (无 LLM 原始数据)
    for (const svc of serviceModules) {
      const analysis = result.serviceAnalyses[svc.artifactId];
      const content = generateApiContractsRaw(svc, analysis);
      if (content) {
        console.log(t.generatingDoc(`${svc.artifactId}/api-contracts`));
        docs.push({
          filename: "api-contracts.md",
          content: `${t.noLlmHeader}\n\n${content}`,
          path: `openspec/docs/${svc.artifactId}/api-contracts.md`,
        });
      }
    }

    // 交叉引用: 追加到 overview.md
    const overviewDoc = docs.find(d => d.filename === "overview.md");
    if (overviewDoc) {
      overviewDoc.content = addCrossReferences(overviewDoc.content);
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

  // 交叉引用: 追加到 overview.md
  const overviewDoc = docs.find(d => d.filename === "overview.md");
  if (overviewDoc) {
    overviewDoc.content = addCrossReferences(overviewDoc.content);
  }

  const serviceModules = result.projectInfo.serviceModules.filter(
    (svc) => svc.isService
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

  // per-service business-domains (LLM 模式)
  const bdResults = await Promise.all(
    serviceModules.map(async (svc) => {
      console.log(t.generatingDoc(`${svc.artifactId}/business-domains`));
      const template = await loadTemplate("business-domains-service");
      const analysis = result.serviceAnalyses[svc.artifactId];
      const svcData = generateServiceBusinessDomains(svc, analysis, result.globalPatterns.businessPrefixes);
      const { content, usage } = await provider.generate(template, svcData);
      return { artifactId: svc.artifactId, content, usage };
    })
  );

  for (const r of bdResults) {
    addUsage(r.usage);
    docs.push({
      filename: "business-domains.md",
      content: r.content,
      path: `openspec/docs/${r.artifactId}/business-domains.md`,
    });
  }

  // per-service api-contracts (LLM 模式)
  const acResults = await Promise.all(
    serviceModules.map(async (svc) => {
      console.log(t.generatingDoc(`${svc.artifactId}/api-contracts`));
      const template = await loadTemplate("api-contracts");
      const analysis = result.serviceAnalyses[svc.artifactId];
      const svcData = generateApiContractsRaw(svc, analysis);
      if (!svcData) return null;
      const { content, usage } = await provider.generate(template, svcData);
      return { artifactId: svc.artifactId, content, usage };
    })
  );

  for (const r of acResults) {
    if (!r) continue;
    addUsage(r.usage);
    docs.push({
      filename: "api-contracts.md",
      content: r.content,
      path: `openspec/docs/${r.artifactId}/api-contracts.md`,
    });
  }

  // 全局 business-domains 导航索引（免 LLM，直挥生成）
  console.log(t.generatingDoc("business-domains"));
  docs.push({
    filename: "business-domains.md",
    content: generateBusinessDomainsIndex(result),
    path: "openspec/docs/business-domains.md",
  });

  await provider.close?.();
  console.log(t.generatedDocs(docs.length));
  return { docs, totalUsage };
}