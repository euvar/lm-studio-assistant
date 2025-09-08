# Clean Tool Use Architecture

## Overview

This is the proper implementation of LLM tool use following OpenAI/Anthropic standards:

1. **No hardcoded patterns or keywords**
2. **Tools are defined by their purpose, not keywords**
3. **LLM decides when to use tools based on descriptions**

## Core Components

### 1. Tool Definition (Standard Format)
```typescript
interface ToolDefinition {
  name: string;
  description: string;  // Natural language description
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required?: string[];
  };
}
```

### 2. Clean Agents
- Only define tools with descriptions
- No `canHandle()` with patterns
- No hardcoded strings

### 3. Orchestrator
- Collects tool definitions from all agents
- Sends them to LLM with user request
- LLM decides which tools to use
- Orchestrator executes the tools

## File Structure

```
src/
  core/
    clean-tool-system.ts    # Core tool calling logic
  agents/
    clean-agent.ts          # Base class for clean agents
    web-search-agent.ts     # Web search tools
    file-system-agent.ts    # File system tools
    code-execution-agent.ts # Code execution tools
    clean-orchestrator.ts   # Orchestrates tool calls
```

## Old Files to Remove

These files contain hardcoded patterns and should be removed:
- src/agents/search-agent.ts (has patterns like /найди|найти/)
- src/agents/file-agent.ts (has patterns like /файл|file/)
- src/agents/code-agent.ts (has patterns like /запусти|run/)
- Any file with regex patterns or keyword lists

## How It Works

1. User makes a request
2. Orchestrator collects all tool definitions
3. LLM receives tools + user request
4. LLM decides which tools to call
5. Orchestrator executes the tools
6. Results returned to user

## Example

User: "What's the weather in London?"

LLM sees:
- Tool: search_web - "Search the internet for current information"

LLM responds:
```json
{
  "toolCalls": [{
    "name": "search_web",
    "arguments": { "query": "weather in London" }
  }]
}
```

No patterns needed - LLM understands semantically that weather requires searching.