# Intelligent Vague Request Handling

## Overview
Enhanced the orchestrator to intelligently handle vague requests like "сделай что-нибудь" (do something) without using hardcoded responses.

## Implementation

### 1. Detection of Vague Requests
```typescript
const vaguePatterns = [
  /сделай\s+(что|чего|чё).*нибудь/i,
  /do\s+something/i,
  /что\s+(можешь|умеешь)\s+сделать/i,
  /what\s+can\s+you\s+do/i,
  /покажи\s+что.*умеешь/i,
  /придумай\s+что.*нибудь/i,
  /think\s+of\s+something/i
];
```

### 2. Intelligent Decision Making
When a vague request is detected, the orchestrator:

1. **Analyzes Context**: Looks at recent conversation history
2. **Makes Smart Decision**: Uses AI to decide what would be most helpful
3. **Takes Action**: Either executes a tool or provides a helpful response

### 3. Decision Process
```typescript
private async handleVagueRequest(context: AgentContext): Promise<AgentResponse> {
  // AI analyzes:
  // - Recent conversation topics
  // - User's potential needs
  // - Available capabilities
  // - Most helpful action
  
  // Returns either:
  // - Tool call (search, analyze, etc.)
  // - Helpful conversational response
  // - Creative suggestion
}
```

## Examples

### Without Context
**User**: "сделай что-нибудь"
**AI Decision**: Might search for interesting news, analyze project, or offer options

### With Context
**User**: "какая погода в москве?"
**Assistant**: "В Москве сегодня..."
**User**: "сделай что-нибудь"
**AI Decision**: Search for more weather info or related topics

## Benefits

1. **No Hardcoding**: Uses AI to understand intent
2. **Context Aware**: Considers conversation history
3. **Adaptive**: Different responses based on situation
4. **Helpful**: Always tries to provide value

## Technical Details

- Integrated into OrchestratorAgent
- Uses LLM for decision making
- Falls back gracefully if parsing fails
- Maintains conversation flow

## Testing

Run the test:
```bash
npx tsx test-vague-requests.ts
```

The system now handles vague requests intelligently without hardcoded responses!