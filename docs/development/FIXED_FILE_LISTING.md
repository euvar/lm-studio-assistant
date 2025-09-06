# Fixed File Listing Issue

## Problem
When user typed "Покажи файлы" (Show files), the system was:
1. Orchestrator agent would intercept the request
2. Switch to conversational agent
3. Never execute the actual file listing

## Root Cause
The agent registry was switching agents even when the current agent returned tool calls to execute.

## Solution Implemented

### 1. Updated Agent Registry (src/agents/agent-registry.ts)
```typescript
// If agent provided tool calls, return them immediately
// Don't switch to another agent if we have actions to perform
if (response.toolCalls && response.toolCalls.length > 0) {
  return response;
}
```

### 2. Enhanced FileAgent Pattern Matching (src/agents/file-agent.ts)
```typescript
if ((/покаж|show|list|перечисли/.test(input) && /файл|папк|folder|directory/.test(input)) ||
    input === 'покажи файлы' || 
    input === 'покажи мне файлы' ||
    input === 'show files' ||
    input === 'list files' ||
    /^покажи\s+(мне\s+)?файлы?$/i.test(input) ||
    /^list\s+files?$/i.test(input)) {
```

### 3. Updated Orchestrator to Skip Simple Commands
Already implemented - orchestrator correctly returns false for simple file commands.

## Test Results
✅ "покажи файлы" - Works
✅ "Покажи файлы" - Works  
✅ "покажи мне файлы" - Works
✅ "show files" - Works
✅ "list files" - Works

## How to Test
```bash
# Run the test
npx tsx test-simple.ts

# Or test with the main app
npm start
# Then type: Покажи файлы
```

The file listing now works correctly!