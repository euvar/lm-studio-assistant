# LM Studio Assistant

Advanced AI assistant with pure semantic understanding, built for production use with LM Studio.

## 🚀 Key Features

- **100% Semantic Understanding** - No regex or hardcoded patterns, pure LLM-based intent recognition
- **Multi-Agent Architecture** - Supervisor pattern with specialized agents for different tasks
- **Production Ready** - Enterprise-grade error handling, caching, monitoring, and security
- **Multi-Modal Support** - Process text, images, audio, video, and documents
- **Advanced Reasoning** - ReAct pattern implementation for complex problem solving
- **Vector Memory** - Semantic search and context-aware retrieval
- **Local Execution** - Runs entirely on your machine with LM Studio

## Prerequisites

- Node.js 18+
- LM Studio with at least one model loaded
- TypeScript 5.0+

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lm-studio-assistant.git
cd lm-studio-assistant

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

1. Start LM Studio and load a model
2. Run the assistant:
   ```bash
   npm start
   ```
3. Select a model from the list
4. Start chatting!

### Example Usage

Simply type your requests naturally:
- "Help me understand this error message"
- "Search for information about React hooks"
- "Create a Python script for data analysis"
- "Analyze the performance of my application"
- "Fix the bug in my code"

## Configuration

Create a `.env` file from the example:
```bash
cp .env.example .env
```

Key settings:
- `LM_STUDIO_URL` - LM Studio API endpoint (default: http://localhost:1234/v1)
- `ENABLE_CACHE` - Enable response caching for performance
- `MAX_CONCURRENT_REQUESTS` - Limit concurrent LLM requests
- `ENABLE_SECURITY_VALIDATION` - Enable security features

See `.env.example` for all configuration options.

## Docker Support

```bash
# Quick start with Docker Compose
docker-compose up -d

# Or build manually
docker build -t lm-studio-assistant .
docker run -p 3000:3000 lm-studio-assistant
```

## Architecture

Production-ready architecture featuring:
- **Semantic Intent Engine** - Pure LLM-based understanding
- **Multi-Agent System** - Coordinated specialized agents
- **LLM Router** - Multi-model support with fallback
- **Vector Store** - Semantic memory and search
- **Performance Optimizer** - Caching, batching, and request optimization
- **Security Layer** - OWASP Top 10 for LLMs compliance

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first.