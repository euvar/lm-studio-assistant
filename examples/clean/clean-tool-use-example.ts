/**
 * Clean Tool Use Example
 * Demonstrates proper LLM tool calling without any hardcoded patterns
 */

import { LMStudioProvider } from '../src/providers/lmstudio.js';
import { AgentRegistry } from '../src/agents/agent-registry.js';
import { CleanOrchestrator } from '../src/agents/clean-orchestrator.js';
import { WebSearchAgent } from '../src/agents/web-search-agent.js';
import { FileSystemAgent } from '../src/agents/file-system-agent.js';
import { CodeExecutionAgent } from '../src/agents/code-execution-agent.js';

async function demonstrateCleanToolUse() {
  console.log('=== Clean Tool Use Demo ===\n');
  
  // Initialize
  const provider = new LMStudioProvider();
  const registry = new AgentRegistry();
  
  // Register agents
  registry.register(new WebSearchAgent());
  registry.register(new FileSystemAgent());
  registry.register(new CodeExecutionAgent());
  
  // Create orchestrator
  const orchestrator = new CleanOrchestrator(provider, registry);
  
  // Show available tools
  console.log('Available tools:');
  const agents = registry.getAllAgents();
  for (const agent of agents) {
    const tools = agent.getToolDefinitions();
    for (const tool of tools) {
      console.log(`- ${tool.name}: ${tool.description}`);
    }
  }
  
  // Test various requests
  const testRequests = [
    'What is the weather in London?',
    'Show me the files in the current directory',
    'Create a file named hello.txt with content "Hello World"',
    'Run the command "echo Hello from bash"',
    'Read the package.json file',
    'Search for information about TypeScript',
    'Analyze this project'
  ];
  
  console.log('\n=== Processing Requests ===\n');
  
  for (const request of testRequests) {
    console.log(`\nUser: "${request}"`);
    
    const context = {
      userInput: request,
      conversationHistory: [],
      availableTools: []
    };
    
    const response = await orchestrator.process(context);
    
    console.log('Response:', JSON.stringify(response, null, 2));
  }
}

// Simple tool calling example
async function minimalExample() {
  console.log('\n=== Minimal Tool Use Example ===\n');
  
  const provider = new LMStudioProvider();
  
  // Define a simple tool
  const weatherTool = {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object' as const,
      properties: {
        location: {
          type: 'string',
          description: 'The city name'
        }
      },
      required: ['location']
    }
  };
  
  // System message explaining tool use
  const messages = [
    {
      role: 'system' as const,
      content: `You have access to this tool: ${JSON.stringify(weatherTool)}
      
When you need to use it, respond with:
{"toolCall": {"name": "get_weather", "arguments": {"location": "city_name"}}}`
    },
    {
      role: 'user' as const,
      content: 'What is the weather in Paris?'
    }
  ];
  
  // Get LLM response
  const response = await provider.chat(messages);
  console.log('LLM Response:', response.content);
  
  try {
    const parsed = JSON.parse(response.content);
    if (parsed.toolCall) {
      console.log('Tool to call:', parsed.toolCall.name);
      console.log('Arguments:', parsed.toolCall.arguments);
      
      // Here you would execute the actual tool
      // For demo, just show what would be called
      console.log('Would execute: get_weather(' + 
        JSON.stringify(parsed.toolCall.arguments) + ')');
    }
  } catch (e) {
    console.log('Response was not a tool call');
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCleanToolUse()
    .then(() => minimalExample())
    .catch(console.error);
}