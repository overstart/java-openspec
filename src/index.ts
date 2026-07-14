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
  .description("分析 Java 项目并生成 OpenSpec store (spec 文档 + 架构图)")
  .argument("<project-path>", "目标项目路径 (Maven 根目录或工作区目录)")
  .option("--force", "覆盖已存在的 store")
  .option(
    "--config <path>",
    "使用多路径配置文件 (YAML)，适用于微服务分散在不同目录的场景。\n" +
    "    配置文件格式:\n" +
    "      services:\n" +
    "        mall-admin: /path/to/mall-admin\n" +
    "        mall-portal: /path/to/mall-portal\n" +
    "    路径可为绝对路径或相对配置文件的相对路径。\n" +
    "    不指定 --config 时自动检测 Maven 多模块项目。"
  )
  .action(async (projectPath: string, options: { force?: boolean; config?: string }) => {
    await pipeline(projectPath, options);
  });

program.parse();