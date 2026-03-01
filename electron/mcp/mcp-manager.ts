import type {
  McpServerConfig,
  McpServerListResult,
  McpServerStatusListResult,
  UserMcpServer
} from "../../src/shared/contracts";
import { McpClient, type McpClientState, type McpTool } from "./mcp-client";

export type McpToolWithServer = McpTool & { serverName: string };

const userMcpToConfig = (server: UserMcpServer): McpServerConfig => ({
  name: server.name,
  enabled: server.enabled,
  disabledReason: null,
  authStatus: "unknown",
  transportType: server.transportType,
  endpoint: server.endpoint,
  startupTimeoutSec: null,
  toolTimeoutSec: null
});

export class McpManager {
  private clients = new Map<string, McpClient>();
  private configs: McpServerConfig[] = [];

  async initialize(configs: McpServerConfig[]): Promise<void> {
    this.configs = configs;
    await Promise.all(
      configs.map(async (config) => {
        const client = new McpClient(config, (state) => this.onClientStateChange(config.name, state));
        this.clients.set(config.name, client);
        await client.connect();
      })
    );
  }

  async initializeFromUserServers(servers: UserMcpServer[]): Promise<void> {
    await this.initialize(servers.map(userMcpToConfig));
  }

  getServerListResult(): McpServerListResult {
    return {
      ok: true,
      message: this.configs.length
        ? `Found ${this.configs.length} MCP server(s).`
        : "No MCP servers configured.",
      servers: this.configs
    };
  }

  getServerStatusResult(): McpServerStatusListResult {
    const servers = Array.from(this.clients.values()).map((client) => client.toServerStatus());
    return {
      ok: true,
      message: servers.length
        ? `Status for ${servers.length} MCP server(s).`
        : "No MCP servers connected.",
      servers
    };
  }

  async syncFromUserServers(servers: UserMcpServer[]): Promise<McpServerStatusListResult> {
    return this.reload(servers.map(userMcpToConfig));
  }

  async reload(newConfigs: McpServerConfig[]): Promise<McpServerStatusListResult> {
    for (const [name, client] of this.clients) {
      if (!newConfigs.find((c) => c.name === name)) {
        client.destroy();
        this.clients.delete(name);
      }
    }

    this.configs = newConfigs;

    await Promise.all(
      newConfigs.map(async (config) => {
        const existing = this.clients.get(config.name);
        if (existing) {
          existing.destroy();
        }
        const client = new McpClient(config, (state) => this.onClientStateChange(config.name, state));
        this.clients.set(config.name, client);
        await client.connect();
      })
    );

    return this.getServerStatusResult();
  }

  destroy(): void {
    for (const client of this.clients.values()) {
      client.destroy();
    }
    this.clients.clear();
  }

  getAllTools(): McpToolWithServer[] {
    const result: McpToolWithServer[] = [];
    for (const [serverName, client] of this.clients) {
      if (client.getState().status !== "ready") continue;
      for (const tool of client.getState().tools) {
        result.push({ ...tool, serverName });
      }
    }
    return result;
  }

  async callTool(serverName: string, toolName: string, toolInput: unknown): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" not found.`);
    }
    return client.callTool(toolName, toolInput);
  }

  private onClientStateChange(name: string, state: McpClientState): void {
    void name;
    void state;
  }
}
