import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import {
  detectProject,
  readPom,
  isSpringBootService,
  extractDependencies,
  extractDependencyVersions,
  extractRootProperties,
  extractManagedVersions,
  extractVersion,
  getValue,
} from "./detect";
import { analyzeProject } from "./analyze";
import { generateDiagrams } from "./generate-diagrams";
import { generateDocs } from "./generate-docs";
import { createStore, generateReport } from "./create-store";
import { formatTokenReport } from "./pricing";
import { t } from "./i18n";
import type { ProjectInfo, MavenModule } from "./types";

interface ConfigFile {
  services: Record<string, string>;
  name?: string;
  exclude?: string[];
}

async function loadConfig(configPath: string): Promise<ConfigFile> {
  const content = await readFile(configPath, "utf-8");
  return load(content) as ConfigFile;
}

async function buildProjectInfoFromConfig(
  config: ConfigFile,
  basePath: string,
  configDir: string
): Promise<ProjectInfo> {
  const excludeSet = new Set(config.exclude ?? []);
  const entries = Object.entries(config.services).filter(([name]) => !excludeSet.has(name));

  const modules: MavenModule[] = [];
  // pomArtifactId -> yamlKey 映射，用于依赖图匹配
  const pomArtifactIdMap = new Map<string, string>();

  for (const [name, path] of entries) {
    const modulePath = resolve(configDir, path);
    const pomPath = join(modulePath, "pom.xml");

    if (existsSync(pomPath)) {
      const pom = await readPom(pomPath);

      // 提取 pom 真实 artifactId，用于依赖图匹配
      const pomArtifactId = getValue(pom.project.artifactId) ?? name;
      pomArtifactIdMap.set(pomArtifactId, name);

      // 尝试读父 pom 的 properties/managedVersions
      let rootProperties = extractRootProperties(pom);
      let managedVersions = extractManagedVersions(pom, rootProperties);

      const parentPomPath = join(modulePath, "..", "pom.xml");
      if (existsSync(parentPomPath) && resolve(parentPomPath) !== resolve(pomPath)) {
        try {
          const parentPom = await readPom(parentPomPath);
          const parentProperties = extractRootProperties(parentPom);
          const parentManaged = extractManagedVersions(parentPom, parentProperties);
          rootProperties = { ...parentProperties, ...rootProperties };
          managedVersions = { ...parentManaged, ...managedVersions };
        } catch {
          // 父 pom 读取失败，用模块自己的
        }
      }

      const hasModules = (pom.project.modules?.[0]?.module ?? []).length > 0;

      modules.push({
        artifactId: name,
        path: modulePath,
        isService: hasModules || isSpringBootService(pom),
        dependencies: extractDependencies(pom),
        dependencyVersions: extractDependencyVersions(pom, rootProperties, managedVersions),
        springBootVersion: extractVersion(pom, "spring-boot.version"),
        springCloudVersion: extractVersion(pom, "spring-cloud.version"),
      });
    } else {
      modules.push({
        artifactId: name,
        path: modulePath,
        isService: true,
        dependencies: [],
        dependencyVersions: {},
      });
      pomArtifactIdMap.set(name, name);
    }
  }

  // 构建依赖图：用 pom artifactId 匹配依赖，结果用 YAML key
  const dependencyGraph: Record<string, string[]> = {};
  for (const mod of modules) {
    dependencyGraph[mod.artifactId] = [];
    for (const other of modules) {
      if (other.artifactId === mod.artifactId) continue;
      // 查找 other 模块的 pom artifactId
      let otherPomArtifactId: string | undefined;
      for (const [pomId, yamlKey] of pomArtifactIdMap) {
        if (yamlKey === other.artifactId) {
          otherPomArtifactId = pomId;
          break;
        }
      }
      if (!otherPomArtifactId) continue;
      // 依赖格式为 groupId:artifactId，按后缀匹配
      if (mod.dependencies.some((d) => d.endsWith(`:${otherPomArtifactId}`))) {
        dependencyGraph[mod.artifactId]!.push(other.artifactId);
      }
    }
  }

  const artifactId = config.name ?? "workspace";
  const serviceModules = modules.filter((m) => m.isService);
  const libraryModules = modules.filter((m) => !m.isService);

  return {
    rootPath: basePath,
    groupId: "multi-project",
    artifactId,
    modules,
    serviceModules,
    libraryModules,
    dependencyGraph,
  };
}

export async function pipeline(
  projectPath: string | undefined,
  options: { force?: boolean; config?: string; output?: string }
): Promise<void> {
  const startTime = Date.now();

  const absProjectPath = resolve(projectPath ?? process.cwd());
  console.log(t.version("0.7.0"));
  console.log(t.target(absProjectPath));
  console.log(t.store(`${resolve(absProjectPath, "..")}/${absProjectPath.split("/").pop()}-specs`));
  if (options.config) console.log(t.config(options.config));
  if (options.output) console.log(`Output: ${options.output}`);
  console.log("");

  try {
    let projectInfo: ProjectInfo;

    if (options.config) {
      const config = await loadConfig(options.config);
      const configDir = dirname(resolve(options.config));
      projectInfo = await buildProjectInfoFromConfig(config, absProjectPath, configDir);
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