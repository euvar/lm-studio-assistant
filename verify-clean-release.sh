#!/bin/bash

echo "🔍 LM Studio Assistant - Clean Release Verification"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for command patterns in code
echo -e "\n📋 Checking for hardcoded command patterns..."
# Look for regex patterns with command alternatives (|) that include Russian/English commands
COMMAND_PATTERN_COUNT=$(grep -r "regex:.*\/.*[а-я].*\|" src/ --include="*.ts" 2>/dev/null | wc -l)
COMMAND_PATTERN_COUNT2=$(grep -r "\/[а-я].*\|.*\/i" src/ --include="*.ts" 2>/dev/null | wc -l)
TOTAL_CMD_PATTERNS=$((COMMAND_PATTERN_COUNT + COMMAND_PATTERN_COUNT2))

if [ $TOTAL_CMD_PATTERNS -eq 0 ]; then
    echo -e "${GREEN}✓ No hardcoded command patterns found${NC}"
else
    echo -e "${RED}✗ Found $TOTAL_CMD_PATTERNS files with command patterns${NC}"
    grep -r "regex:.*\/.*[а-я].*\|" src/ --include="*.ts"
    grep -r "\/[а-я].*\|.*\/i" src/ --include="*.ts"
fi

# Check for regex patterns in agents
echo -e "\n📋 Checking for regex patterns in agents..."
REGEX_COUNT=$(grep -r "\/.*|.*\/" src/agents/ --include="*.ts" 2>/dev/null | wc -l)
if [ $REGEX_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ No regex patterns found in agents${NC}"
else
    echo -e "${RED}✗ Found $REGEX_COUNT regex patterns in agents${NC}"
    grep -r "\/.*|.*\/" src/agents/ --include="*.ts"
fi

# Check for old agent files
echo -e "\n📋 Checking for old agent files..."
OLD_AGENTS=("code-agent.ts" "file-agent.ts" "search-agent.ts" "conversational-agent.ts" "orchestrator-agent.ts" "smart-project-agent.ts")
FOUND_OLD=0
for agent in "${OLD_AGENTS[@]}"; do
    if [ -f "src/agents/$agent" ]; then
        echo -e "${RED}✗ Found old agent: $agent${NC}"
        FOUND_OLD=$((FOUND_OLD + 1))
    fi
done
if [ $FOUND_OLD -eq 0 ]; then
    echo -e "${GREEN}✓ No old agent files found${NC}"
fi

# Check clean architecture files exist
echo -e "\n📋 Checking clean architecture files..."
CLEAN_FILES=("src/core/clean-tool-system.ts" "src/agents/clean-agent.ts" "src/agents/clean-orchestrator.ts" "src/types/tool-definitions.ts")
MISSING_CLEAN=0
for file in "${CLEAN_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ Missing clean file: $file${NC}"
        MISSING_CLEAN=$((MISSING_CLEAN + 1))
    fi
done
if [ $MISSING_CLEAN -eq 0 ]; then
    echo -e "${GREEN}✓ All clean architecture files present${NC}"
fi

# Check for build
echo -e "\n📋 Checking build..."
if [ -d "dist" ]; then
    echo -e "${GREEN}✓ Build directory exists${NC}"
else
    echo -e "${RED}✗ Build directory missing - run 'npm run build'${NC}"
fi

# Summary
echo -e "\n📊 Summary"
echo "=========="
TOTAL_ISSUES=$((TOTAL_CMD_PATTERNS + REGEX_COUNT + FOUND_OLD + MISSING_CLEAN))
if [ $TOTAL_ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for release.${NC}"
else
    echo -e "${RED}❌ Found $TOTAL_ISSUES issues. Please fix before release.${NC}"
fi

echo -e "\n📦 Package Info:"
echo "==============="
grep '"version"' package.json | head -1
echo ""