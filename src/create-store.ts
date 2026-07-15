import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import type { AnalysisResult, SpecDoc, DiagramFile } from "./types";
import { t } from "./i18n";

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
    "",
    t.reportServiceSpecs,
    ...result.projectInfo.serviceModules
      .filter((m) => m.artifactId !== "mall-common" && m.artifactId !== "mall-mbg")
      .map((m) => `  - ${m.artifactId}/architecture.md`),
    "",
    "=".repeat(60),
  ];

  return lines.join("\n");
}