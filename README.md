# java-openspec

[中文文档](README.zh-CN.md)

A CLI tool that auto-generates OpenSpec stores from Java Spring Cloud projects.

## Features

- Auto-detect Spring Boot microservice modules from Maven multi-module projects
- Extract project structure, naming conventions, and code patterns via CodeGraph AST analysis
- Generate spec documents using LLM (overview, coding-style, architecture, security)
- Generate C4 architecture diagrams + sequence diagrams using Mermaid
- Output as OpenSpec 1.5.0 store with automatic registration

## Prerequisites

| Tool | Min Version | Purpose | Check Command |
|------|-------------|---------|---------------|
| [Bun](https://bun.sh) | 1.0 | Runtime | `bun --version` |
| [CodeGraph](https://github.com/nicholasxuu/codegraph) | 1.3 | Java AST analysis | `codegraph --version` |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 1.5 | Store creation & registration | `openspec --version` |

### Install CodeGraph

```bash
# After installation, run codegraph init on the target project to build the index
codegraph --version
```

### Install OpenSpec

```bash
npm install -g @fission-ai/openspec@latest
openspec --version
```

## Installation

```bash
# Install via npm
npm install -g java-openspec

# Or install via Bun
bun add -g java-openspec

# Verify
java-openspec --version
```

## LLM Configuration

`.env` file is searched in priority order:

1. `$JAVA_OPENSPEC_ENV` - Explicit path
2. `$PWD/.env` - Current working directory
3. `~/.config/java-openspec/.env` - XDG global config

```bash
# Global config (recommended)
mkdir -p ~/.config/java-openspec
cp .env.example ~/.config/java-openspec/.env
# Edit ~/.config/java-openspec/.env with your API key
```

Uses OpenAI API format by default, compatible with any OpenAI-compatible service.

```bash
# .env example - OpenAI
OPENAI_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1

# .env example - Volcengine Ark
# OPENAI_API_KEY=your-ark-key
# LLM_MODEL=deepseek-v4-flash
# LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
```

## Usage

### Single Project Mode

```bash
java-openspec init /path/to/mall-swarm
```

### Multi-Path Mode

When microservices are spread across different directories, use a config file:

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

## Output

```
<project>-specs/
├── store.yaml
└── openspec/
    └── docs/
        ├── overview.md           # Global project overview
        ├── coding-style.md       # Global coding conventions
        ├── architecture.md       # Global architecture spec
        ├── security.md           # Global security spec
        ├── diagrams/
        │   ├── context.mmd               # C4 System Context
        │   ├── <service>-container.mmd   # C4 Container
        │   └── <service>-flow.mmd        # Business sequence diagram
        └── <service>/
            └── architecture.md
```

## Pipeline

```
detect -> analyze -> generate-diagrams -> generate-docs -> create-store -> validate
```

1. **detect** - Scan pom.xml, identify microservice modules vs library modules
2. **analyze** - CodeGraph index + file scan, extract naming patterns, call paths, security patterns
3. **generate-diagrams** - Mermaid flowchart/sequenceDiagram generation
4. **generate-docs** - LLM generates spec documents from analysis + templates
5. **create-store** - Call openspec CLI to create store and register
6. **validate** - openspec store doctor validation

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── pipeline.ts           # Main pipeline orchestration
├── detect.ts             # Maven project detection
├── analyze.ts            # CodeGraph analysis
├── generate-diagrams.ts  # Mermaid diagram generation
├── generate-docs.ts      # LLM document generation
├── create-store.ts       # OpenSpec store creation
├── postprocess.ts        # LLM output post-processing
├── env.ts                # .env loading
├── pricing.ts            # Token cost estimation
└── types.ts              # Type definitions
templates/                # LLM prompt templates
spec-templates/           # Spec structure validation schemas
```

## Tech Stack

- **Runtime**: Bun + TypeScript
- **LLM**: OpenAI-compatible API (deepseek-v4-flash)
- **Analysis**: CodeGraph + file scanning
- **Diagrams**: Mermaid (flowchart + sequenceDiagram)
- **Validation**: unified + remark-parse (Markdown AST)
- **Config**: YAML (js-yaml)

## License

Apache-2.0