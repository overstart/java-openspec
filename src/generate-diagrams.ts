import { t } from "./i18n";
import type { AnalysisResult, DiagramFile, MavenModule } from "./types";

// 生成 C4 System Context 图 (flowchart)
function generateContextDiagram(result: AnalysisResult): string {
  const { projectInfo, securityInfo } = result;
  const serviceNames = projectInfo.serviceModules.map((m) => m.artifactId);

  const hasGateway = serviceNames.some((s) => s.toLowerCase().includes("gateway"));
  const hasAuth = serviceNames.some((s) => s.toLowerCase().includes("auth"));
  const hasSearch = serviceNames.some((s) => s.toLowerCase().includes("search"));
  const hasMonitor = serviceNames.some((s) => s.toLowerCase().includes("monitor"));

  const lines = [
    "flowchart TB",
    "    subgraph External[\"External Users\"]",
    "        Admin[\"👤 Admin<br/>管理员\"]",
    "        Mobile[\"👤 Mobile User<br/>移动端用户\"]",
    "    end",
    "",
    `    subgraph System[\"${projectInfo.artifactId}<br/>微服务系统\"]`,
  ];

  for (const svc of serviceNames) {
    lines.push(`        ${svc.replace(/-/g, "_")}[\"${svc}\"]`);
  }

  lines.push("    end");
  lines.push("");

  lines.push("    subgraph ExternalSystems[\"External Systems\"]");
  lines.push("        MySQL[\"MySQL<br/>数据库\"]");
  lines.push("        Redis[\"Redis<br/>缓存\"]");
  if (hasSearch) lines.push("        ES[\"Elasticsearch<br/>搜索引擎\"]");
  lines.push("        RabbitMQ[\"RabbitMQ<br/>消息队列\"]");
  lines.push("        OSS[\"OSS/MinIO<br/>对象存储\"]");
  lines.push("    end");
  lines.push("");

  if (hasGateway) {
    const gwKey = serviceNames.find((s) => s.toLowerCase().includes("gateway"))!.replace(/-/g, "_");
    lines.push("    Admin --> " + gwKey);
    lines.push("    Mobile --> " + gwKey);
    const crudServices = serviceNames.filter((s) =>
      !s.toLowerCase().includes("gateway") && !s.toLowerCase().includes("monitor") &&
      !s.toLowerCase().includes("common") && !s.toLowerCase().includes("demo") && !s.toLowerCase().includes("mbg"));
    for (const svc of crudServices) {
      lines.push(`    ${gwKey} --> ${svc.replace(/-/g, "_")}`);
    }
    lines.push("");
  } else {
    lines.push("    Admin --> Client");
    lines.push("    Mobile --> Client");
    lines.push("");
  }

  const crudServices = serviceNames.filter((s) =>
    !s.toLowerCase().includes("gateway") && !s.toLowerCase().includes("monitor") &&
    !s.toLowerCase().includes("common") && !s.toLowerCase().includes("demo") && !s.toLowerCase().includes("mbg"));

  for (const svc of crudServices) {
    const key = svc.replace(/-/g, "_");
    lines.push(`    ${key} --> MySQL`);
    lines.push(`    ${key} --> Redis`);
  }

  if (hasSearch) {
    const searchKey = serviceNames.find((s) => s.toLowerCase().includes("search"))!.replace(/-/g, "_");
    lines.push(`    ${searchKey} --> ES`);
  }

  return lines.join("\n");
}

// 识别服务角色
function detectServiceRole(svc: MavenModule): "gateway" | "monitor" | "auth" | "search" | "crud" {
  const name = svc.artifactId.toLowerCase();
  if (name.includes("gateway")) return "gateway";
  if (name.includes("monitor")) return "monitor";
  if (name.includes("auth")) return "auth";
  if (name.includes("search")) return "search";
  return "crud";
}

// 生成 C4 Container 图 per service (role-aware, dynamic)
function generateContainerDiagram(svc: MavenModule, result: AnalysisResult): string {
  const key = svc.artifactId.replace(/-/g, "_");
  const role = detectServiceRole(svc);
  const analysis = result.serviceAnalyses[svc.artifactId];
  const controllerCount = analysis?.controllers.length ?? 0;

  const lines: string[] = [];

  switch (role) {
    case "gateway":
      lines.push(
        `flowchart TB`,
        `    subgraph ${key}[\"${svc.artifactId}<br/>API 网关\"]`,
        `        ${key}_routes[\"路由规则<br/>Routes\"]`,
        `        ${key}_filters[\"过滤器<br/>Filters\"]`,
        `        ${key}_auth[\"鉴权<br/>Sa-Token\"]`,
        "    end",
        "",
        `    ${key}_routes --> ${key}_filters`,
        `    ${key}_filters --> ${key}_auth`,
      );
      break;

    case "monitor":
      lines.push(
        `flowchart TB`,
        `    subgraph ${key}[\"${svc.artifactId}<br/>监控中心\"]`,
        `        ${key}_server[\"Spring Boot Admin<br/>Server\"]`,
        "    end",
      );
      break;

    case "auth":
      lines.push(
        `flowchart TB`,
        `    subgraph ${key}[\"${svc.artifactId}<br/>认证授权服务\"]`,
        `        ${key}_web[\"Web API<br/>${controllerCount} Controllers\"]`,
        `        ${key}_svc[\"认证逻辑<br/>Auth Service\"]`,
        `        ${key}_token[\"Token 管理<br/>Sa-Token\"]`,
        "    end",
        "",
        `    subgraph Data[\"依赖\"]`,
        `        Redis_${key}[\"Redis<br/>Token 缓存\"]`,
        "    end",
        "",
        `    ${key}_web --> ${key}_svc`,
        `    ${key}_svc --> ${key}_token`,
        `    ${key}_token --> Redis_${key}`,
      );
      break;

    case "search":
      lines.push(
        `flowchart TB`,
        `    subgraph ${key}[\"${svc.artifactId}<br/>搜索服务\"]`,
        `        ${key}_web[\"Web API<br/>${controllerCount} Controllers\"]`,
        `        ${key}_svc[\"搜索逻辑<br/>Search Service\"]`,
        `        ${key}_dao[\"数据访问<br/>Repository\"]`,
        "    end",
        "",
        `    subgraph Data[\"数据存储\"]`,
        `        ES_${key}[\"Elasticsearch<br/>搜索引擎\"]`,
        "    end",
        "",
        `    ${key}_web --> ${key}_svc`,
        `    ${key}_svc --> ${key}_dao`,
        `    ${key}_dao --> ES_${key}`,
      );
      break;

    default:
      lines.push(
        `flowchart TB`,
        `    subgraph ${key}[\"${svc.artifactId}<br/>微服务\"]`,
        `        ${key}_web[\"Web API<br/>${controllerCount} Controllers\"]`,
        `        ${key}_svc[\"Service Layer<br/>${analysis?.services.length ?? 0} Services\"]`,
        `        ${key}_dao[\"Data Access<br/>DAO/Mapper\"]`,
        "    end",
        "",
        "    subgraph Data[\"Data Stores\"]",
        `        MySQL_${key}[\"MySQL\"]`,
        `        Redis_${key}[\"Redis\"]`,
        "    end",
        "",
        `    ${key}_web --> ${key}_svc`,
        `    ${key}_svc --> ${key}_dao`,
        `    ${key}_dao --> MySQL_${key}`,
        `    ${key}_svc --> Redis_${key}`,
      );
  }

  return lines.join("\n");
}

