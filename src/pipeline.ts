import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { detectProject } from "./detect";
import { analyzeProject } from "./analyze";
import { generateDiagrams } from "./generate-diagrams";
import { generateDocs } from "./generate-docs";
import { createStore, generateReport } from "./create-store";
import { formatTokenReport } from "./pricing";
import type { ProjectInfo, MavenModule } from "./types";

interface ConfigFile {
  services: Record<string, string>;
}

async function loadConfig(configPath: string): Promise<ConfigFile> {
  const content = await readFile(configPath, "utf-8");
  return load(content) as ConfigFile;
}

function buildProjectInfoFromConfig(
  config: ConfigFile,
  basePath: string
): ProjectInfo {
  const entries = Object.entries(config.services);
  const modules: MavenModule[] = entries.map(([name, path]) => ({
    artifactId: name,
    path: resolve(path),
    isService: true,
    dependencies: [],
    dependencyVersions: {},
  }));

  return {
    rootPath: basePath,
    groupId: "multi-project",
    artifactId: "workspace",
    modules,
    serviceModules: modules,
    libraryModules: [],
    dependencyGraph: {},
  };
}

export async function pipeline(
  projectPath: string,
  options: { force?: boolean; config?: string }
): Promise<void> {
  const startTime = Date.now();

  console.log("java-openspec v0.1.0");
  console.log(`Target: ${projectPath}`);
  if (options.config) console.log(`Config: ${options.config}`);
  console.log("");

  try {
    let projectInfo: ProjectInfo;

    if (options.config) {
      // 8.3: 使用配置文件，跳过 Maven 检测
      const config = await loadConfig(options.config);
      projectInfo = buildProjectInfoFromConfig(config, projectPath);
      console.log(
        `[1/6] Loaded config: ${projectInfo.serviceModules.length} services`
      );
    } else {
      // 8.4: 原有行为 - 自动检测 Maven 多模块项目
      console.log("[1/6] Detecting project structure...");
      projectInfo = await detectProject(projectPath);
      console.log(
        `  Found ${projectInfo.serviceModules.length} services, ${projectInfo.libraryModules.length} libraries`
      );
    }

    // 2. analyze
    console.log("[2/6] Analyzing code...");
    const analysisResult = await analyzeProject(projectInfo);

    // 3. generate-diagrams
    console.log("[3/6] Generating diagrams...");
    const diagrams = generateDiagrams(analysisResult);

    // 4. generate-docs
    console.log("[4/6] Generating spec documents (this may take a while)...");
    const { docs, totalUsage } = await generateDocs(analysisResult, diagrams);

    // 5. create-store
    console.log("[5/6] Creating OpenSpec store...");
    const storePath = await createStore(analysisResult, docs, diagrams, options);
    console.log(`  Store: ${storePath}`);

    // 6. done
    console.log("[6/6] Done!");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s`);

    // Token 消费报告
    const model = process.env.LLM_MODEL ?? "unknown";
    console.log(formatTokenReport(model, totalUsage));

    const report = generateReport(analysisResult, docs, diagrams, storePath);
    console.log(report);
  } catch (error) {
    console.error("\nError:", error instanceof Error ? error.message : String(error));
    console.error("Pipeline failed. Check the error above for details.");
    process.exit(1);
  }
}