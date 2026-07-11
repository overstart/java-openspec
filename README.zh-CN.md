# java-openspec

[English](README.md)

从 Java Spring Cloud 项目自动生成 OpenSpec store 的 CLI 工具。

## 功能

- 自动检测 Maven 多模块项目中的 Spring Boot 微服务模块
- 基于 CodeGraph AST 分析提取项目结构、命名规范、代码模式
- 使用 LLM 生成规范文档（项目总览、编码规范、架构规范、安全规范）
- 使用 Mermaid 生成 C4 架构图 + 业务时序图
- 输出为 OpenSpec 1.5.0 store，自动注册

## 前置条件

| 工具 | 最低版本 | 用途 | 检查命令 |
|------|---------|------|---------|
| [Bun](https://bun.sh) | 1.0 | 运行时 | `bun --version` |
| [CodeGraph](https://github.com/nicholasxuu/codegraph) | 1.3 | Java AST 分析 | `codegraph --version` |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 1.5 | Store 创建与注册 | `openspec --version` |

### 安装 CodeGraph

```bash
# 安装后需对目标项目执行 codegraph init 建立索引
codegraph --version
```

### 安装 OpenSpec

```bash
npm install -g @fission-ai/openspec@latest
openspec --version
```

## 安装

```bash
cd ~/gitrepo/java-openspec
bun install

# 全局安装 (可选，安装后可直接使用 java-openspec 命令)
bun link
```

## 配置 LLM

`.env` 文件按以下优先级查找：

1. `$JAVA_OPENSPEC_ENV` — 显式指定路径
2. `$PWD/.env` — 当前工作目录
3. `~/.config/java-openspec/.env` — XDG 全局配置

```bash
# 全局配置 (推荐)
mkdir -p ~/.config/java-openspec
cp .env.example ~/.config/java-openspec/.env
# 编辑 ~/.config/java-openspec/.env，填入 API Key
```

默认使用 OpenAI API 格式，兼容任何 OpenAI-compatible 服务。

```bash
# .env 示例 — OpenAI
OPENAI_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1

# .env 示例 — 火山引擎 Ark
# OPENAI_API_KEY=your-ark-key
# LLM_MODEL=deepseek-v4-flash
# LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
```

## 用法

`bun link` 后可直接使用 `java-openspec` 命令，否则用 `bun run src/index.ts`。

### 单项目模式

```bash
java-openspec init /path/to/mall-swarm
```

### 多路径模式

不同微服务分布在不同目录时，使用配置文件：

```yaml
# java-openspec.yml
services:
  mall-admin: /home/liyf/gitrepo/mall-admin
  mall-portal: /home/liyf/gitrepo/mall-portal
  mall-common: /home/liyf/gitrepo/mall-common
```

```bash
java-openspec init /path/to/workspace --config java-openspec.yml
```

## 输出

```
<project>-specs/
├── store.yaml
└── openspec/
    └── specs/
        ├── overview.md           # 全局项目总览
        ├── coding-style.md       # 全局编码规范
        ├── architecture.md       # 全局架构规范
        ├── security.md           # 全局安全规范
        ├── diagrams/
        │   ├── context.mmd               # C4 System Context
        │   ├── <service>-container.mmd   # C4 Container
        │   └── <service>-flow.mmd        # 业务时序图
        └── <service>/
            ├── overview.md
            └── architecture.md
```

## 工作流程

```
detect → analyze → generate-diagrams → generate-docs → create-store → validate
```

1. **detect** — 扫描 pom.xml，识别微服务模块与公共库模块
2. **analyze** — CodeGraph 索引 + 文件扫描，提取命名模式、调用路径、安全模式
3. **generate-diagrams** — Mermaid flowchart/sequenceDiagram 生成架构图
4. **generate-docs** — LLM 根据分析结果 + 模板生成 spec 文档
5. **create-store** — 调用 openspec CLI 创建 store 并注册
6. **validate** — openspec store doctor 校验输出

## 项目结构

```
src/
├── index.ts              # CLI 入口
├── pipeline.ts           # 主流程编排
├── detect.ts             # Maven 项目检测
├── analyze.ts            # CodeGraph 分析
├── generate-diagrams.ts  # Mermaid 图表生成
├── generate-docs.ts      # LLM 文档生成
├── create-store.ts       # OpenSpec store 创建
├── postprocess.ts        # LLM 输出后处理
└── types.ts              # 类型定义
templates/                # LLM prompt 模板
spec-templates/           # Spec 结构校验 schema
```

## 技术栈

- **运行时**: Bun + TypeScript
- **LLM**: OpenAI-compatible API (deepseek-v4-flash)
- **分析**: CodeGraph + 文件扫描
- **图表**: Mermaid (flowchart + sequenceDiagram)
- **文档校验**: unified + remark-parse (Markdown AST)
- **配置**: YAML (js-yaml)