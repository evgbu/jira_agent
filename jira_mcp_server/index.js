/**
 * MCP Server for Jira on-premises
 * Provides tools: jira_get_issue, jira_add_comment
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { getIssue, addComment } from './jira.js';

// Create MCP server
const mcpServer = new McpServer({
  name: 'jira-mcp-server',
  version: '1.0.4',
});

// Register jira_get_issue tool
mcpServer.registerTool(
  'jira_get_issue',
  {
    description: 'Get Jira issue details by key, including title, description, parent reference, and paginated comments with total count',
    inputSchema: z.object({
      issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")'),
      maxComments: z.number().default(30).describe('Maximum number of comments to return (default: 30)'),
      offset: z.number().default(0).describe('Offset for comments pagination (default: 0)'),
    }),
  },
  async ({ issueKey, maxComments = 30, offset = 0 }) => {
    const result = await getIssue(issueKey, maxComments, offset);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Register jira_add_comment tool
mcpServer.registerTool(
  'jira_add_comment',
  {
    description: 'Add a comment to a Jira issue',
    inputSchema: z.object({
      issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")'),
      comment: z.string().describe('Comment text to add'),
    }),
  },
  async ({ issueKey, comment }) => {
    const result = await addComment(issueKey, comment);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error('Jira MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
