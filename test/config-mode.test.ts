import { test, expect } from "bun:test";
import { load } from "js-yaml";

// 测试 YAML 配置文件解析（name, exclude, services 字段）
interface ConfigFile {
  services: Record<string, string>;
  name?: string;
  exclude?: string[];
}

function parseConfig(yamlContent: string): ConfigFile {
  return load(yamlContent) as ConfigFile;
}

test("config: 解析带 name 和 exclude 的 YAML", () => {
  const yaml = `
name: mall-specs
exclude:
  - mall-demo
  - mall-monitor
services:
  mall-admin: /path/to/mall-admin
  mall-portal: /path/to/mall-portal
  mall-demo: /path/to/mall-demo
`;
  const config = parseConfig(yaml);
  expect(config.name).toBe("mall-specs");
  expect(config.exclude).toEqual(["mall-demo", "mall-monitor"]);
  expect(config.services["mall-admin"]).toBe("/path/to/mall-admin");
});

test("config: 不带 name 和 exclude 的旧格式仍可解析", () => {
  const yaml = `
services:
  mall: /path/to/mall-swarm
`;
  const config = parseConfig(yaml);
  expect(config.name).toBeUndefined();
  expect(config.exclude).toBeUndefined();
  expect(config.services.mall).toBe("/path/to/mall-swarm");
});

test("config: exclude 过滤逻辑", () => {
  const exclude = new Set(["mall-demo", "mall-monitor"]);
  const services: Record<string, string> = {
    "mall-admin": "/path/a",
    "mall-portal": "/path/b",
    "mall-demo": "/path/c",
    "mall-monitor": "/path/d",
  };
  const filtered = Object.entries(services).filter(([name]) => !exclude.has(name));
  expect(filtered.length).toBe(2);
  expect(filtered.map(([n]) => n)).toEqual(["mall-admin", "mall-portal"]);
});

test("config: name 默认值为 workspace", () => {
  const config: ConfigFile = { services: { mall: "/path" } };
  const artifactId = config.name ?? "workspace";
  expect(artifactId).toBe("workspace");
});

test("config: name 指定时使用自定义值", () => {
  const config: ConfigFile = { services: { mall: "/path" }, name: "mall-specs" };
  const artifactId = config.name ?? "workspace";
  expect(artifactId).toBe("mall-specs");
});
