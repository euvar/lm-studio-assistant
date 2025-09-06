# AI-Based Understanding (No Hardcoding)

## Overview
The system now uses pure AI understanding instead of hardcoded patterns. Every request is analyzed by the AI to determine what the user wants and how to accomplish it.

## How It Works

### 1. Intelligent Routing
Instead of pattern matching, the orchestrator asks AI:
```typescript
const decisionPrompt = `Should the orchestrator handle this request?
User said: "${context.userInput}"
The orchestrator handles:
- Complex tasks requiring planning
- System operations and commands
- Multi-step workflows
- Requests that need tool execution
Respond with just "yes" or "no".`;
```

### 2. Dynamic Understanding
For each request, AI analyzes and creates a plan:
```typescript
const understandingPrompt = `Analyze this request and determine the best approach.
User request: "${context.userInput}"
Determine:
1. What exactly does the user want?
2. What tools/commands would accomplish this?
3. Is this a single action or multiple steps?

Respond in JSON:
{
  "understanding": "what the user wants",
  "approach": "single_action" or "multi_step",
  "actions": [{
    "description": "what to do",
    "tool": "bash",
    "command": "exact command",
    "reason": "why this helps"
  }]
}`;
```

### 3. No Hardcoded Patterns
- ❌ No regex patterns for specific requests
- ❌ No hardcoded command mappings
- ❌ No keyword detection
- ✅ Pure AI understanding
- ✅ Dynamic command generation
- ✅ Context-aware decisions

## Examples

### Process Counting
**User**: "Можешь посмотреть сколько процессов у меня запущенно?"
**AI Understanding**: "User wants to see how many processes are running"
**AI Decision**: `ps aux | wc -l`

### Memory Usage
**User**: "определи тот который много потребляет памяти"
**AI Understanding**: "User wants to find processes consuming a lot of memory"
**AI Decision**: `ps aux --sort=-%mem | head -10`

### New Requests (Never Seen Before)
**User**: "покажи использование диска"
**AI Understanding**: "User wants to see disk usage"
**AI Decision**: `df -h`

**User**: "найди большие файлы"
**AI Understanding**: "User wants to find large files"
**AI Decision**: `find . -type f -size +100M`

## Benefits

1. **Flexibility**: Handles ANY request without predefined patterns
2. **Intelligence**: Understands intent, not just keywords
3. **Adaptability**: Works with new requests immediately
4. **Context Aware**: Considers conversation history
5. **Natural**: No rigid command structures

## Technical Implementation

### OrchestratorAgent Changes:
- Removed all pattern arrays
- Removed `isProblemStatement()`, `isSystemInspectionRequest()`, etc.
- Added AI-based `canHandle()` decision
- Dynamic command generation in `process()`

### ConversationalAgent Changes:
- Removed keyword detection
- Simple length-based filtering
- AI-based intent analysis for edge cases

## Testing
```bash
npx tsx test-no-hardcode.ts
```

The system now truly understands requests like a human would, generating appropriate commands dynamically!