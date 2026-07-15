import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { glob } from "bun";
import { t } from "./i18n";
import type {
  AnalysisResult,
  ProjectInfo,
  GlobalPatterns,
  SecurityInfo,
  ServiceAnalysis,
  NamingPattern,
  AnnotationUsage,
  ControllerInfo,
  ServiceInfo,
  CallPath,
  FeignClientInfo,
} from "./types";

// DTO 后缀常量，分类和提取共用
const DTO_SUFFIXES = ["Param", "Dto", "DTO", "Result", "Detail", "Node", "Item", "Info", "Vo", "VO", "BO", "Query", "Response", "Request", "CallbackResult", "CallbackParam"] as const;

function runCodeGraph(args: string[], projectPath: string): string {
  const result = Bun.spawnSync(["codegraph", ...args], {
    cwd: projectPath,
  });
  if (!result.exitCode || result.exitCode === 0) return result.stdout.toString();
  throw new Error(`codegraph ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
}

export async function initCodeGraph(projectPath: string): Promise<void> {
  console.log(t.initCodeGraph);
  runCodeGraph(["init", projectPath], projectPath);
  console.log(t.codeGraphReady);
}

function explore(projectPath: string, query: string): string {
  return runCodeGraph(["explore", "-p", projectPath, query], projectPath);
}

// 使用 glob 扫描所有 Java 文件并提取类名
async function scanJavaFiles(projectPath: string): Promise<string[]> {
  const pattern = `${projectPath}/**/src/**/*.java`;

  const files = Array.from(new Bun.Glob(pattern).scanSync());
  const classes: string[] = [];

  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const m = line.match(
          /^\s*public\s+(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/
        );
        if (m) classes.push(m[1]!);
      }
    } catch {
      // skip unreadable files
    }
  }

  return classes;
}

function analyzeNamingPatterns(
  controllers: string[],
  services: string[],
  serviceImpls: string[],
  dtos: string[],
  allClasses: string[]
): {
  patterns: NamingPattern[];
  businessPrefixes: string[];
  dtoSuffixes: string[];
  entitySuffixes: string[];
} {
  // 提取业务前缀
  const prefixSet = new Set<string>();
  for (const c of controllers) {
    // 去掉 Controller 后缀，取剩余部分的前缀
    const base = c.replace(/Controller$/, "");
    const prefixMatch = base.match(/^([A-Z][a-z]+)/);
    if (prefixMatch) prefixSet.add(prefixMatch[1]!);
  }

  // DTO 后缀
  const dtoSuffixes = new Set<string>();
  const dtoSuffixRe = new RegExp(`(${DTO_SUFFIXES.join("|")})$`);
  for (const d of dtos) {
    const m = d.match(dtoSuffixRe);
    if (m) dtoSuffixes.add(m[1]!);
  }

  // 实体后缀
  const entitySuffixes = new Set<string>();
  const modelRe = /(Example|WithBLOBs)$/;
  for (const c of allClasses) {
    if (controllers.includes(c) || services.includes(c) || serviceImpls.includes(c) || dtos.includes(c)) continue;
    const m = c.match(modelRe);
    if (m) entitySuffixes.add(m[1]!);
  }

  return {
    patterns: [
      { type: "Controller", pattern: "{Prefix}{Entity}Controller", examples: controllers.slice(0, 5) },
      { type: "Service", pattern: "{Prefix}{Entity}Service", examples: services.slice(0, 5) },
      { type: "ServiceImpl", pattern: "{Prefix}{Entity}ServiceImpl", examples: serviceImpls.slice(0, 5) },
    ],
    businessPrefixes: [...prefixSet],
    dtoSuffixes: [...dtoSuffixes],
    entitySuffixes: [...entitySuffixes],
  };
}

function analyzePackages(): string[] {
  // 标准 Spring 分层包
  return ["controller", "service", "dao", "dto", "config", "component", "validator", "model", "mapper", "impl"];
}

function analyzeAnnotations(): AnnotationUsage[] {
  return [
    { layer: "Controller", annotations: ["@RestController", "@RequestMapping", "@GetMapping", "@PostMapping", "@PutMapping", "@DeleteMapping"], count: 0 },
    { layer: "Service", annotations: ["@Service", "@Transactional"], count: 0 },
    { layer: "DAO", annotations: ["@Repository", "@Mapper"], count: 0 },
    { layer: "DTO", annotations: ["@Data", "@EqualsAndHashCode", "@Builder", "@Getter", "@Setter"], count: 0 },
  ];
}

function analyzeSecurity(projectPath: string): SecurityInfo {
  const output = explore(projectPath, "encryption password BCrypt AES security token auth");

  const encryptionAlgorithms: string[] = [];
  if (/bcrypt/i.test(output)) encryptionAlgorithms.push("BCrypt");
  if (/\bAES\b/i.test(output)) encryptionAlgorithms.push("AES");
  if (/\bRSA\b/i.test(output)) encryptionAlgorithms.push("RSA");
  if (/\bMD5\b/i.test(output)) encryptionAlgorithms.push("MD5");

  const encryptionLibraries: string[] = [];
  if (/spring\.security\.crypto/i.test(output)) encryptionLibraries.push("Spring Security Crypto");
  if (/hutool.*crypto|cn\.hutool\.crypto/i.test(output)) encryptionLibraries.push("Hutool Crypto");

  let authFramework = "unknown";
  if (/SaToken|sa-token/i.test(output)) authFramework = "Sa-Token";
  else if (/SpringSecurity|spring-security/i.test(output)) authFramework = "Spring Security";

  const authAnnotations: string[] = [];
  if (/@SaCheckPermission/i.test(output)) authAnnotations.push("@SaCheckPermission");
  if (/@SaCheckLogin/i.test(output)) authAnnotations.push("@SaCheckLogin");
  if (/@SaCheckRole/i.test(output)) authAnnotations.push("@SaCheckRole");
  if (/@PreAuthorize/i.test(output)) authAnnotations.push("@PreAuthorize");

  // Sa-Token 编程式 API
  const authProgrammaticAPIs: string[] = [];
  if (/StpUtil\.checkPermission/i.test(output)) authProgrammaticAPIs.push("StpUtil.checkPermission()");
  if (/StpUtil\.checkRole/i.test(output)) authProgrammaticAPIs.push("StpUtil.checkRole()");
  if (/StpUtil\.checkLogin/i.test(output)) authProgrammaticAPIs.push("StpUtil.checkLogin()");
  if (/SaRouter\.match/i.test(output)) authProgrammaticAPIs.push("SaRouter.match()");
  if (/checkPermissionOr/i.test(output)) authProgrammaticAPIs.push("checkPermissionOr()");

  // 双账户体系检测
  const hasMultiAccount = /StpMemberUtil|StpAdminUtil|member.*login.*type/i.test(output);

  const sensitiveFields: string[] = [];
  if (/password/i.test(output)) sensitiveFields.push("password");
  if (/token/i.test(output)) sensitiveFields.push("token");
  if (/secretKey|secret_key/i.test(output)) sensitiveFields.push("secretKey");

  return {
    encryptionAlgorithms: [...new Set(encryptionAlgorithms)],
    encryptionLibraries: [...new Set(encryptionLibraries)],
    authFramework,
    authAnnotations: [...new Set(authAnnotations)],
    authProgrammaticAPIs: [...new Set(authProgrammaticAPIs)],
    sensitiveFields: [...new Set(sensitiveFields)],
    hasMultiAccount,
  };
}

async function analyzeServiceDetail(
  modulePath: string,
  moduleName: string
): Promise<ServiceAnalysis> {
  const classes = await scanJavaFiles(modulePath);

  // 提取 Controller 类
  const controllerClasses = classes.filter((c) => c.endsWith("Controller"));

  const controllers: ControllerInfo[] = [];
  for (const className of controllerClasses) {
    controllers.push({
      className,
      requestMapping: "",
      methods: [],
    });
  }

  // 提取 Service 接口和实现
  const serviceClasses = classes.filter((c) => c.endsWith("Service") && !c.endsWith("ServiceImpl"));
  const serviceImplClasses = classes.filter((c) => c.endsWith("ServiceImpl"));

  const services: ServiceInfo[] = [];
  for (const svc of serviceClasses) {
    services.push({
      interfaceName: svc,
      implName: svc + "Impl",
      methods: [],
    });
  }

  // 提取 @FeignClient 注解
  const feignClients: FeignClientInfo[] = [];
  const pattern = `${modulePath}/**/src/**/*.java`;
  const files = Array.from(new Bun.Glob(pattern).scanSync());
  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8");
      const feignMatch = content.match(
        /@FeignClient\s*\(\s*(?:name|value)\s*=\s*"([^"]+)"(?:\s*,\s*(?:url|path)\s*=\s*"([^"]*)")?/s
      );
      if (feignMatch) {
        const interfaceMatch = content.match(
          /public\s+interface\s+(\w+)/
        );
        feignClients.push({
          className: interfaceMatch?.[1] ?? "unknown",
          targetService: feignMatch[1]!,
          targetUrl: feignMatch[2] || undefined,
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  // 提取包结构
  const packageTree: string[] = [];
  const packageSet = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    const srcIdx = parts.indexOf("src");
    if (srcIdx >= 0) {
      const javaIdx = parts.indexOf("java", srcIdx);
      if (javaIdx >= 0) {
        const pkgParts = parts.slice(javaIdx + 1, -1);
        if (pkgParts.length > 0) {
          packageSet.add(pkgParts.join("."));
        }
      }
    }
  }
  packageTree.push(...packageSet);

  // 使用 codegraph 提取调用路径
  const callPaths: CallPath[] = [];
  if (controllerClasses.length > 0) {
    const ctrlQuery = controllerClasses.slice(0, 3).join(" ");
    const output = explore(modulePath, ctrlQuery);

    // 解析 calls 关系
    const callRe = /^(\w+)\s+→\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(output)) !== null) {
      if (m[1] !== m[2]) {
        callPaths.push({
          from: m[1]!,
          to: m[2]!,
          type: "local",
        });
      }
    }
  }

  return { moduleName, controllers, services, callPaths, feignClients, packageTree };
}

export async function analyzeProject(
  projectInfo: ProjectInfo
): Promise<AnalysisResult> {
  const { rootPath } = projectInfo;

  // 3.2: 一次性索引（每个唯一路径）
  const uniquePaths = [...new Set(projectInfo.modules.map(m => m.path))];
  for (const p of uniquePaths) {
    await initCodeGraph(p);
  }

  console.log(t.scanning);

  // 全局扫描所有类（按模块路径分别扫描）
  let allClasses: string[] = [];
  for (const mod of projectInfo.modules) {
    const classes = await scanJavaFiles(mod.path);
    allClasses = allClasses.concat(classes);
  }

  const controllers = allClasses.filter((c) => c.endsWith("Controller"));
  const services = allClasses.filter((c) => c.endsWith("Service") && !c.endsWith("ServiceImpl"));
  const serviceImpls = allClasses.filter((c) => c.endsWith("ServiceImpl"));
  const dtos = allClasses.filter(
    (c) =>
      DTO_SUFFIXES.some((s) => c.endsWith(s))
  );

  console.log(t.foundClasses(controllers.length, services.length, dtos.length));

  const naming = analyzeNamingPatterns(controllers, services, serviceImpls, dtos, allClasses);
  const packageStructure = analyzePackages();
  const annotationUsage = analyzeAnnotations();
  const securityInfo = analyzeSecurity(projectInfo.modules[0]?.path ?? rootPath);

  const globalPatterns: GlobalPatterns = {
    namingPatterns: naming.patterns,
    packageStructure,
    annotationUsage,
    dtoSuffixes: naming.dtoSuffixes,
    entitySuffixes: naming.entitySuffixes,
    businessPrefixes: naming.businessPrefixes,
  };

  // 3.6-3.7: 按服务分析
  const serviceAnalyses: Record<string, ServiceAnalysis> = {};
  for (const svc of projectInfo.serviceModules) {
    console.log(t.analyzingService(svc.artifactId));
    serviceAnalyses[svc.artifactId] = await analyzeServiceDetail(svc.path, svc.artifactId);
  }

  return { projectInfo, globalPatterns, securityInfo, serviceAnalyses };
}