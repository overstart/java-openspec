#!/usr/bin/env bun
import { Command } from "commander";
import { pipeline } from "./pipeline";

const program = new Command();

program
  .name("java-openspec")
  .description("从 Java Spring Cloud 项目自动生成 OpenSpec store")
  .version("0.2.0");

program
  .command("init")
  .description("分析项目并生成 OpenSpec store")
  .argument("<project-path>", "目标项目路径")
  .option("--force", "覆盖已存在的 store")
  .option("--config <path>", "多路径配置文件 (java-openspec.yml)")
  .action(async (projectPath: string, options: { force?: boolean; config?: string }) => {
    await pipeline(projectPath, options);
  });

program.parse();