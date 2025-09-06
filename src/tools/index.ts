import { Tool } from './base.js';
import { readFileTool, writeFileTool, listFilesTool, deleteFileTool, editFileTool, appendToFileTool } from './filesystem.js';
import { webSearchTool, fetchWebPageTool } from './websearch.js';
import { bashTool } from './bash.js';
import { gitStatusTool, gitCommitTool, gitLogTool, gitDiffTool, gitBranchTool } from './git.js';
import { fileBrowserTool } from './file-browser.js';
import { codeRunnerTool, pythonSandboxTool, jsSandboxTool } from './code-runner.js';
import { analyzeErrorTool, runJavaScriptTool, fixSyntaxErrorTool } from './error-analyzer.js';
import { analyzeProjectTool } from './project-analyzer.js';
import { RubySandbox, GoSandbox, PythonSandbox, RustSandbox, CSharpSandbox } from './language-sandboxes.js';
import { CodeReviewTool, GitReviewTool } from './code-review.js';
import { ProjectTemplateTool, TemplateWizardTool } from './project-template.js';
import { PerformanceProfilerTool, CodeOptimizerTool, BenchmarkTool } from './performance-profiler.js';
import { SecurityScannerTool, VulnerabilityFixerTool } from './security-scanner.js';
import { semanticSearchTool, indexContentTool, indexDirectoryTool, findSimilarTool, vectorDBStatsTool, clearVectorDBTool } from './semantic-search.js';
import { advancedWebScrapeTool, extractTableDataTool, fillFormTool, captureNetworkTool } from './web-scraper.js';
import { ocrTool, processImageTool, analyzeImageTool, screenshotToTextTool, convertImageFormatTool } from './image-processing.js';
import { diagramGeneratorTool } from './diagram-generator.js';
import { youtubeTranscriptTool, youtubeLearningTool } from './youtube-transcript.js';
import { stackOverflowTool, solutionFinderTool } from './stackoverflow-integration.js';
import { minimapTool, quickNavTool } from './minimap-tool.js';
import { editorModeTool, vimCommandTool } from './editor-mode-tool.js';

export * from './base.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // Register default tools
    this.register(readFileTool);
    this.register(writeFileTool);
    this.register(editFileTool);
    this.register(appendToFileTool);
    this.register(listFilesTool);
    this.register(deleteFileTool);
    this.register(webSearchTool);
    this.register(fetchWebPageTool);
    this.register(bashTool);
    
    // Git tools
    this.register(gitStatusTool);
    this.register(gitCommitTool);
    this.register(gitLogTool);
    this.register(gitDiffTool);
    this.register(gitBranchTool);
    
    
    // File browser
    this.register(fileBrowserTool);
    
    // Code execution
    this.register(codeRunnerTool);
    this.register(pythonSandboxTool);
    this.register(jsSandboxTool);
    
    // Error analysis
    this.register(analyzeErrorTool);
    this.register(runJavaScriptTool);
    this.register(fixSyntaxErrorTool);
    
    // Project analysis
    this.register(analyzeProjectTool);
    
    // Language sandboxes
    this.register(new RubySandbox());
    this.register(new GoSandbox());
    this.register(new PythonSandbox());
    this.register(new RustSandbox());
    this.register(new CSharpSandbox());
    
    // Code review
    this.register(new CodeReviewTool());
    this.register(new GitReviewTool());
    
    // Project templates
    this.register(new ProjectTemplateTool());
    this.register(new TemplateWizardTool());
    
    // Performance profiling
    this.register(new PerformanceProfilerTool());
    this.register(new CodeOptimizerTool());
    this.register(new BenchmarkTool());
    
    // Security scanning
    this.register(new SecurityScannerTool());
    this.register(new VulnerabilityFixerTool());
    
    // Semantic search and vector database
    this.register(semanticSearchTool);
    this.register(indexContentTool);
    this.register(indexDirectoryTool);
    this.register(findSimilarTool);
    this.register(vectorDBStatsTool);
    this.register(clearVectorDBTool);
    
    // Advanced web scraping
    this.register(advancedWebScrapeTool);
    this.register(extractTableDataTool);
    this.register(fillFormTool);
    this.register(captureNetworkTool);
    
    // Image processing and OCR
    this.register(ocrTool);
    this.register(processImageTool);
    this.register(analyzeImageTool);
    this.register(screenshotToTextTool);
    this.register(convertImageFormatTool);
    
    // Diagram generation
    this.register(diagramGeneratorTool);
    
    // YouTube transcript extraction
    this.register(youtubeTranscriptTool);
    this.register(youtubeLearningTool);
    
    // Stack Overflow integration
    this.register(stackOverflowTool);
    this.register(solutionFinderTool);
    
    // Minimap navigation
    this.register(minimapTool);
    this.register(quickNavTool);
    
    // Editor modes
    this.register(editorModeTool);
    this.register(vimCommandTool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDescriptions(): string {
    return this.getAll()
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}