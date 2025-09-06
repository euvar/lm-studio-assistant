import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './base.js';
import { globby } from 'globby';

interface ProjectAnalysis {
  name: string;
  type: string;
  structure: {
    directories: number;
    files: {
      total: number;
      byType: Record<string, number>;
    };
  };
  languages: string[];
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  description?: string;
  features: string[];
  size: {
    total: string;
    lines: number;
  };
}

export const analyzeProjectTool: Tool = {
  name: 'analyzeProject',
  description: 'Analyze a project structure and provide insights',
  async execute(params: { path?: string }): Promise<ToolResult> {
    try {
      const projectPath = path.resolve(params.path || '.');
      const analysis = await analyzeProject(projectPath);
      
      return {
        success: true,
        data: formatProjectAnalysis(analysis),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to analyze project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: path.basename(projectPath),
    type: 'unknown',
    structure: {
      directories: 0,
      files: {
        total: 0,
        byType: {}
      }
    },
    languages: [],
    features: [],
    size: {
      total: '0',
      lines: 0
    }
  };

  // Check for package.json
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    analysis.type = 'Node.js/JavaScript';
    analysis.description = packageJson.description;
    analysis.dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    analysis.scripts = packageJson.scripts;
    
    // Detect project type from dependencies
    if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
      analysis.type = 'React';
      analysis.features.push('React framework');
    }
    if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
      analysis.type = 'Vue.js';
      analysis.features.push('Vue.js framework');
    }
    if (packageJson.dependencies?.express) {
      analysis.features.push('Express.js server');
    }
    if (packageJson.devDependencies?.typescript) {
      analysis.features.push('TypeScript support');
      analysis.languages.push('TypeScript');
    }
  } catch (e) {
    // Not a Node.js project
  }

  // Check for other project types
  const files = await globby('**/*', {
    cwd: projectPath,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    onlyFiles: true,
  });

  // Analyze files
  let totalSize = 0;
  let totalLines = 0;
  const languageExtensions: Record<string, string> = {
    '.py': 'Python',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.jsx': 'React JSX',
    '.tsx': 'React TSX',
    '.java': 'Java',
    '.cpp': 'C++',
    '.c': 'C',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.cs': 'C#',
  };

  for (const file of files) {
    const ext = path.extname(file);
    const filePath = path.join(projectPath, file);
    
    try {
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      
      if (stats.size < 1000000) { // Skip files larger than 1MB for line counting
        const content = await fs.readFile(filePath, 'utf-8');
        totalLines += content.split('\n').length;
      }
    } catch (e) {
      // Skip files we can't read
    }

    // Count by extension
    if (ext) {
      analysis.structure.files.byType[ext] = (analysis.structure.files.byType[ext] || 0) + 1;
      
      // Detect languages
      const lang = languageExtensions[ext];
      if (lang && !analysis.languages.includes(lang)) {
        analysis.languages.push(lang);
      }
    }
  }

  analysis.structure.files.total = files.length;
  
  // Count directories
  const dirs = await globby('**/', {
    cwd: projectPath,
    ignore: ['node_modules/**', '.git/**'],
  });
  analysis.structure.directories = dirs.length;

  // Format size
  if (totalSize < 1024) {
    analysis.size.total = `${totalSize} bytes`;
  } else if (totalSize < 1024 * 1024) {
    analysis.size.total = `${(totalSize / 1024).toFixed(1)} KB`;
  } else {
    analysis.size.total = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  analysis.size.lines = totalLines;

  // Detect more features
  const fileSet = new Set(files.map((f: string) => path.basename(f)));
  
  if (fileSet.has('tsconfig.json')) analysis.features.push('TypeScript configuration');
  if (fileSet.has('.eslintrc.js') || fileSet.has('.eslintrc.json')) analysis.features.push('ESLint configuration');
  if (fileSet.has('webpack.config.js')) analysis.features.push('Webpack bundler');
  if (fileSet.has('Dockerfile')) analysis.features.push('Docker support');
  if (fileSet.has('.gitignore')) analysis.features.push('Git version control');
  if (fileSet.has('README.md')) analysis.features.push('Documentation');
  if (fileSet.has('.github/workflows')) analysis.features.push('GitHub Actions CI/CD');

  // Detect Python project
  if (fileSet.has('requirements.txt') || fileSet.has('setup.py') || fileSet.has('pyproject.toml')) {
    if (analysis.type === 'unknown') analysis.type = 'Python';
    analysis.features.push('Python project');
  }

  return analysis;
}

function formatProjectAnalysis(analysis: ProjectAnalysis): string {
  let output = `📊 Project Analysis: ${analysis.name}\n`;
  output += `${'='.repeat(50)}\n\n`;
  
  output += `📁 Type: ${analysis.type}\n`;
  if (analysis.description) {
    output += `📝 Description: ${analysis.description}\n`;
  }
  output += `\n`;

  output += `📂 Structure:\n`;
  output += `   - Directories: ${analysis.structure.directories}\n`;
  output += `   - Total files: ${analysis.structure.files.total}\n`;
  output += `   - Size: ${analysis.size.total} (${analysis.size.lines.toLocaleString()} lines)\n\n`;

  if (analysis.languages.length > 0) {
    output += `💻 Languages: ${analysis.languages.join(', ')}\n\n`;
  }

  output += `📄 File Types:\n`;
  const sortedTypes = Object.entries(analysis.structure.files.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  for (const [ext, count] of sortedTypes) {
    output += `   ${ext}: ${count} files\n`;
  }
  output += '\n';

  if (analysis.features.length > 0) {
    output += `✨ Features:\n`;
    for (const feature of analysis.features) {
      output += `   - ${feature}\n`;
    }
    output += '\n';
  }

  if (analysis.scripts) {
    output += `📜 Available Scripts:\n`;
    for (const [name, command] of Object.entries(analysis.scripts)) {
      output += `   - npm run ${name}: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}\n`;
    }
    output += '\n';
  }

  if (analysis.dependencies) {
    const depCount = Object.keys(analysis.dependencies).length;
    output += `📦 Dependencies: ${depCount} packages\n`;
    if (depCount > 0 && depCount <= 20) {
      const mainDeps = Object.entries(analysis.dependencies).slice(0, 10);
      for (const [pkg, version] of mainDeps) {
        output += `   - ${pkg}: ${version}\n`;
      }
      if (depCount > 10) {
        output += `   ... and ${depCount - 10} more\n`;
      }
    }
  }

  return output;
}