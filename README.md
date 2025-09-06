# LM Studio Assistant

Your local AI assistant for programming - like Claude Code, but running entirely on your computer!

## Features

- 🤖 **100% Local AI** - Works with LM Studio models running on your machine
- 🛠️ **Smart Agent System** - Multiple specialized agents for different tasks
- 📁 **File Management** - Create, edit, read, and delete files
- 🔍 **Web Search** - Search the internet for solutions
- 🐛 **Error Analysis** - Automatically fix code errors
- 🖼️ **Image Processing** - OCR, analysis, and format conversion
- 📊 **Vector Database** - Semantic search with ChromaDB or in-memory fallback
- 🔧 **Performance Optimization** - Built-in monitoring and optimization
- 🎯 **Git Integration** - Smart hooks and commit management
- 🧪 **Advanced Debugging** - AI-powered debugging with profiling

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

### Example Commands

- "Create an Express server"
- "Fix the syntax error in my code"
- "Search for the latest React documentation"
- "Analyze this image and extract text"
- "Generate a flowchart for this algorithm"

## Configuration

The assistant will automatically create a `.lm-assistant` directory for storing:
- Memory and context
- Vector database
- Temporary files

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test
```

## Architecture

The assistant uses a modular architecture with:
- **Agents**: Specialized handlers for different types of requests
- **Tools**: Reusable functions for specific tasks
- **Core Systems**: Performance optimization, error recovery, context management

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first.