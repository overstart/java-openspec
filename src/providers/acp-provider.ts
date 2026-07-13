import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import * as acp from "@agentclientprotocol/sdk";
import type { LLMProvider, TokenUsage } from "../types";
import { stripPreamble } from "../postprocess";

// 解析 ACP_AGENT_CMD 为命令 + 参数
export function parseAgentCommand(cmd: string): { command: string; args: string[] } {
  const parts = cmd.trim().split(/\s+/);
  return { command: parts[0]!, args: parts.slice(1) };
}

// ACP provider: 通过 stdio 连接 ACP 兼容 agent，无需 API key
export class ACPProvider implements LLMProvider {
  private process: ChildProcess | null = null;
  private connection: acp.ClientConnection | null = null;
  private agentCmd: string;

  constructor(agentCmd: string) {
    this.agentCmd = agentCmd;
  }

  // 启动 agent 进程并建立 ACP 连接（幂等，已启动则跳过）
  private async ensureConnection(): Promise<acp.ClientContext> {
    if (this.connection) return this.connection.agent;

    const { command, args } = parseAgentCommand(this.agentCmd);
    console.log(`[ACP] Starting agent: ${command} ${args.join(" ")}`);

    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "inherit"],
    });

    this.process.on("error", (err) => {
      throw new Error(`[ACP] Agent process error: ${err.message}`);
    });

    const input = Writable.toWeb(this.process.stdin!) as WritableStream<Uint8Array>;
    const output = Readable.toWeb(this.process.stdout!) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const app = acp
      .client({ name: "java-openspec" })
      // 权限请求: 拒绝所有 agent 自身的工具调用
      .onRequest(
        acp.methods.client.session.requestPermission,
        async (ctx) => {
          const deny = ctx.params.options.find((o) => o.kind === "reject_once");
          if (deny) {
            return { outcome: { outcome: "selected", optionId: deny.optionId } };
          }
          return { outcome: { outcome: "cancelled" } };
        }
      )
      // 允许 agent 通过 client 读取文件
      .onRequest(
        acp.methods.client.fs.readTextFile,
        async (ctx) => {
          try {
            const content = await readFile(ctx.params.path, "utf-8");
            return { content };
          } catch {
            return { content: "" };
          }
        }
      );

    this.connection = app.connect(stream);

    // Initialize 握手
    const initResult = await this.connection.agent.request(
      acp.methods.agent.initialize,
      {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true },
        },
      }
    );
    console.log(
      `[ACP] Connected to agent (protocol v${initResult.protocolVersion})`
    );

    return this.connection.agent;
  }

  async generate(
    systemPrompt: string,
    userContent: string
  ): Promise<{ content: string; usage: TokenUsage }> {
    const ctx = await this.ensureConnection();

    // 合并 system + user 为单个 prompt
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userContent}`;

    const session = await ctx.buildSession(process.cwd()).start();
    try {
      session.prompt(fullPrompt);

      // 收集 agent_message_chunk 中的 Text 块
      let content = "";
      let usage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      for (;;) {
        const message = await session.nextUpdate();
        if (message.kind === "stop") {
          // ACP 协议可能返回 usage，有则用真实数据
          if (message.response.usage) {
            usage = {
              promptTokens: message.response.usage.inputTokens,
              completionTokens: message.response.usage.outputTokens,
              totalTokens: message.response.usage.totalTokens,
            };
          }
          break;
        }
        const { update } = message;
        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          content += update.content.text;
        }
      }

      return { content: stripPreamble(content), usage };
    } finally {
      session.dispose();
    }
  }

  async close(): Promise<void> {
    this.connection?.close();
    this.connection = null;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
