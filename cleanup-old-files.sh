#!/bin/bash

echo "=== Cleaning up old files with patterns ==="

# Find test files with old agents and remove them
echo "Removing old test files..."
find src/test -name "*.ts" -type f | xargs grep -l "ConversationalAgent\|FileAgent\|SearchAgent\|CodeAgent\|SmartProjectAgent\|OrchestratorAgent\|universal-orchestrator" | while read file; do
  echo "Removing: $file"
  rm -f "$file"
done

# Remove old intent understanding files with patterns
echo -e "\nRemoving old intent understanding files..."
rm -f src/core/intent-understanding.ts
rm -f src/core/enhanced-intent-understanding.ts
rm -f src/core/intent-analyzer.ts

# Remove old semantic files with patterns
echo -e "\nRemoving old semantic files..."
rm -f src/core/semantic-intent-engine.ts

# Remove old LLM tool caller (we have clean version)
rm -f src/core/llm-tool-caller.ts

# Remove dynamic system files (replaced by clean system)
rm -f src/core/dynamic-tool-system.ts
rm -f src/core/semantic-intent-matcher.ts

# Remove example files that use old agents
echo -e "\nRemoving old example files..."
rm -f examples/tool-use-examples.ts
rm -f examples/dynamic-system-example.ts

# Create clean examples directory
mkdir -p examples/clean

# Move clean examples
mv examples/clean-tool-use-example.ts examples/clean/ 2>/dev/null || true

echo -e "\n=== Files remaining ==="
echo -e "\nAgents:"
ls -la src/agents/*.ts 2>/dev/null | wc -l

echo -e "\nCore files with 'pattern':"
grep -l "pattern.*=.*\[" src/core/*.ts 2>/dev/null | wc -l

echo -e "\nClean structure:"
tree src/agents -I "node_modules|dist"