import { MCPClient } from '@mastra/mcp';

// Configure MCPClient to connect to your server(s)
export const LaprasMCP = new MCPClient({
  servers: {
    lapras: {
      command: 'npx',
      args: ['-y', '@lapras-inc/lapras-mcp-server'],
      logger: logMessage => {
        console.log(
          `[MCP] [${logMessage.level}] ${logMessage.serverName}: ${logMessage.message}`
        );
        if (logMessage.details) {
          console.log(`[MCP] Details:`, logMessage.details);
        }
      },
      enableServerLogs: true,
    },
  },
});
