import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import { detectProject } from "./detect";
import { analyzeProject } from "./analyze";
import { generateDiagrams } from "./generate-diagrams";
import { generateDocs } from "./generate-docs";
import { createStore, generateReport } from "./create-store";
import { formatTokenReport } from "./pricing";
import { t } from "./i18n";
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
  basePath: string,
  configDir: string
): ProjectInfo {
  const entries = Object.entries(config.services);
  const modules: MavenModule[] = entries.map(([name, path]) => ({
    artifactId: name,
    path: resolve(configDir, path),
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

  const absProjectPath = resolve(projectPath);
  console.log(t.version("0.3.1"));
  console.log(t.target(absProjectPath));
  console.log(t.store(`${resolve(absProjectPath, "..")}/${absProjectPath.split("/").pop()}-specs`));
  if (options.config) console.log(t.config(options.config));
  console.log("");

  try {
    let projectInfo: ProjectInfo;

    if (options.config) {
      // 8.3: 使用配置文件，跳过 Maven 检测
      const config = await loadConfig(options.config);
      const configDir = dirname(resolve(options.config));
      projectInfo = buildProjectInfoFromConfig(config, absProjectPath, configDir);
      console.log(t.loadedConfig(projectInfo.serviceModules.length));
    } else {
      // 8.4: 原有行为 - 自动检测 Maven 多模块项目
      console.log(t.detecting);
      projectInfo = await detectProject(absProjectPath);
      console.log(t.foundModules(projectInfo.serviceModules.length, projectInfo.libraryModules.length));
    }

    // 2. analyze
    console.log(t.analyzing);
    const analysisResult = await analyzeProject(projectInfo);

    // 3. generate-diagrams
    console.log(t.generatingDiagrams);
    const diagrams = generateDiagrams(analysisResult);

    // 4. generate-docs
    console.log(t.generatingDocs);
    const { docs, totalUsage } = await generateDocs(analysisResult, diagrams);

    // 5. create-store
    console.log(t.creatingStore);
    const storePath = await createStore(analysisResult, docs, diagrams, options);

    // 6. done
    console.log(t.done);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${t.completed(elapsed)}`);

    const report = generateReport(analysisResult, docs, diagrams, storePath);
    console.log(report);

    // Token 消费报告 (最后输出)
    const hasLLM = !!process.env.OPENAI_API_KEY || !!process.env.ACP_AGENT_CMD;
    if (hasLLM) {
      const model = process.env.LLM_MODEL ?? "unknown";
      console.log(formatTokenReport(model, totalUsage));
    } else {
      console.log(t.noLlmNotice);
    }
  } catch (error) {
    console.error(`\n${t.errorPrefix}`, error instanceof Error ? error.message : String(error));
    console.error(t.failed);
    process.exit(1);
  }
}