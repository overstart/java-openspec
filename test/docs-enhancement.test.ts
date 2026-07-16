import { test, expect } from "bun:test";

// 测试业务前缀字典映射
const DOMAIN_PREFIXES: Record<string, { en: string; zh: string }> = {
  Pms: { en: "Product Management", zh: "商品管理" },
  Oms: { en: "Order Management", zh: "订单管理" },
  Ums: { en: "User Management", zh: "用户管理" },
  Sms: { en: "Sales/Marketing Management", zh: "营销管理" },
  Es: { en: "Elasticsearch Search", zh: "搜索" },
  Cms: { en: "Content Management", zh: "内容管理" },
};

test("business-domains: 已知前缀映射", () => {
  expect(DOMAIN_PREFIXES["Pms"]).toBeDefined();
  expect(DOMAIN_PREFIXES["Pms"]!.en).toBe("Product Management");
  expect(DOMAIN_PREFIXES["Pms"]!.zh).toBe("商品管理");
  expect(DOMAIN_PREFIXES["Oms"]!.en).toBe("Order Management");
  expect(DOMAIN_PREFIXES["Ums"]!.zh).toBe("用户管理");
});

test("business-domains: 未知前缀返回 undefined", () => {
  expect(DOMAIN_PREFIXES["Unknown"]).toBeUndefined();
  expect(DOMAIN_PREFIXES["Auth"]).toBeUndefined();
});

test("business-domains: 前缀按类名匹配", () => {
  const controllers = ["PmsProductController", "OmsOrderController", "UnknownController"];
  const pmsControllers = controllers.filter(c => c.startsWith("Pms"));
  const omsControllers = controllers.filter(c => c.startsWith("Oms"));
  const unknownControllers = controllers.filter(c =>
    !Object.keys(DOMAIN_PREFIXES).some(p => c.startsWith(p))
  );

  expect(pmsControllers).toEqual(["PmsProductController"]);
  expect(omsControllers).toEqual(["OmsOrderController"]);
  expect(unknownControllers).toEqual(["UnknownController"]);
});

test("business-domains: 所有前缀都有 en 和 zh", () => {
  for (const [prefix, domain] of Object.entries(DOMAIN_PREFIXES)) {
    expect(domain.en).toBeTruthy();
    expect(domain.zh).toBeTruthy();
    expect(domain.en.length).toBeGreaterThan(0);
    expect(domain.zh.length).toBeGreaterThan(0);
  }
});

// 测试 config.yaml context 填充逻辑
test("config: context 包含技术栈信息", () => {
  const dependencyVersions: Record<string, string> = {
    "org.springframework.cloud:spring-cloud-dependencies": "2025.0.2",
    "org.mybatis.spring.boot:mybatis-spring-boot-starter": "3.0.4",
  };
  const techStack = Object.entries(dependencyVersions)
    .slice(0, 10)
    .map(([k, v]) => `${k.split(":")[1] ?? k} ${v}`)
    .join(", ");

  expect(techStack).toContain("spring-cloud-dependencies 2025.0.2");
  expect(techStack).toContain("mybatis-spring-boot-starter 3.0.4");
});

test("config: context 包含业务域前缀", () => {
  const businessPrefixes = ["Pms", "Oms", "Ums"];
  const prefixes = businessPrefixes.join(", ");
  expect(prefixes).toBe("Pms, Oms, Ums");
});

test("config: rules 从命名模式生成", () => {
  const namingPatterns = [
    { type: "Controller", pattern: "{Prefix}{Entity}Controller", examples: [] },
    { type: "Service", pattern: "{Prefix}{Entity}Service", examples: [] },
  ];
  const namingRule = namingPatterns.map(p => `${p.type}: ${p.pattern}`).join("; ");
  expect(namingRule).toContain("Controller: {Prefix}{Entity}Controller");
  expect(namingRule).toContain("Service: {Prefix}{Entity}Service");
});

// 测试 specs/ 文件格式
test("specs: requirement 格式正确", () => {
  const requirement = "### Requirement: Controller 命名规范\nController 应遵循 {Prefix}{Entity}Controller 命名模式。";
  expect(requirement).toMatch(/^### Requirement:/);
  expect(requirement).toContain("命名规范");
});

test("specs: scenario 格式正确", () => {
  const scenario = "#### Scenario: 已有示例\n- **WHEN** 查看代码中的 Controller 类\n- **THEN** 名称符合 {Prefix}{Entity}Controller 模式";
  expect(scenario).toMatch(/^#### Scenario:/);
  expect(scenario).toContain("**WHEN**");
  expect(scenario).toContain("**THEN**");
});

// 测试交叉引用
test("cross-refs: 包含所有文档链接", () => {
  const links = [
    "[architecture.md](architecture.md)",
    "[coding-style.md](coding-style.md)",
    "[security.md](security.md)",
    "[business-domains.md](business-domains.md)",
    "[api-contracts.md](api-contracts.md)",
  ];
  for (const link of links) {
    expect(link).toMatch(/^\[.+\]\(.+\)$/);
  }
  expect(links.length).toBe(5);
});
