import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { AnalysisResult, SpecDoc, DiagramFile } from "./types";
import { t, lang } from "./i18n";

function runCommand(args: string[]): string {
  const result = Bun.spawnSync(args);
  if (!result.exitCode || result.exitCode === 0) return result.stdout.toString();
  throw new Error(`${args[0]} failed: ${result.stderr.toString().trim()}`);
}

export async function createStore(
  result: AnalysisResult,
  docs: SpecDoc[],
  diagrams: DiagramFile[],
  options: { force?: boolean; output?: string }
): Promise<string> {
  const { rootPath, artifactId } = result.projectInfo;
  const storePath = options.output
    ? resolve(options.output)
    : join(dirname(rootPath), `${artifactId}-specs`);

  console.log(t.storeCreating(storePath));
  const storeId = `${artifactId}-specs`;
  runCommand(["openspec", "store", "setup", storeId, "--path", storePath, "--no-init-git"]);

  const docsDir = join(storePath, "openspec", "docs");
  const diagramsDir = join(docsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  await fillConfigYaml(storePath, result);
  await fillStoreYaml(storePath, rootPath);
  await generateSpecs(storePath, result);

  console.log(t.storeWritingSpecs);
  for (const doc of docs) {
    const filePath = join(storePath, doc.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, doc.content, "utf-8");
  }

  console.log(t.storeWritingDiagrams);
  for (const diag of diagrams) {
    const filePath = join(diagramsDir, diag.filename);
    await writeFile(filePath, diag.content, "utf-8");
  }

  console.log(t.storeRegistering);
  runCommand(["openspec", "store", "register", storePath]);

  console.log(t.storeValidating);
  const doctorOutput = runCommand(["openspec", "store", "doctor", `${artifactId}-specs`]);
  console.log(doctorOutput);

  return storePath;
}

async function fillConfigYaml(storePath: string, result: AnalysisResult): Promise<void> {
  const configPath = join(storePath, "openspec", "config.yaml");
  const { projectInfo, globalPatterns, securityInfo } = result;

  const techStack = Object.entries(projectInfo.serviceModules[0]?.dependencyVersions ?? {})
    .slice(0, 10)
    .map(([k, v]) => `${k.split(":")[1] ?? k} ${v}`)
    .join(", ");

  const prefixes = globalPatterns.businessPrefixes.join(", ");
  const namingPattern = globalPatterns.namingPatterns
    .map((p) => `${p.type}: ${p.pattern}`)
    .join("; ");

  const context = `Tech stack: ${techStack}\nArchitecture: Microservices (${projectInfo.serviceModules.length} services)\nAuth: ${securityInfo.authFramework}\nNaming: ${namingPattern}\nBusiness domains: ${prefixes}`;

  const rulesProposal = lang === "zh"
    ? `- 遵循现有命名规范: ${namingPattern}\n- 使用 ${securityInfo.authFramework} 做认证授权`
    : `- Follow existing naming conventions: ${namingPattern}\n- Use ${securityInfo.authFramework} for authentication`;

  const configYaml = `schema: spec-driven

context: |
  ${context.replace(/\n/g, "\n  ")}

rules:
  proposal:
${rulesProposal.split("\n").map((r: string) => `    ${r}`).join("\n")}
`;

  await writeFile(configPath, configYaml, "utf-8");
}

async function fillStoreYaml(storePath: string, rootPath: string): Promise<void> {
  const gitConfigPath = join(rootPath, ".git", "config");
  if (!existsSync(gitConfigPath)) return;

  try {
    const gitConfig = await readFile(gitConfigPath, "utf-8");
    const remoteMatch = gitConfig.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
    if (!remoteMatch) return;

    const remoteUrl = remoteMatch[1]!.trim();
    const storeYamlPath = join(storePath, ".openspec-store", "store.yaml");
    const storeYaml = await readFile(storeYamlPath, "utf-8");

    if (!storeYaml.includes("remote:")) {
      await writeFile(storeYamlPath, storeYaml.trimEnd() + `\nremote: ${remoteUrl}\n`, "utf-8");
    }
  } catch {
    // Git config read failed, skip
  }
}

async function generateSpecs(storePath: string, result: AnalysisResult): Promise<void> {
  const specsDir = join(storePath, "openspec", "specs");
  const { globalPatterns, securityInfo, projectInfo } = result;

  const specTitle = (name: string, purpose: string) =>
    `# ${name} Specification\n\n## Purpose\n\n${purpose}\n\n## Requirements`;

  const namingReq = globalPatterns.namingPatterns
    .map((p) => {
      const reqTitle = lang === "zh" ? `${p.type} 命名规范` : `${p.type} naming conventions`;
      const desc = lang === "zh"
        ? `${p.type} 应遵循 ${p.pattern} 命名模式。`
        : `${p.type} should follow ${p.pattern} naming pattern.`;
      const scenario = lang === "zh"
        ? `- **WHEN** 查看代码中的 ${p.type} 类\n- **THEN** 名称符合 ${p.pattern} 模式（示例: ${p.examples.join(", ")}）`
        : `- **WHEN** looking at ${p.type} classes\n- **THEN** names follow ${p.pattern} pattern (e.g., ${p.examples.join(", ")})`;
      return `### Requirement: ${reqTitle}\n${desc}\n\n#### Scenario: ${lang === "zh" ? "已有示例" : "Existing examples"}\n${scenario}`;
    })
    .join("\n\n");

  await writeFile(join(specsDir, "coding-conventions", "spec.md"),
    `${specTitle("coding-conventions", lang === "zh" ? "项目编码规范定义。" : "Project coding conventions.")}\n\n${namingReq}\n`, "utf-8");

  const depGraph = Object.entries(projectInfo.dependencyGraph)
    .filter(([, deps]) => deps.length > 0)
    .map(([mod, deps]) => `- ${mod} -> ${deps.join(", ")}`)
    .join("\n");

  const topoReq = lang === "zh" ? "服务模块拓扑" : "Service module topology";
  const depScenario = lang === "zh" ? "模块依赖关系" : "Module dependency graph";
  const depWhen = lang === "zh" ? "查看服务间依赖" : "inspecting service dependencies";
  const depThen = depGraph || (lang === "zh" ? "无服务间依赖" : "No service dependencies");

  await writeFile(join(specsDir, "service-architecture", "spec.md"),
    `${specTitle("service-architecture", lang === "zh" ? "服务架构规范定义。" : "Service architecture conventions.")}\n\n### Requirement: ${topoReq}\n项目包含 ${projectInfo.serviceModules.length} 个服务模块。\n\n#### Scenario: ${depScenario}\n- **WHEN** ${depWhen}\n- **THEN** ${depThen}\n`, "utf-8");

  const authReq = lang === "zh" ? "认证授权" : "Authentication & Authorization";
  const authScenario = lang === "zh" ? "权限注解" : "Auth annotations";
  const authWhen = lang === "zh" ? "查看代码中的权限注解" : "inspecting auth annotations";
  const authThen = `${securityInfo.authAnnotations.join(", ") || (lang === "zh" ? "无" : "none")}`;
  const encReq = lang === "zh" ? "加密算法" : "Encryption algorithms";
  const encDesc = securityInfo.encryptionAlgorithms.length > 0
    ? (lang === "zh" ? `项目使用 ${securityInfo.encryptionAlgorithms.join(", ")} 加密算法。` : `Uses ${securityInfo.encryptionAlgorithms.join(", ")}.`)
    : (lang === "zh" ? "未检测到加密算法。" : "No encryption algorithms detected.");
  const encScenario = lang === "zh" ? "加密库" : "Encryption libraries";
  const encWhen = lang === "zh" ? "查看加密实现" : "inspecting encryption implementation";
  const encThen = `${securityInfo.encryptionLibraries.join(", ") || (lang === "zh" ? "无" : "none")}`;

  await writeFile(join(specsDir, "security-patterns", "spec.md"),
    `${specTitle("security-patterns", lang === "zh" ? "安全模式定义。" : "Security patterns.")}\n\n### Requirement: ${authReq}\n项目使用 ${securityInfo.authFramework} 做认证授权。\n\n#### Scenario: ${authScenario}\n- **WHEN** ${authWhen}\n- **THEN** 使用 ${authThen} 注解\n\n### Requirement: ${encReq}\n${encDesc}\n\n#### Scenario: ${encScenario}\n- **WHEN** ${encWhen}\n- **THEN** 使用 ${encThen} 加密库\n`, "utf-8");
}

export function generateReport(
  result: AnalysisResult,
  docs: SpecDoc[],
  diagrams: DiagramFile[],
  storePath: string
): string {
  const serviceModules = result.projectInfo.serviceModules.filter((m) => m.isService);

  const globalDocNames = [
    "overview.md",
    "coding-style.md",
    "architecture.md",
    "security.md",
    "business-domains.md",
  ];
  const reportGlobalDocs = globalDocNames.map((n) => `  - ${n}`);

  const reportPerServiceDocs = serviceModules.flatMap((m) => {
    const lines: string[] = [];
    lines.push(`  - ${m.artifactId}/architecture.md`);
    lines.push(`  - ${m.artifactId}/business-domains.md`);
    if (result.serviceAnalyses[m.artifactId]?.controllers.length) {
      lines.push(`  - ${m.artifactId}/api-contracts.md`);
    }
    return lines;
  });

  const lines = [
    "=".repeat(60),
    `  ${t.reportTitle}`,
    "=".repeat(60),
    "",
    `Store: ${storePath}`,
    "",
    t.reportServiceModules(result.projectInfo.serviceModules.length),
    ...result.projectInfo.serviceModules.map((m) => `  - ${m.artifactId} (${m.isService ? t.reportMicroService : t.reportLibrary})`),
    "",
    t.reportLibraryModules(result.projectInfo.libraryModules.length),
    ...result.projectInfo.libraryModules.map((m) => `  - ${m.artifactId}`),
    "",
    t.reportSpecDocs(docs.length),
    t.reportDiagramFiles(diagrams.length),
    "",
    t.reportGlobalSpecs,
    ...reportGlobalDocs,
    "",
    t.reportServiceSpecs,
    ...reportPerServiceDocs,
    "",
    "=".repeat(60),
  ];

  return lines.join("\n");
}