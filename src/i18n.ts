import { homedir } from "node:os";

// 语言检测: LANG / LC_ALL / LANGUAGE 环境变量，zh 开头则中文
const rawLang =
  process.env.LANG ??
  process.env.LC_ALL ??
  process.env.LANGUAGE ??
  "en";
const isZh = rawLang.toLowerCase().startsWith("zh");
export const lang = isZh ? "zh" : "en";

export interface Messages {
  // index.ts - CLI 帮助
  cliDescription: string;
  initDescription: string;
  initArg: string;
  initForce: string;
  initConfig: string;
  initOutput: string;

  // pipeline.ts
  version: (v: string) => string;
  target: (p: string) => string;
  store: (p: string) => string;
  config: (p: string) => string;
  loadedConfig: (n: number) => string;
  detecting: string;
  foundModules: (s: number, l: number) => string;
  analyzing: string;
  generatingDiagrams: string;
  generatingDocs: string;
  creatingStore: string;
  done: string;
  completed: (s: string) => string;
  errorPrefix: string;
  failed: string;

  // env.ts
  explicitNotFound: (p: string) => string;
  autoCreated: (p: string) => string;

  // providers/index.ts
  notConfigured: string;

  // providers/acp-provider.ts
  acpStarting: (cmd: string) => string;
  acpConnected: (v: string) => string;

  // pricing.ts
  tokenTitle: string;
  tokenModel: string;
  tokenInput: string;
  tokenOutput: string;
  tokenTotal: string;
  tokenCost: string;
  tokenNa: string;

  // create-store.ts
  storeCreating: (p: string) => string;
  storeWritingSpecs: string;
  storeWritingDiagrams: string;
  storeRegistering: string;
  storeValidating: string;
  reportTitle: string;
  reportServiceModules: (n: number) => string;
  reportLibraryModules: (n: number) => string;
  reportSpecDocs: (n: number) => string;
  reportDiagramFiles: (n: number) => string;
  reportGlobalSpecs: string;
  reportServiceSpecs: string;
  reportMicroService: string;
  reportLibrary: string;

  // analyze.ts
  initCodeGraph: string;
  codeGraphReady: string;
  scanning: string;
  foundClasses: (c: number, s: number, d: number) => string;
  analyzingService: (name: string) => string;

  // generate-docs.ts
  generatingDoc: (name: string) => string;
  validationWarning: (name: string) => string;
  generatingArch: (name: string) => string;
  generatedDocs: (n: number) => string;

  // generate-diagrams.ts
  generatingContext: string;
  generatedDiagrams: (n: number) => string;

  // no-LLM mode
  noLlmHeader: string;
  noLlmNotice: string;

  // analysis data labels
  lblProjectInfo: string;
  lblTechStack: string;
  lblNamingPatterns: string;
  lblModuleDeps: string;
  lblSecurityInfo: string;
  lblServiceAnalysis: string;
  lblGroupId: string;
  lblArtifactId: string;
  lblServiceModules: string;
  lblLibraryModules: string;
  lblController: string;
  lblServiceLabel: string;
  lblBusinessPrefix: string;
  lblDtoSuffix: string;
  lblEntitySuffix: string;
  lblPackageStructure: string;
  lblEncryptionAlgo: string;
  lblEncryptionLib: string;
  lblAuthFramework: string;
  lblAuthAnnotation: string;
  lblAuthProgrammatic: string;
  lblMultiAccount: string;
  lblSensitiveFields: string;
  // service context labels
  lblService: string;
  lblPath: string;
  lblControllers: string;
  lblControllerList: string;
  lblServices: string;
  lblFeignClients: string;
  lblPackageTree: string;
  lblDependencies: string;
  lblDiagrams: string;
  // validation warnings
  lblMissingSection: string;
  lblMissingTable: string;
  lblNotDetected: string;
}