// 生成时序图（动态基于服务名）
function generateSequenceDiagram(
  svc: MavenModule,
  result: AnalysisResult
): string {
  const key = svc.artifactId.replace(/-/g, "_");
  const analysis = result.serviceAnalyses[svc.artifactId];
  const callPaths = analysis?.callPaths ?? [];

  const lines = [
    `sequenceDiagram`,
    `    participant Client as Client`,
    `    participant Ctrl as ${svc.artifactId} Controller`,
    `    participant Svc as ${svc.artifactId} Service`,
    `    participant Dao as ${svc.artifactId} DAO`,
    `    participant DB as MySQL`,
    "",
  ];

  if (callPaths.length > 0) {
    lines.push("    Client->>Ctrl: HTTP Request");
    lines.push("    Ctrl->>Svc: call service method");
    lines.push("    Svc->>Dao: data access");
    lines.push("    Dao->>DB: SQL query");
    lines.push("    DB-->>Dao: result");
    lines.push("    Dao-->>Svc: entity");
    lines.push("    Svc-->>Ctrl: result");
    lines.push("    Ctrl-->>Client: HTTP Response");
  } else {
    lines.push("    Note over Client,DB: Standard Spring MVC flow");
    lines.push("    Client->>Ctrl: HTTP Request");
    lines.push("    Ctrl->>Svc: business logic");
    lines.push("    Svc->>Dao: data access");
    lines.push("    Dao->>DB: query");
    lines.push("    DB-->>Dao: data");
    lines.push("    Dao-->>Svc: entity");
    lines.push("    Svc-->>Ctrl: result");
    lines.push("    Ctrl-->>Client: HTTP Response");
  }

  return lines.join("\n");
}

// 生成数据流图（动态从分析结果构建）
function generateDataFlowDiagram(result: AnalysisResult): string {
  const { serviceAnalyses, projectInfo } = result;
  const lines = ["flowchart LR"];

  const feignCalls: Array<{ from: string; to: string }> = [];
  for (const [svcName, analysis] of Object.entries(serviceAnalyses)) {
    for (const fc of analysis?.feignClients ?? []) {
      feignCalls.push({ from: svcName, to: fc.targetService });
    }
  }

  lines.push("    Client --> Controller");
  lines.push("    Controller --> Service");
  lines.push("    Service --> DAO");
  lines.push("    DAO --> DB[(MySQL)]");
  lines.push("    Service --> Redis[(Redis)]");

  for (const call of feignCalls) {
    const fromKey = call.from.replace(/-/g, "_");
    const toKey = call.to.replace(/-/g, "_");
    lines.push(`    ${fromKey}[${call.from}] -.->|Feign| ${toKey}[${call.to}]`);
  }

  return lines.join("\n");
}

export function generateDiagrams(result: AnalysisResult): DiagramFile[] {
  const diagrams: DiagramFile[] = [];

  // 4.2: C4 System Context
  console.log(t.generatingContext);
  diagrams.push({
    filename: "context.mmd",
    content: generateContextDiagram(result),
    type: "flowchart",
  });

  // 4.3: Data flow diagram
  console.log(t.lblGeneratingDataFlow);
  diagrams.push({
    filename: "data-flow.mmd",
    content: generateDataFlowDiagram(result),
    type: "flowchart",
  });

  // 4.4: C4 Container per service
  for (const svc of result.projectInfo.serviceModules) {
    if (!svc.isService) continue;
    diagrams.push({
      filename: `${svc.artifactId}-container.mmd`,
      content: generateContainerDiagram(svc, result),
      type: "flowchart",
    });
  }

  // 4.5: Sequence diagrams
  for (const svc of result.projectInfo.serviceModules) {
    if (!svc.isService) continue;
    diagrams.push({
      filename: `${svc.artifactId}-flow.mmd`,
      content: generateSequenceDiagram(svc, result),
      type: "sequence",
    });
  }

  console.log(t.generatedDiagrams(diagrams.length));
  return diagrams;
}