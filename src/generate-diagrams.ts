import { t } from "./i18n";
import type { AnalysisResult, DiagramFile, MavenModule } from "./types";

// 生成 C4 System Context 图 (flowchart)
function generateContextDiagram(result: AnalysisResult): string {
  const { projectInfo, securityInfo } = result;
  const serviceNames = projectInfo.serviceModules.map((m) => m.artifactId);

  const lines = [
    "flowchart TB",
    "    subgraph External[\"External Users\"]",
    "        Admin[\"👤 Admin<br/>管理员\"]",
    "        Mobile[\"👤 Mobile User<br/>移动端用户\"]",
    "    end",
    "",
    `    subgraph System[\"${projectInfo.artifactId}<br/>微服务商城系统\"]`,
  ];

  for (const svc of serviceNames) {
    lines.push(`        ${svc.replace(/-/g, "_")}[\"${svc}\"]`);
  }

  lines.push("    end");
  lines.push("");

  // 外部系统
  lines.push("    subgraph ExternalSystems[\"External Systems\"]");
  lines.push("        Nacos[\"Nacos<br/>注册/配置中心\"]");
  lines.push("        MySQL[\"MySQL<br/>数据库\"]");
  lines.push("        Redis[\"Redis<br/>缓存\"]");
  lines.push("        ES[\"Elasticsearch<br/>搜索引擎\"]");
  lines.push("        RabbitMQ[\"RabbitMQ<br/>消息队列\"]");
  lines.push("        OSS[\"OSS/MinIO<br/>对象存储\"]");
  lines.push("    end");
  lines.push("");

  // 关系
  lines.push("    Admin --> mall_gateway");
  lines.push("    Mobile --> mall_gateway");
  lines.push("    mall_gateway --> mall_auth");
  lines.push("    mall_gateway --> mall_admin");
  lines.push("    mall_gateway --> mall_portal");
  lines.push("    mall_gateway --> mall_search");
  lines.push("");

  for (const svc of serviceNames) {
    const key = svc.replace(/-/g, "_");
    if (!svc.includes("gateway") && !svc.includes("monitor") && !svc.includes("common") && !svc.includes("demo") && !svc.includes("mbg")) {
      lines.push(`    ${key} --> MySQL`);
      lines.push(`    ${key} --> Redis`);
    }
  }

  lines.push("    mall_search --> ES");
  lines.push("    mall_admin --> RabbitMQ");
  lines.push("    mall_admin --> OSS");

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

// 生成 C4 Container 图 per service (role-aware)
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
        "",
        `    subgraph Targets[\"监控目标\"]`,
        `        target1[\"mall-admin\"]`,
        `        target2[\"mall-portal\"]`,
        `        target3[\"mall-search\"]`,
        "    end",
        "",
        `    ${key}_server --> target1`,
        `    ${key}_server --> target2`,
        `    ${key}_server --> target3`,
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

// 生成时序图
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

// 生成数据流图
function generateDataFlowDiagram(result: AnalysisResult): string {
  const { serviceAnalyses } = result;
  const lines = ["flowchart LR"];

  // 收集所有 Feign 客户端
  const feignCalls: Array<{ from: string; to: string }> = [];
  for (const [svcName, analysis] of Object.entries(serviceAnalyses)) {
    for (const fc of analysis?.feignClients ?? []) {
      feignCalls.push({ from: svcName, to: fc.targetService });
    }
  }

  // 标准数据流
  lines.push("    Client --> Controller");
  lines.push("    Controller --> Service");
  lines.push("    Service --> DAO");
  lines.push("    DAO --> DB[(MySQL)]");
  lines.push("    Service --> Redis[(Redis)]");

  // Feign 跨服务调用
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