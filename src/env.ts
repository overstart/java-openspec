import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { t } from "./i18n";

// 三级优先级 .env 查找
export async function loadEnv(): Promise<Record<string, string>> {
  const envPaths: string[] = [];

  // 1. $JAVA_OPENSPEC_ENV 显式指定
  const explicitPath = process.env.JAVA_OPENSPEC_ENV;
  if (explicitPath) {
    envPaths.push(explicitPath);
    try {
      await readFile(explicitPath, "utf-8");
    } catch {
      console.warn(t.explicitNotFound(explicitPath));
    }
  }

  // 2. $PWD/.env 当前工作目录
  envPaths.push(join(process.cwd(), ".env"));

  // 3. ~/.config/java-openspec/.env XDG 全局配置
  envPaths.push(join(homedir(), ".config", "java-openspec", ".env"));

  for (const path of envPaths) {
    try {
      const content = await readFile(path, "utf-8");
      const env: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim();
          if (!process.env[key]) process.env[key] = value;
          env[key] = value;
        }
      }
      return env;
    } catch {
      // 文件不存在，继续下一个
    }
  }

  // 都没找到 - 自动从模板创建配置
  const configDir = join(homedir(), ".config", "java-openspec");
  const envPath = join(configDir, ".env");
  if (!existsSync(envPath)) {
    try {
      const templatePath = join(import.meta.dirname ?? ".", "..", ".env.example");
      const template = await readFile(templatePath, "utf-8");
      await mkdir(configDir, { recursive: true });
      await writeFile(envPath, template);
      console.log(`\n  ${t.autoCreated(envPath)}\n`);
      process.exit(0);
    } catch {
      // 创建失败，静默跳过
    }
  }

  return {};
}