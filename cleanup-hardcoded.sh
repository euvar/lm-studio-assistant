#!/bin/bash

echo "=== Cleaning up files with hardcoded patterns ==="

# Files with hardcoded patterns that should be removed
OLD_AGENTS=(
  "src/agents/code-agent.ts"
  "src/agents/file-agent.ts"
  "src/agents/search-agent.ts"
  "src/agents/conversational-agent.ts"
  "src/agents/orchestrator-agent.ts"
  "src/agents/smart-project-agent.ts"
  "src/agents/universal-orchestrator.ts"
  "src/agents/semantic-code-agent.ts"
)

# Move them to a backup directory
mkdir -p src/agents/old-with-patterns

for file in "${OLD_AGENTS[@]}"; do
  if [ -f "$file" ]; then
    echo "Moving $file to backup..."
    mv "$file" "src/agents/old-with-patterns/$(basename $file)"
  fi
done

echo ""
echo "Clean agents without patterns:"
ls -la src/agents/*clean*.ts src/agents/*-system*.ts src/agents/*-execution*.ts 2>/dev/null

echo ""
echo "Remaining agent files:"
find src/agents -name "*.ts" -type f | grep -v old-with-patterns | sort