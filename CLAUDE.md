# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development

- `npm run dev` - Start development server using Mastra framework
- `npm run build` - Build the project using Mastra build system

### Code Quality

- `npm run lint` - Run ESLint on TypeScript/JavaScript files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Testing

- Currently no test suite configured (`npm test` will fail)

## Architecture Overview

This is a personal recruitment agent system built with the Mastra AI framework. The system uses multiple specialized AI agents to help with job searching and matching.

### Core Components

**Mastra Framework Integration** (`src/mastra/index.ts`):

- Central configuration using LibSQL for storage (file database)
- Three main agents registered: RecruitAgent, ChecklistAgent, JobMatcherAgent
- Uses in-memory database for development

**Agent System**:

- **RecruitAgent** (`src/mastra/agents/recruit-agent.ts`): Job search specialist with aggressive search strategies, targets finding 10+ jobs through multi-phase searches
- **ChecklistAgent** (`src/mastra/agents/checklist-agent.ts`): Converts user requirements into structured Markdown checklists
- **JobMatcherAgent** (`src/mastra/agents/job-matcher-agent.ts`): Analyzes job compatibility using detailed scoring algorithms (80%+ threshold for recommendations)

**External Integration**:

- **LAPRAS MCP Client** (`src/mastra/mcp-client/lapras-mcp.ts`): Connects to LAPRAS job search service via MCP (Model Context Protocol)
- Uses NPX to run LAPRAS MCP server: `npx -y @lapras-inc/lapras-mcp-server`

### Agent Behavior Patterns

**RecruitAgent Search Strategy**:

- Uses multi-phase expansion from strict criteria to broader searches
- Maintains core constraints (salary, remote work, employment type) while expanding technology and position keywords
- Outputs structured JSON with job results and search statistics

**JobMatcherAgent Evaluation**:

- Weighted scoring system: Tech Stack (30%), Work Style (25%), Salary (20%), Company (15%), Other (10%)
- Only evaluates criteria explicitly mentioned in user checklists
- Missing criteria treated as "no constraints" rather than negative scores
- Requires 80%+ match rate for positive recommendations

### Memory and State Management

All agents use LibSQL storage with working memory templates that track:

- User profiles and preferences
- Search history and strategies
- Job matching results and patterns
- Consistency in evaluation criteria

### Technology Stack

- **Runtime**: Node.js 20.9.0+, ES2022 modules
- **AI Models**: Google Gemini (2.0-flash-exp, 2.5-flash-preview)
- **Framework**: Mastra AI framework with MCP integration
- **Storage**: LibSQL (SQLite-compatible) for agent memory
- **Code Quality**: ESLint + Prettier with Husky pre-commit hooks

## Development Notes

- Project uses ES modules (`"type": "module"` in package.json)
- TypeScript configuration targets ES2022 with bundler module resolution
- Database files created locally: `database.db` and `mastra.db`
- All agent instructions are in Japanese, targeting Japanese job market
- LAPRAS integration provides access to Japanese engineering job listings
