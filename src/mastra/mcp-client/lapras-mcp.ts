import { MCPClient } from '@mastra/mcp';

// Configure MCPClient to connect to your server(s)
export const LaprasMCP = new MCPClient({
  servers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@lapras-inc/lapras-mcp-server'],
    },
  },
});
