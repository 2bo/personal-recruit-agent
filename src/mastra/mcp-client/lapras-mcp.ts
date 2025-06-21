import { MCPClient } from '@mastra/mcp';

// Configure MCPClient to connect to your server(s)
export const LaprasMCP = new MCPClient({
  id: 'lapras-mcp',
  servers: {
    lapras: {
      command: 'node',
      args: [
        '/opt/nodejs/node_modules/@lapras-inc/lapras-mcp-server/dist/index.js',
      ],
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
