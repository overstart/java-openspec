#!/usr/bin/env bun
import { Command } from "commander";
import { pipeline } from "./pipeline";
import { t } from "./i18n";

const program = new Command();

program
  .name("java-openspec")
  .description(t.cliDescription)
  .version("0.2.0");

program
  .command("init")
  .description(t.initDescription)
  .argument("<project-path>", t.initArg)
  .option("--force", t.initForce)
  .option("--config <path>", t.initConfig)
  .action(async (projectPath: string, options: { force?: boolean; config?: string }) => {
    await pipeline(projectPath, options);
  });

program.parse();