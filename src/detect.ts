import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseStringPromise } from "xml2js";
import type { MavenModule, ProjectInfo } from "./types";

interface PomXml {
  project: {
    groupId?: string[];
    artifactId?: string[];
    version?: string[];
    packaging?: string[];
    modules?: [{ module: string[] }];
    parent?: [
      {
        groupId?: string[];
        artifactId?: string[];
        version?: string[];
      }
    ];
    dependencies?: [
      {
        dependency: Array<{
          groupId?: string[];
          artifactId?: string[];
          version?: string[];
        }>;
      }
    ];
    dependencyManagement?: [
      {
        dependencies: [
          {
            dependency: Array<{
              groupId?: string[];
              artifactId?: string[];
              version?: string[];
            }>;
          }
        ];
      }
    ];
    properties?: Array<Record<string, string>>;
    build?: [
      {
        plugins?: [
          {
            plugin: Array<{
              groupId?: string[];
              artifactId?: string[];
            }>;
          }
        ];
      }
    ];
  };
}

function getValue(arr?: string[]): string | undefined {
  return arr?.[0];
}

async function readPom(pomPath: string): Promise<PomXml> {
  const xml = await readFile(pomPath, "utf-8");
  return parseStringPromise(xml);
}

function isSpringBootService(pom: PomXml): boolean {
  const deps = pom.project.dependencies?.[0]?.dependency ?? [];
  const hasWeb = deps.some(
    (d) =>
      getValue(d.groupId) === "org.springframework.boot" &&
      getValue(d.artifactId) === "spring-boot-starter-web"
  );

  const plugins = pom.project.build?.[0]?.plugins?.[0]?.plugin ?? [];
  const hasBootPlugin = plugins.some(
    (p) =>
      getValue(p.groupId) === "org.springframework.boot" &&
      getValue(p.artifactId) === "spring-boot-maven-plugin"
  );

  return hasWeb || hasBootPlugin;
}

function extractDependencies(pom: PomXml): string[] {
  const deps = pom.project.dependencies?.[0]?.dependency ?? [];
  return deps.map((d) => `${getValue(d.groupId)}:${getValue(d.artifactId)}`);
}

function extractDependencyVersions(
  pom: PomXml,
  rootProperties: Record<string, string>,
  managedVersions: Record<string, string>
): Record<string, string> {
  const versions: Record<string, string> = {};

  // 从根 pom 的 properties 中提取所有版本变量
  for (const [key, value] of Object.entries(rootProperties)) {
    if (key.endsWith(".version") && value) {
      versions[key] = value;
    }
  }

  // 从 dependencyManagement 中提取版本
  const dmDeps = pom.project.dependencyManagement?.[0]?.dependencies?.[0]?.dependency ?? [];
  for (const d of dmDeps) {
    const gid = getValue(d.groupId);
    const aid = getValue(d.artifactId);
    const ver = getValue(d.version);
    if (gid && aid && ver) {
      const resolved = resolveVersion(ver, rootProperties);
      if (resolved) versions[`${gid}:${aid}`] = resolved;
    }
  }

  // 从模块直接依赖中提取版本
  const deps = pom.project.dependencies?.[0]?.dependency ?? [];
  for (const d of deps) {
    const gid = getValue(d.groupId);
    const aid = getValue(d.artifactId);
    const ver = getValue(d.version);
    if (gid && aid && ver) {
      const resolved = resolveVersion(ver, rootProperties);
      if (resolved) versions[`${gid}:${aid}`] = resolved;
    }
  }

  // 合并 managed versions
  for (const [key, value] of Object.entries(managedVersions)) {
    if (!versions[key]) versions[key] = value;
  }

  return versions;
}

function resolveVersion(
  version: string,
  properties: Record<string, string>
): string | undefined {
  // 如果已经是具体版本号，直接返回
  if (!version.startsWith("${")) return version;
  // 解析 ${xxx} 引用
  const key = version.replace(/^\$\{/, "").replace(/\}$/, "");
  return properties[key] ?? undefined;
}

function extractManagedVersions(
  pom: PomXml,
  rootProperties: Record<string, string>
): Record<string, string> {
  const versions: Record<string, string> = {};
  const dmDeps = pom.project.dependencyManagement?.[0]?.dependencies?.[0]?.dependency ?? [];
  for (const d of dmDeps) {
    const gid = getValue(d.groupId);
    const aid = getValue(d.artifactId);
    const ver = getValue(d.version);
    if (gid && aid && ver) {
      const resolved = resolveVersion(ver, rootProperties);
      if (resolved) versions[`${gid}:${aid}`] = resolved;
    }
  }
  return versions;
}

function extractRootProperties(pom: PomXml): Record<string, string> {
  const props = pom.project.properties?.[0] ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value) result[key] = value;
  }
  return result;
}

function extractVersion(pom: PomXml, propKey: string): string | undefined {
  const props = pom.project.properties?.[0];
  if (props && props[propKey]) return props[propKey];
  return undefined;
}

async function analyzeModule(
  rootPath: string,
  moduleName: string,
  rootProperties: Record<string, string>,
  managedVersions: Record<string, string>
): Promise<MavenModule> {
  const modulePath = join(rootPath, moduleName);
  const pom = await readPom(join(modulePath, "pom.xml"));

  return {
    artifactId: moduleName,
    path: modulePath,
    isService: isSpringBootService(pom),
    dependencies: extractDependencies(pom),
    dependencyVersions: extractDependencyVersions(pom, rootProperties, managedVersions),
    springBootVersion: extractVersion(pom, "spring-boot.version"),
    springCloudVersion: extractVersion(pom, "spring-cloud.version"),
  };
}

function buildDependencyGraph(
  modules: MavenModule[],
  groupId: string
): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  for (const mod of modules) {
    graph[mod.artifactId] = [];
    for (const other of modules) {
      if (other.artifactId === mod.artifactId) continue;
      const otherGav = `${groupId}:${other.artifactId}`;
      if (mod.dependencies.some((d) => d === otherGav)) {
        graph[mod.artifactId]!.push(other.artifactId);
      }
    }
  }
  return graph;
}

export async function detectProject(
  projectPath: string
): Promise<ProjectInfo> {
  const rootPom = await readPom(join(projectPath, "pom.xml"));
  const groupId =
    getValue(rootPom.project.groupId) ??
    getValue(rootPom.project.parent?.[0]?.groupId) ??
    "unknown";
  const artifactId =
    getValue(rootPom.project.artifactId) ?? "unknown";

  const rootProperties = extractRootProperties(rootPom);
  const managedVersions = extractManagedVersions(rootPom, rootProperties);

  const moduleNames = rootPom.project.modules?.[0]?.module ?? [];
  const modules = await Promise.all(
    moduleNames.map((name) => analyzeModule(projectPath, name, rootProperties, managedVersions))
  );

  const serviceModules = modules.filter((m) => m.isService);
  const libraryModules = modules.filter((m) => !m.isService);

  return {
    rootPath: projectPath,
    groupId,
    artifactId,
    modules,
    serviceModules,
    libraryModules,
    dependencyGraph: buildDependencyGraph(modules, groupId),
  };
}