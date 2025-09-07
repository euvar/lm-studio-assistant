# Semantic Understanding Architecture

## Overview

This document describes the new semantic understanding architecture that replaces regex and hardcoded patterns with pure LLM-based intent recognition and action mapping.

## Core Components

### 1. SemanticIntentEngine
**Location:** `src/core/semantic-intent-engine.ts`

The brain of the system that understands user intent through semantic analysis:

- **Semantic Decomposition:** Breaks down user input into core subject, action, and expected outcome
- **Intent Classification:** Classifies intent based on meaning, not keywords
- **Entity Extraction:** Extracts relevant entities (subjects, actions, locations, etc.)
- **Confidence Assessment:** Rates understanding confidence
- **Clarification System:** Asks natural questions when confidence is low

### 2. DynamicActionMapper
**Location:** `src/core/dynamic-action-mapper.ts`

Maps understood intents to concrete actions:

- **Semantic Reasoning:** Chooses tools based on capability match
- **Parameter Generation:** Creates parameters from semantic understanding
- **Multi-Step Planning:** Breaks complex tasks into steps
- **Action Optimization:** Optimizes plans for efficiency and safety
- **Validation:** Ensures actions are valid and safe

### 3. UniversalOrchestrator
**Location:** `src/agents/universal-orchestrator.ts`

The new orchestrator that coordinates everything:

- **Pure LLM Understanding:** No regex or pattern matching
- **Context-Aware Execution:** Adapts based on context
- **Multi-Step Coordination:** Handles complex workflows
- **Error Recovery:** Gracefully handles failures

### 4. ContextAwareExecutor
**Location:** `src/core/context-aware-executor.ts`

Adapts execution based on context:

- **OS-Specific Adaptation:** Adjusts commands for different operating systems
- **Safety Checks:** Prevents harmful operations
- **Result Interpretation:** Provides user-friendly explanations
- **Follow-Up Suggestions:** Suggests next steps

### 5. LearningFromFeedback
**Location:** `src/core/learning-from-feedback.ts`

Learns from user interactions:

- **Feedback Recording:** Tracks user satisfaction
- **Pattern Analysis:** Identifies successful and failed patterns
- **Mistake Learning:** Learns from errors
- **Continuous Improvement:** Applies learnings to future interactions

## Key Principles

### 1. Semantic Understanding Over Pattern Matching

Instead of:
```typescript
if (/погода|weather/.test(input)) {
  // Handle weather
}
```

We now use:
```typescript
const intent = await intentEngine.understand({ input });
// Intent: information_request
// Entities: { subjects: ["weather"], locations: ["Moscow"] }
```

### 2. Dynamic Tool Selection

Tools are chosen based on semantic purpose:
- Information about internet/world → webSearch
- Information about system → bash
- Creating content → writeFile
- Analyzing code → analyzeProject

### 3. Context-Aware Adaptation

The system adapts based on:
- Operating system
- Conversation history
- Previous results
- User preferences

### 4. Natural Clarification

When uncertain, the system asks natural questions:
- "Do you want me to search online or check local files?"
- "Should I create a new file or modify existing one?"
- "Are you asking about current weather or forecast?"

## Example Flow

1. **User Input:** "покажи что работает на компе"

2. **Intent Understanding:**
   ```json
   {
     "type": "system_operation",
     "confidence": 0.85,
     "entities": {
       "subjects": ["processes", "programs"],
       "actions": ["show", "list"]
     },
     "reasoning": "User wants to see running processes on computer"
   }
   ```

3. **Action Mapping:**
   ```json
   {
     "approach": "single",
     "actions": [{
       "tool": "bash",
       "parameters": { "command": "ps aux | head -20" },
       "description": "List running processes"
     }]
   }
   ```

4. **Context Adaptation:**
   - On macOS: `ps aux | sort -nrk 3 | head`
   - On Linux: `ps aux --sort=-%cpu | head`
   - On Windows: `Get-Process | Sort-Object -Property CPU`

## Benefits

1. **Language Agnostic:** Works with any language without specific patterns
2. **Flexible Understanding:** Handles various phrasings of same intent
3. **Self-Improving:** Learns from interactions
4. **Maintainable:** No regex patterns to update
5. **Extensible:** Easy to add new capabilities

## Testing

Run semantic understanding tests:
```bash
npx tsx src/test/test-semantic-understanding.ts
```

This tests various phrasings, languages, and edge cases to ensure robust understanding.

## Migration Guide

To use the new system:

1. Replace `OrchestratorAgent` with `UniversalOrchestrator` in agent registry
2. Remove regex-based intent detection code
3. Use `SemanticIntentEngine` for understanding user input
4. Let `DynamicActionMapper` choose appropriate tools

The system is designed to be drop-in compatible while providing superior understanding.