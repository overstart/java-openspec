// 项目检测结果
export interface MavenModule {
  artifactId: string;
  path: string;
  isService: boolean;
  dependencies: string[];
  dependencyVersions: Record<string, string>; // groupId:artifactId → version
  springBootVersion?: string;
  springCloudVersion?: string;
}

export interface ProjectInfo {
  rootPath: string;
  groupId: string;
  artifactId: string;
  modules: MavenModule[];
  serviceModules: MavenModule[];
  libraryModules: MavenModule[];
  dependencyGraph: Record<string, string[]>;
}

// 代码分析结果
export interface NamingPattern {
  type: string;
  pattern: string;
  examples: string[];
}

export interface AnnotationUsage {
  layer: string;
  annotations: string[];
  count: number;
}

export interface GlobalPatterns {
  namingPatterns: NamingPattern[];
  packageStructure: string[];
  annotationUsage: AnnotationUsage[];
  dtoSuffixes: string[];
  entitySuffixes: string[];
  businessPrefixes: string[];
}

export interface ControllerInfo {
  className: string;
  requestMapping: string;
  methods: MethodInfo[];
}

export interface MethodInfo {
  name: string;
  httpMethod: string;
  path: string;
  returnType: string;
}

export interface ServiceInfo {
  interfaceName: string;
  implName: string;
  methods: string[];
}

export interface CallPath {
  from: string;
  to: string;
  type: "local" | "feign" | "gateway";
}

export interface SecurityInfo {
  encryptionAlgorithms: string[];
  encryptionLibraries: string[];
  authFramework: string;
  authAnnotations: string[];
  authProgrammaticAPIs: string[];
  sensitiveFields: string[];
  hasMultiAccount: boolean;
}

export interface ServiceAnalysis {
  moduleName: string;
  controllers: ControllerInfo[];
  services: ServiceInfo[];
  callPaths: CallPath[];
  feignClients: FeignClientInfo[];
  packageTree: string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// LLM Provider 抽象接口
export interface LLMProvider {
  generate(systemPrompt: string, userContent: string): Promise<{
    content: string;
    usage: TokenUsage;
  }>;
  close?(): Promise<void>;
}

export interface FeignClientInfo {
  className: string;
  targetService: string;
  targetUrl?: string;
  path?: string;
}

export interface AnalysisResult {
  projectInfo: ProjectInfo;
  globalPatterns: GlobalPatterns;
  securityInfo: SecurityInfo;
  serviceAnalyses: Record<string, ServiceAnalysis>;
}

// Spec 文档
export interface SpecDoc {
  filename: string;
  content: string;
  path: string; // relative path within store
}

// 图表
export interface DiagramFile {
  filename: string;
  content: string;
  type: "flowchart" | "sequence";
}