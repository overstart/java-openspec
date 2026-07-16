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

  // 6.1: 使用 openspec store setup 创建骨架
  console.log(t.storeCreating(storePath));
  const storeId = `${artifactId}-specs`;
  runCommand(["openspec", "store", "setup", storeId, "--path", storePath, "--no-init-git"]);

  // 确保目录存在
  const docsDir = join(storePath, "openspec", "docs");
  const diagramsDir = join(docsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  // 填充 config.yaml context 和 rules
  await fillConfigYaml(storePath, result);

  // 添加 remote 到 store.yaml
  await fillStoreYaml(storePath, rootPath);

  // 生成 specs/ 文件
  await generateSpecs(storePath, result);

  // 6.2: 写入 spec 文件
  console.log(t.storeWritingSpecs);
  for (const doc of docs) {
    const filePath = join(storePath, doc.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, doc.content, "utf-8");
  }

  // 6.4: 写入图表源文件
  console.log(t.storeWritingDiagrams);
  for (const diag of diagrams) {
    const filePath = join(diagramsDir, diag.filename);
    await writeFile(filePath, diag.content, "utf-8");
  }

  // 6.5: 注册 store
  console.log(t.storeRegistering);
  runCommand(["openspec", "store", "register", storePath]);

  // 6.7: 校验 store
  console.log(t.storeValidating);
  const doctorOutput = runCommand(["openspec", "store", "doctor", `${artifactId}-specs`]);
  console.log(doctorOutput);

  return storePath;
}

// 填充 config.yaml 的 context 和 rules 字段
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

  const context = lang === "zh"
    ? `Tech stack: ${techStack}\nArchitecture: Microservices (${projectInfo.serviceModules.length} services)\nAuth: ${securityInfo.authFramework}\nNaming: ${namingPattern}\nBusiness domains: ${prefixes}`
    : `Tech stack: ${techStack}\nArchitecture: Microservices (${projectInfo.serviceModules.length} services)\nAuth: ${securityInfo.authFramework}\nNaming: ${namingPattern}\nBusiness domains: ${prefixes}`;

  const rulesProposal = lang === "zh"
    ? `- \u9075\u5faa\u73b0\u6709\u547d\u540d\u89c4\u8303: ${namingPattern}\n- \u4f7f\u7528 ${securityInfo.authFramework} \u505a\u8ba4\u8bc1\u6388\u6743`
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

// 添加 remote 到 store.yaml
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

// 生成 specs/ 文件
async function generateSpecs(storePath: string, result: AnalysisResult): Promise<void> {
  const specsDir = join(storePath, "openspec", "specs");
  const { globalPatterns, securityInfo, projectInfo } = result;

  // coding-conventions
  const codingConvDir = join(specsDir, "coding-conventions");
  await mkdir(codingConvDir, { recursive: true });
  const namingReq = globalPatterns.namingPatterns
    .map((p) => `### Requirement: ${p.type} \u547d\u540d\u89c4\u8303\n${p.type} \u5e94\u9075\u5faa ${p.pattern} \u547d\u540d\u6a21\u5f0f\u3002\n\n#### Scenario: \u5df2\u6709\u793a\u4f8b\n- **WHEN** \u67e5\u770b\u4ee3\u7801\u4e2d\u7684 ${p.type} \u7c7b\n- **THEN** \u540d\u79f0\u7b26\u5408 ${p.pattern} \u6a21\u5f0f\uff08\u793a\u4f8b: ${p.examples.join(", ")}\uff09`)
    .join("\n\n");

  await writeFile(join(codingConvDir, "spec.md"),
    `# coding-conventions\n\n## Purpose\n\n\u9879\u76ee\u7f16\u7801\u89c4\u8303\u5b9a\u4e49\u3002\n\n## Requirements\n\n${namingReq}\n`, "utf-8");

  // service-architecture
  const archDir = join(specsDir, "service-architecture");
  await mkdir(archDir, { recursive: true });
  const depGraph = Object.entries(projectInfo.dependencyGraph)
    .filter(([, deps]) => deps.length > 0)
    .map(([mod, deps]) => `- ${mod} -> ${deps.join(", ")}`)
    .join("\n");

  await writeFile(join(archDir, "spec.md"),
    `# service-architecture\n\n## Purpose\n\n\u670d\u52a1\u67b6\u6784\u89c4\u8303\u5b9a\u4e49\u3002\n\n## Requirements\n\n### Requirement: \u670d\u52a1\u6a21\u5757\u62d3\u6251\n\u9879\u76ee\u5305\u542b ${projectInfo.serviceModules.length} \u4e2a\u670d\u52a1\u6a21\u5757\u3002\n\n#### Scenario: \u6a21\u5757\u4f9d\u8d56\u5173\u7cfb\n- **WHEN** \u67e5\u770b\u670d\u52a1\u95f4\u4f9d\u8d56\n- **THEN** ${depGraph || "\u65e0\u670d\u52a1\u95f4\u4f9d\u8d56"}\n`, "utf-8");

  // security-patterns
  const secDir = join(specsDir, "security-patterns");
  await mkdir(secDir, { recursive: true });
  await writeFile(join(secDir, "spec.md"),
    `# security-patterns\n\n## Purpose\n\n\u5b89\u5168\u6a21\u5f0f\u5b9a\u4e49\u3002\n\n## Requirements\n\n### Requirement: \u8ba4\u8bc1\u6388\u6743\n\u9879\u76ee\u4f7f\u7528 ${securityInfo.authFramework} \u505a\u8ba4\u8bc1\u6388\u6743\u3002\n\n#### Scenario: \u6743\u9650\u6ce8\u89e3\n- **WHEN** \u67e5\u770b\u4ee3\u7801\u4e2d\u7684\u6743\u9650\u6ce8\u89e3\n- **THEN** \u4f7f\u7528 ${securityInfo.authAnnotations.join(", ") || "\u65e0"} \u6ce8\u89e3\n\n### Requirement: \u52a0\u5bc6\u7b97\u6cd5\n${securityInfo.encryptionAlgorithms.length > 0 ? `\u9879\u76ee\u4f7f\u7528 ${securityInfo.encryptionAlgorithms.join(", ")} \u52a0\u5bc6\u7b97\u6cd5\u3002` : "\u672a\u68c0\u6d4b\u5230\u52a0\u5bc6\u7b97\u6cd5\u3002"}\n\n#### Scenario: \u52a0\u5bc6\u5e93\n- **WHEN** \u67e5\u770b\u52a0\u5bc6\u5b9e\u73b0\n- **THEN** \u4f7f\u7528 ${securityInfo.encryptionLibraries.join(", ") || "\u65e0"} \u52a0\u5bc6\u5e93\n`, "utf-8");
}


export function generateReport(
  result: AnalysisResult,
  docs: SpecDoc[],
  diagrams: DiagramFile[],
  storePath: string
): string {
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
    `  - overview.md`,
    `  - coding-style.md`,
    `  - architecture.md`,
    `  - security.md`,
    `  - business-domains.md`,
    "",
    t.reportServiceSpecs,
    ...result.projectInfo.serviceModules
      
      .map((m) => `  - ${m.artifactId}/architecture.md`),
    ...result.projectInfo.serviceModules
      .filter((m) => result.serviceAnalyses[m.artifactId]?.controllers.length)
      .map((m) => `  - ${m.artifactId}/api-contracts.md`),
    "",
    "=".repeat(60),
  ];

  return lines.join("\n");
}