const en: Messages = {
  cliDescription: "Auto-generate OpenSpec stores from Java Spring Cloud projects",
  initDescription: "Analyze Java project and generate OpenSpec store (spec docs + architecture diagrams)",
  initArg: "Target project path (optional with --config, defaults to current directory)",
  initForce: "Overwrite existing store",
  initConfig:
    "Use multi-path config file (YAML) for microservices in separate directories.\n" +
    "    Config format:\n" +
    "      name: mall-specs           # optional, store name\n" +
    "      exclude:                   # optional, modules to skip\n" +
    "        - mall-demo\n" +
    "      services:\n" +
    "        mall-admin: /path/to/mall-admin\n" +
    "    Paths can be absolute or relative to the config file.\n" +
    "    Without --config, auto-detects Maven multi-module project.",
  initOutput: "Output directory for the store (default: parent of project-path)",

  version: (v) => `java-openspec v${v}`,
  target: (p) => `Target: ${p}`,
  store: (p) => `Store:  ${p}`,
  config: (p) => `Config: ${p}`,
  loadedConfig: (n) => `[1/6] Loaded config: ${n} services`,
  detecting: "[1/6] Detecting project structure...",
  foundModules: (s, l) => `  Found ${s} services, ${l} libraries`,
  analyzing: "[2/6] Analyzing code...",
  generatingDiagrams: "[3/6] Generating diagrams...",
  generatingDocs: "[4/6] Generating spec documents (this may take a while)...",
  creatingStore: "[5/6] Creating OpenSpec store...",
  done: "[6/6] Done!",
  completed: (s) => `Completed in ${s}s`,
  errorPrefix: "Error:",
  failed: "Pipeline failed. Check the error above for details.",

  explicitNotFound: (p) => `  \u26a0 JAVA_OPENSPEC_ENV=${p} not found, falling back`,
  autoCreated: (p) => `Created ${p}. Please edit and re-run.`,

  notConfigured:
    "No LLM provider configured. Set OPENAI_API_KEY for OpenAI mode, or ACP_AGENT_CMD for ACP mode (e.g. ACP_AGENT_CMD=opencode acp).",

  acpStarting: (cmd) => `[ACP] Starting agent: ${cmd}`,
  acpConnected: (v) => `[ACP] Connected to agent (protocol v${v})`,

  tokenTitle: "Token Usage",
  tokenModel: "Model",
  tokenInput: "Input",
  tokenOutput: "Output",
  tokenTotal: "Total",
  tokenCost: "Est.Cost",
  tokenNa: "N/A (ACP mode)",

  storeCreating: (p) => `  Creating store at ${p}...`,
  storeWritingSpecs: "  Writing spec files...",
  storeWritingDiagrams: "  Writing diagram files...",
  storeRegistering: "  Registering store...",
  storeValidating: "  Validating store...",
  reportTitle: "java-openspec - Generation Complete",
  reportServiceModules: (n) => `Service modules: ${n}`,
  reportLibraryModules: (n) => `Library modules: ${n}`,
  reportSpecDocs: (n) => `Spec documents: ${n}`,
  reportDiagramFiles: (n) => `Diagram files: ${n}`,
  reportGlobalSpecs: "Global Specs:",
  reportServiceSpecs: "Per-Service Specs:",
  reportMicroService: "Service",
  reportLibrary: "Library",

  initCodeGraph: "  Initializing CodeGraph index...",
  codeGraphReady: "  CodeGraph index ready.",
  scanning: "  Scanning Java files...",
  foundClasses: (c, s, d) => `  Found ${c} Controllers, ${s} Services, ${d} DTOs`,
  analyzingService: (name) => `  Analyzing ${name}...`,

  generatingDoc: (name) => `  Generating ${name}.md...`,
  validationWarning: (name) => `  \u26a0 ${name}.md validation warnings:`,
  generatingArch: (name) => `  Generating ${name}/architecture.md...`,
  generatedDocs: (n) => `  Generated ${n} spec documents`,

  generatingContext: "  Generating C4 System Context diagram...",
  generatedDiagrams: (n) => `  Generated ${n} diagrams`,

  noLlmHeader: "<!-- Generated without LLM, contains CodeGraph analysis data only -->",
  noLlmNotice: "\n  \u26a0 Specs generated without LLM. Documents contain CodeGraph analysis data only.\n  Configure OPENAI_API_KEY or ACP_AGENT_CMD to regenerate with LLM.\n",

  lblProjectInfo: "## Project Info",
  lblTechStack: "### Tech Stack",
  lblNamingPatterns: "## Naming Patterns",
  lblModuleDeps: "## Module Dependencies",
  lblSecurityInfo: "## Security Info",
  lblServiceAnalysis: "## Service Analysis",
  lblGroupId: "- GroupId",
  lblArtifactId: "- ArtifactId",
  lblServiceModules: "- Service modules",
  lblLibraryModules: "- Library modules",
  lblController: "- Controller",
  lblServiceLabel: "- Service",
  lblBusinessPrefix: "- Business prefixes",
  lblDtoSuffix: "- DTO suffixes",
  lblEntitySuffix: "- Entity suffixes",
  lblPackageStructure: "- Package structure",
  lblEncryptionAlgo: "- Encryption algorithms",
  lblEncryptionLib: "- Encryption libraries",
  lblAuthFramework: "- Auth framework",
  lblAuthAnnotation: "- Auth annotations",
  lblAuthProgrammatic: "- Programmatic auth APIs",
  lblMultiAccount: "- Multi-account system",
  lblSensitiveFields: "- Sensitive fields",
  lblService: "## Service:",
  lblPath: "- Path:",
  lblControllers: "- Controllers:",
  lblControllerList: "- Controller list:",
  lblServices: "- Services:",
  lblFeignClients: "- Feign clients:",
  lblPackageTree: "- Package structure:",
  lblDependencies: "- Dependencies:",
  lblDiagrams: "- Diagrams:",
  lblMissingSection: "Missing required section:",
  lblMissingTable: "Missing table, required:",
  lblNotDetected: "Not detected",
};

