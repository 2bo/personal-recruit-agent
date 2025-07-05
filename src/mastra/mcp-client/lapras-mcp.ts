import { MCPClient } from '@mastra/mcp';

const isProduction = process.env.NODE_ENV === 'production';
const serverConfig = isProduction
  ? {
      command: 'node',
      args: ['node_modules/@lapras-inc/lapras-mcp-server/dist/index.js'],
    }
  : { command: 'npx', args: ['-y', '@lapras-inc/lapras-mcp-server'] };

// Configure MCPClient to connect to your server(s)
export const LaprasMCP = new MCPClient({
  id: 'lapras-mcp',
  servers: {
    lapras: {
      ...serverConfig,
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
