import { execSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { AnalysisResult, SpecDoc, DiagramFile } from "./types";

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8" });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return err.stdout ?? err.stderr ?? String(e);
  }
}

export async function createStore(
  result: AnalysisResult,
  docs: SpecDoc[],
  diagrams: DiagramFile[],
  options: { force?: boolean }
): Promise<string> {
  const { rootPath, artifactId } = result.projectInfo;
  const parentPath = dirname(rootPath);
  const storePath = join(parentPath, `${artifactId}-specs`);

  // 6.1: 使用 openspec store setup 创建骨架
  console.log(`  Creating store at ${storePath}...`);
  const setupCmd = `openspec store setup --path "${storePath}" --no-init-git`;
  runCommand(setupCmd);

  // 确保目录存在
  const specsDir = join(storePath, "openspec", "specs");
  const diagramsDir = join(specsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  // 6.2: 写入全局 spec 文件
  console.log("  Writing global spec files...");
  for (const doc of docs) {
    if (doc.path.startsWith("openspec/specs/") && !doc.path.includes("/", "openspec/specs/".length + 1)) {
      const filePath = join(storePath, doc.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, doc.content, "utf-8");
    }
  }

  // 6.3: 写入按服务 spec 文件
  console.log("  Writing per-service spec files...");
  for (const doc of docs) {
    if (doc.path.includes("/", "openspec/specs/".length + 1)) {
      const filePath = join(storePath, doc.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, doc.content, "utf-8");
    }
  }

  // 6.4: 写入图表源文件
  console.log("  Writing diagram files...");
  for (const diag of diagrams) {
    const filePath = join(diagramsDir, diag.filename);
    await writeFile(filePath, diag.content, "utf-8");
  }

  // 6.5: 注册 store
  console.log("  Registering store...");
  runCommand(`openspec store register "${storePath}"`);

  // 6.7: 校验 store
  console.log("  Validating store...");
  const doctorOutput = runCommand(`openspec store doctor ${artifactId}-specs`);
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
    "  java-openspec — 生成完成",
    "=".repeat(60),
    "",
    `Store: ${storePath}`,
    "",
    `微服务模块: ${result.projectInfo.serviceModules.length} 个`,
    ...result.projectInfo.serviceModules.map((m) => `  - ${m.artifactId} (${m.isService ? "微服务" : "公共库"})`),
    "",
    `公共库模块: ${result.projectInfo.libraryModules.length} 个`,
    ...result.projectInfo.libraryModules.map((m) => `  - ${m.artifactId}`),
    "",
    `Spec 文档: ${docs.length} 个`,
    `图表文件: ${diagrams.length} 个`,
    "",
    `全局 Spec:`,
    `  - overview.md`,
    `  - coding-style.md`,
    `  - architecture.md`,
    `  - security.md`,
    "",
    `按服务 Spec:`,
    ...result.projectInfo.serviceModules
      .filter((m) => m.artifactId !== "mall-common" && m.artifactId !== "mall-mbg")
      .map((m) => `  - ${m.artifactId}/architecture.md`),
    "",
    "=".repeat(60),
  ];

  return lines.join("\n");
}