const zh: Messages = {
  cliDescription: "从 Java Spring Cloud 项目自动生成 OpenSpec store",
  initDescription: "分析 Java 项目并生成 OpenSpec store (spec 文档 + 架构图)",
  initArg: "目标项目路径 (与 --config 配合时可省略，默认为当前目录)",
  initForce: "覆盖已存在的 store",
  initConfig:
    "使用多路径配置文件 (YAML)，适用于微服务分散在不同目录的场景。\n" +
    "    配置文件格式:\n" +
    "      name: mall-specs           # 可选，store 名称\n" +
    "      exclude:                   # 可选，要跳过的模块\n" +
    "        - mall-demo\n" +
    "      services:\n" +
    "        mall-admin: /path/to/mall-admin\n" +
    "    路径可为绝对路径或相对配置文件的相对路径。\n" +
    "    不指定 --config 时自动检测 Maven 多模块项目。",
  initOutput: "store 输出目录 (默认: 项目路径的父目录)",

  version: (v) => `java-openspec v${v}`,
  target: (p) => `Target: ${p}`,
  store: (p) => `Store:  ${p}`,
  config: (p) => `Config: ${p}`,
  loadedConfig: (n) => `[1/6] Loaded config: ${n} services`,
  detecting: "[1/6] 检测项目结构...",
  foundModules: (s, l) => `  找到 ${s} 个微服务, ${l} 个公共库`,
  analyzing: "[2/6] 分析代码...",
  generatingDiagrams: "[3/6] 生成图表...",
  generatingDocs: "[4/6] 生成 spec 文档 (可能需要一些时间)...",
  creatingStore: "[5/6] 创建 OpenSpec store...",
  done: "[6/6] 完成!",
  completed: (s) => `完成耗时 ${s}s`,
  errorPrefix: "错误:",
  failed: "Pipeline 失败。请检查上方的错误信息。",

  explicitNotFound: (p) => `  ⚠ JAVA_OPENSPEC_ENV=${p} 未找到，回退到默认`,
  autoCreated: (p) => `已创建 ${p}，请编辑后重新运行。`,

  notConfigured:
    "未配置 LLM 后端。请设置 OPENAI_API_KEY (OpenAI 模式) 或 ACP_AGENT_CMD (ACP 模式，如 ACP_AGENT_CMD=opencode acp)。",

  acpStarting: (cmd) => `[ACP] 启动 agent: ${cmd}`,
  acpConnected: (v) => `[ACP] 已连接 agent (协议 v${v})`,

  tokenTitle: "Token 消费",
  tokenModel: "Model",
  tokenInput: "Input",
  tokenOutput: "Output",
  tokenTotal: "Total",
  tokenCost: "Est.Cost",
  tokenNa: "N/A (ACP mode)",

  storeCreating: (p) => `  创建 store 于 ${p}...`,
  storeWritingSpecs: "  写入 spec 文件...",
  storeWritingDiagrams: "  写入图表文件...",
  storeRegistering: "  注册 store...",
  storeValidating: "  校验 store...",
  reportTitle: "java-openspec - 生成完成",
  reportServiceModules: (n) => `微服务模块: ${n} 个`,
  reportLibraryModules: (n) => `公共库模块: ${n} 个`,
  reportSpecDocs: (n) => `Spec 文档: ${n} 个`,
  reportDiagramFiles: (n) => `图表文件: ${n} 个`,
  reportGlobalSpecs: "全局 Spec:",
  reportServiceSpecs: "按服务 Spec:",
  reportMicroService: "微服务",
  reportLibrary: "公共库",

  initCodeGraph: "  初始化 CodeGraph 索引...",
  codeGraphReady: "  CodeGraph 索引就绪。",
  scanning: "  扫描 Java 文件...",
  foundClasses: (c, s, d) => `  找到 ${c} 个 Controller, ${s} 个 Service, ${d} 个 DTO`,
  analyzingService: (name) => `  分析 ${name}...`,

  generatingDoc: (name) => `  生成 ${name}.md...`,
  validationWarning: (name) => `  ⚠ ${name}.md 校验警告:`,
  generatingArch: (name) => `  生成 ${name}/architecture.md...`,
  generatedDocs: (n) => `  生成 ${n} 个 spec 文档`,

  generatingContext: "  生成 C4 System Context 图表...",
  generatedDiagrams: (n) => `  生成 ${n} 个图表`,

  noLlmHeader: "<!-- 未经 LLM 生成，仅含 CodeGraph 分析数据 -->",
  noLlmNotice: "\n  ⚠ 本次生成未经 LLM 润色，spec 文档仅包含 CodeGraph 分析数据。\n  配置 OPENAI_API_KEY 或 ACP_AGENT_CMD 后可重新生成。\n",

  lblProjectInfo: "## 项目信息",
  lblTechStack: "### 技术栈",
  lblNamingPatterns: "## 命名模式",
  lblModuleDeps: "## 模块依赖",
  lblSecurityInfo: "## 安全信息",
  lblServiceAnalysis: "## 各服务分析",
  lblGroupId: "- GroupId",
  lblArtifactId: "- ArtifactId",
  lblServiceModules: "- 服务模块",
  lblLibraryModules: "- 公共库模块",
  lblController: "- Controller",
  lblServiceLabel: "- Service",
  lblBusinessPrefix: "- 业务前缀",
  lblDtoSuffix: "- DTO 后缀",
  lblEntitySuffix: "- 实体后缀",
  lblPackageStructure: "- 包结构",
  lblEncryptionAlgo: "- 加密算法",
  lblEncryptionLib: "- 加密库",
  lblAuthFramework: "- 认证框架",
  lblAuthAnnotation: "- 权限注解",
  lblAuthProgrammatic: "- 编程式权限API",
  lblMultiAccount: "- 双账户体系",
  lblSensitiveFields: "- 敏感字段",
  lblService: "## 服务:",
  lblPath: "- 路径:",
  lblControllers: "- Controllers:",
  lblControllerList: "- Controller列表:",
  lblServices: "- Services:",
  lblFeignClients: "- Feign客户端:",
  lblPackageTree: "- 包结构:",
  lblDependencies: "- 依赖:",
  lblDiagrams: "- 图表:",
  lblMissingSection: "缺少必填章节:",
  lblMissingTable: "缺少表格，需要",
  lblNotDetected: "未检测到",
};

export const t = isZh ? zh : en;
