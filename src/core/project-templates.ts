import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as yaml from 'yaml';

const execAsync = promisify(exec);

interface TemplateConfig {
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  author: string;
  version: string;
  requirements?: string[];
  variables: TemplateVariable[];
  scripts?: TemplateScripts;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'choice';
  default?: any;
  required?: boolean;
  choices?: string[];
  validation?: string; // Regex pattern for validation
}

interface TemplateScripts {
  preInstall?: string;
  postInstall?: string;
  configure?: string;
  start?: string;
  build?: string;
  test?: string;
}

enum TemplateCategory {
  WebApp = 'webapp',
  API = 'api',
  CLI = 'cli',
  Library = 'library',
  Mobile = 'mobile',
  Desktop = 'desktop',
  Microservice = 'microservice',
  FullStack = 'fullstack',
  DataScience = 'datascience',
  IoT = 'iot',
  Game = 'game',
  Blockchain = 'blockchain'
}

interface ProjectTemplate {
  id: string;
  config: TemplateConfig;
  path: string;
  files: Map<string, string | ((vars: any) => string)>;
  isBuiltIn: boolean;
  createdAt: Date;
  usageCount: number;
}

interface GenerateOptions {
  name: string;
  directory: string;
  variables: Record<string, any>;
  skipInstall?: boolean;
  skipGit?: boolean;
  interactive?: boolean;
}

export class ProjectTemplateSystem extends EventEmitter {
  private templates: Map<string, ProjectTemplate> = new Map();
  private templatesDir: string;
  private customTemplatesDir: string;
  
  constructor(baseDir: string = process.cwd()) {
    super();
    this.templatesDir = path.join(baseDir, '.lm-assistant', 'templates');
    this.customTemplatesDir = path.join(baseDir, '.lm-assistant', 'custom-templates');
    this.initializeBuiltInTemplates();
  }

  private async initializeBuiltInTemplates() {
    // React TypeScript Template
    await this.registerBuiltInTemplate({
      id: 'react-typescript',
      config: {
        name: 'React TypeScript App',
        description: 'Modern React application with TypeScript, Vite, and best practices',
        category: TemplateCategory.WebApp,
        tags: ['react', 'typescript', 'vite', 'frontend'],
        author: 'LM Studio Assistant',
        version: '1.0.0',
        variables: [
          {
            name: 'appName',
            description: 'Application name',
            type: 'string',
            required: true,
            validation: '^[a-zA-Z0-9-_]+$'
          },
          {
            name: 'includeRouter',
            description: 'Include React Router',
            type: 'boolean',
            default: true
          },
          {
            name: 'stateManagement',
            description: 'State management solution',
            type: 'choice',
            choices: ['none', 'redux', 'zustand', 'mobx'],
            default: 'none'
          },
          {
            name: 'cssFramework',
            description: 'CSS framework',
            type: 'choice',
            choices: ['none', 'tailwind', 'styled-components', 'emotion'],
            default: 'tailwind'
          },
          {
            name: 'testingLibrary',
            description: 'Testing setup',
            type: 'choice',
            choices: ['none', 'jest', 'vitest'],
            default: 'vitest'
          }
        ],
        scripts: {
          postInstall: 'npm run format && npm run lint:fix',
          start: 'npm run dev',
          build: 'npm run build',
          test: 'npm run test'
        },
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          '@types/react': '^18.2.0',
          '@types/react-dom': '^18.2.0',
          '@vitejs/plugin-react': '^4.0.0',
          'typescript': '^5.0.0',
          'vite': '^4.3.0',
          'eslint': '^8.40.0',
          'prettier': '^2.8.0'
        }
      },
      files: new Map([
        ['package.json', this.generateReactPackageJson],
        ['tsconfig.json', this.generateTsConfig],
        ['vite.config.ts', this.generateViteConfig],
        ['src/main.tsx', this.generateReactMain],
        ['src/App.tsx', this.generateReactApp],
        ['src/index.css', this.generateReactStyles],
        ['.eslintrc.json', this.generateEslintConfig],
        ['.prettierrc', this.generatePrettierConfig],
        ['README.md', this.generateReadme]
      ])
    });

    // Express TypeScript API Template
    await this.registerBuiltInTemplate({
      id: 'express-typescript-api',
      config: {
        name: 'Express TypeScript API',
        description: 'RESTful API with Express, TypeScript, and best practices',
        category: TemplateCategory.API,
        tags: ['express', 'typescript', 'api', 'backend'],
        author: 'LM Studio Assistant',
        version: '1.0.0',
        variables: [
          {
            name: 'apiName',
            description: 'API name',
            type: 'string',
            required: true
          },
          {
            name: 'database',
            description: 'Database type',
            type: 'choice',
            choices: ['none', 'mongodb', 'postgresql', 'mysql', 'sqlite'],
            default: 'none'
          },
          {
            name: 'authentication',
            description: 'Authentication method',
            type: 'choice',
            choices: ['none', 'jwt', 'oauth2'],
            default: 'jwt'
          },
          {
            name: 'includeDocker',
            description: 'Include Docker configuration',
            type: 'boolean',
            default: true
          }
        ],
        scripts: {
          start: 'npm run dev',
          build: 'npm run build',
          test: 'npm run test'
        },
        dependencies: {
          'express': '^4.18.0',
          'cors': '^2.8.5',
          'helmet': '^7.0.0',
          'dotenv': '^16.0.0'
        },
        devDependencies: {
          '@types/express': '^4.17.0',
          '@types/node': '^20.0.0',
          'typescript': '^5.0.0',
          'ts-node-dev': '^2.0.0',
          'jest': '^29.0.0',
          '@types/jest': '^29.0.0'
        }
      },
      files: new Map([
        ['package.json', this.generateExpressPackageJson],
        ['tsconfig.json', this.generateTsConfig],
        ['src/index.ts', this.generateExpressIndex],
        ['src/app.ts', this.generateExpressApp],
        ['src/routes/index.ts', this.generateExpressRoutes],
        ['src/middleware/error.ts', this.generateErrorMiddleware],
        ['src/config/index.ts', this.generateConfig],
        ['.env.example', this.generateEnvExample],
        ['Dockerfile', this.generateDockerfile],
        ['docker-compose.yml', this.generateDockerCompose],
        ['README.md', this.generateReadme]
      ])
    });

    // CLI Tool Template
    await this.registerBuiltInTemplate({
      id: 'cli-tool',
      config: {
        name: 'CLI Tool',
        description: 'Command-line tool with TypeScript and commander.js',
        category: TemplateCategory.CLI,
        tags: ['cli', 'typescript', 'commander', 'tool'],
        author: 'LM Studio Assistant',
        version: '1.0.0',
        variables: [
          {
            name: 'toolName',
            description: 'CLI tool name',
            type: 'string',
            required: true,
            validation: '^[a-z][a-z0-9-]*$'
          },
          {
            name: 'description',
            description: 'Tool description',
            type: 'string',
            required: true
          },
          {
            name: 'interactive',
            description: 'Include interactive prompts',
            type: 'boolean',
            default: true
          }
        ],
        dependencies: {
          'commander': '^11.0.0',
          'chalk': '^5.3.0',
          'ora': '^7.0.0'
        },
        devDependencies: {
          '@types/node': '^20.0.0',
          'typescript': '^5.0.0',
          'esbuild': '^0.19.0'
        }
      },
      files: new Map([
        ['package.json', this.generateCliPackageJson],
        ['tsconfig.json', this.generateTsConfig],
        ['src/index.ts', this.generateCliIndex],
        ['src/commands/index.ts', this.generateCliCommands],
        ['README.md', this.generateReadme]
      ])
    });

    // Python FastAPI Template
    await this.registerBuiltInTemplate({
      id: 'python-fastapi',
      config: {
        name: 'FastAPI Application',
        description: 'Modern Python API with FastAPI, async support, and type hints',
        category: TemplateCategory.API,
        tags: ['python', 'fastapi', 'api', 'async'],
        author: 'LM Studio Assistant',
        version: '1.0.0',
        variables: [
          {
            name: 'projectName',
            description: 'Project name',
            type: 'string',
            required: true,
            validation: '^[a-z][a-z0-9_]*$'
          },
          {
            name: 'includeDatabase',
            description: 'Include database setup',
            type: 'boolean',
            default: true
          },
          {
            name: 'includeAuth',
            description: 'Include authentication',
            type: 'boolean',
            default: true
          }
        ],
        scripts: {
          postInstall: 'python -m venv venv && . venv/bin/activate && pip install -r requirements.txt',
          start: 'uvicorn main:app --reload',
          test: 'pytest'
        }
      },
      files: new Map([
        ['requirements.txt', this.generatePythonRequirements],
        ['main.py', this.generateFastAPIMain],
        ['app/__init__.py', () => ''],
        ['app/routes/__init__.py', () => ''],
        ['app/routes/health.py', this.generateHealthRoute],
        ['app/models/__init__.py', () => ''],
        ['app/config.py', this.generatePythonConfig],
        ['tests/__init__.py', () => ''],
        ['tests/test_main.py', this.generatePythonTests],
        ['.gitignore', this.generatePythonGitignore],
        ['README.md', this.generateReadme]
      ])
    });

    // Next.js Full Stack Template
    await this.registerBuiltInTemplate({
      id: 'nextjs-fullstack',
      config: {
        name: 'Next.js Full Stack App',
        description: 'Full-stack application with Next.js 14, TypeScript, and Tailwind CSS',
        category: TemplateCategory.FullStack,
        tags: ['nextjs', 'react', 'typescript', 'fullstack', 'tailwind'],
        author: 'LM Studio Assistant',
        version: '1.0.0',
        variables: [
          {
            name: 'projectName',
            description: 'Project name',
            type: 'string',
            required: true
          },
          {
            name: 'appRouter',
            description: 'Use App Router (recommended)',
            type: 'boolean',
            default: true
          },
          {
            name: 'database',
            description: 'Database ORM',
            type: 'choice',
            choices: ['none', 'prisma', 'drizzle'],
            default: 'prisma'
          },
          {
            name: 'authentication',
            description: 'Authentication provider',
            type: 'choice',
            choices: ['none', 'next-auth', 'clerk'],
            default: 'next-auth'
          }
        ],
        scripts: {
          postInstall: 'npm run lint:fix && npm run format',
          start: 'npm run dev',
          build: 'npm run build',
          test: 'npm run test'
        }
      },
      files: new Map([
        ['package.json', this.generateNextjsPackageJson],
        ['tsconfig.json', this.generateTsConfig],
        ['next.config.js', this.generateNextConfig],
        ['tailwind.config.js', this.generateTailwindConfig],
        ['app/layout.tsx', this.generateNextLayout],
        ['app/page.tsx', this.generateNextPage],
        ['app/globals.css', this.generateGlobalStyles],
        ['.env.example', this.generateEnvExample],
        ['README.md', this.generateReadme]
      ])
    });
  }

  // Register a built-in template
  private async registerBuiltInTemplate(template: Omit<ProjectTemplate, 'createdAt' | 'usageCount' | 'isBuiltIn' | 'path'>) {
    const fullTemplate: ProjectTemplate = {
      ...template,
      path: path.join(this.templatesDir, template.id),
      isBuiltIn: true,
      createdAt: new Date(),
      usageCount: 0
    };
    
    this.templates.set(template.id, fullTemplate);
  }

  // Load custom templates
  async loadCustomTemplates() {
    try {
      await fs.mkdir(this.customTemplatesDir, { recursive: true });
      const entries = await fs.readdir(this.customTemplatesDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const templatePath = path.join(this.customTemplatesDir, entry.name);
          const configPath = path.join(templatePath, 'template.yaml');
          
          try {
            const configContent = await fs.readFile(configPath, 'utf-8');
            const config = yaml.parse(configContent) as TemplateConfig;
            
            // Load template files
            const files = new Map<string, string>();
            await this.loadTemplateFiles(templatePath, '', files);
            
            const template: ProjectTemplate = {
              id: entry.name,
              config,
              path: templatePath,
              files,
              isBuiltIn: false,
              createdAt: new Date(),
              usageCount: 0
            };
            
            this.templates.set(entry.name, template);
          } catch (error) {
            console.error(`Failed to load template ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load custom templates:', error);
    }
  }

  // Load template files recursively
  private async loadTemplateFiles(basePath: string, relativePath: string, files: Map<string, string>) {
    const fullPath = path.join(basePath, relativePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        await this.loadTemplateFiles(basePath, entryPath, files);
      } else if (entry.isFile() && entry.name !== 'template.yaml') {
        const content = await fs.readFile(path.join(basePath, entryPath), 'utf-8');
        files.set(entryPath, content);
      }
    }
  }

  // Create a new custom template from existing project
  async createTemplateFromProject(projectPath: string, templateId: string, config: TemplateConfig) {
    const templatePath = path.join(this.customTemplatesDir, templateId);
    
    try {
      // Create template directory
      await fs.mkdir(templatePath, { recursive: true });
      
      // Save template config
      const configPath = path.join(templatePath, 'template.yaml');
      await fs.writeFile(configPath, yaml.stringify(config));
      
      // Copy project files
      await this.copyProjectFiles(projectPath, templatePath);
      
      // Load the new template
      const files = new Map<string, string>();
      await this.loadTemplateFiles(templatePath, '', files);
      
      const template: ProjectTemplate = {
        id: templateId,
        config,
        path: templatePath,
        files,
        isBuiltIn: false,
        createdAt: new Date(),
        usageCount: 0
      };
      
      this.templates.set(templateId, template);
      
      this.emit('templateCreated', { templateId, config });
      
      return template;
    } catch (error) {
      throw new Error(`Failed to create template: ${error}`);
    }
  }

  // Copy project files for template
  private async copyProjectFiles(src: string, dest: string) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // Skip certain directories and files
      if (['node_modules', '.git', 'dist', 'build', '.env'].includes(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyProjectFiles(srcPath, destPath);
      } else if (entry.isFile()) {
        const content = await fs.readFile(srcPath, 'utf-8');
        // Replace common patterns with template variables
        const templatedContent = this.templatizeContent(content);
        await fs.writeFile(destPath, templatedContent);
      }
    }
  }

  // Convert content to use template variables
  private templatizeContent(content: string): string {
    // Replace common patterns with template variables
    return content
      .replace(/my-app|myapp|MyApp/gi, '{{appName}}')
      .replace(/my-project|myproject|MyProject/gi, '{{projectName}}')
      .replace(/localhost:\d+/g, '{{host}}:{{port}}')
      .replace(/[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}/g, '{{email}}');
  }

  // Generate project from template
  async generateProject(templateId: string, options: GenerateOptions): Promise<string> {
    const template = this.templates.get(templateId);
    
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }
    
    const projectPath = path.join(options.directory, options.name);
    
    try {
      // Create project directory
      await fs.mkdir(projectPath, { recursive: true });
      
      // Process and create files
      for (const [filePath, content] of template.files) {
        const fullPath = path.join(projectPath, filePath);
        const dir = path.dirname(fullPath);
        
        await fs.mkdir(dir, { recursive: true });
        
        // Process content (either function or string)
        let processedContent: string;
        if (typeof content === 'function') {
          processedContent = content(options.variables);
        } else {
          processedContent = this.processTemplate(content, options.variables);
        }
        
        await fs.writeFile(fullPath, processedContent);
      }
      
      // Run pre-install script
      if (template.config.scripts?.preInstall) {
        await this.runScript(template.config.scripts.preInstall, projectPath);
      }
      
      // Install dependencies
      if (!options.skipInstall) {
        await this.installDependencies(projectPath, template.config);
      }
      
      // Initialize git
      if (!options.skipGit) {
        await this.initializeGit(projectPath);
      }
      
      // Run post-install script
      if (template.config.scripts?.postInstall) {
        await this.runScript(template.config.scripts.postInstall, projectPath);
      }
      
      // Update usage count
      template.usageCount++;
      
      this.emit('projectGenerated', { templateId, projectPath, options });
      
      return projectPath;
    } catch (error) {
      // Clean up on failure
      try {
        await fs.rm(projectPath, { recursive: true, force: true });
      } catch {}
      
      throw new Error(`Failed to generate project: ${error}`);
    }
  }

  // Process template content with variables
  private processTemplate(content: string, variables: Record<string, any>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  // Install project dependencies
  private async installDependencies(projectPath: string, config: TemplateConfig) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    // Check if it's a Node.js project
    try {
      await fs.access(packageJsonPath);
      
      // Detect package manager
      let installCmd = 'npm install';
      
      try {
        await execAsync('pnpm --version');
        installCmd = 'pnpm install';
      } catch {
        try {
          await execAsync('yarn --version');
          installCmd = 'yarn install';
        } catch {}
      }
      
      this.emit('installing', { projectPath, command: installCmd });
      
      await execAsync(installCmd, { cwd: projectPath });
    } catch {
      // Not a Node.js project, check for other dependency files
      const requirementsPath = path.join(projectPath, 'requirements.txt');
      try {
        await fs.access(requirementsPath);
        await execAsync('pip install -r requirements.txt', { cwd: projectPath });
      } catch {}
    }
  }

  // Initialize git repository
  private async initializeGit(projectPath: string) {
    try {
      await execAsync('git init', { cwd: projectPath });
      await execAsync('git add .', { cwd: projectPath });
      await execAsync('git commit -m "Initial commit from template"', { cwd: projectPath });
    } catch (error) {
      console.warn('Failed to initialize git:', error);
    }
  }

  // Run a script in the project directory
  private async runScript(script: string, projectPath: string) {
    try {
      await execAsync(script, { cwd: projectPath });
    } catch (error) {
      console.error(`Failed to run script: ${script}`, error);
    }
  }

  // Get all available templates
  getTemplates(category?: TemplateCategory): ProjectTemplate[] {
    const templates = Array.from(this.templates.values());
    
    if (category) {
      return templates.filter(t => t.config.category === category);
    }
    
    return templates;
  }

  // Search templates
  searchTemplates(query: string): ProjectTemplate[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.templates.values()).filter(template => {
      const config = template.config;
      return (
        config.name.toLowerCase().includes(lowerQuery) ||
        config.description.toLowerCase().includes(lowerQuery) ||
        config.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  // Get template by ID
  getTemplate(templateId: string): ProjectTemplate | undefined {
    return this.templates.get(templateId);
  }

  // Template generation functions (these would return content)
  private generateReactPackageJson(vars: any): string {
    return JSON.stringify({
      name: vars.appName,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
        test: vars.testingLibrary !== 'none' ? `${vars.testingLibrary}` : undefined,
        lint: 'eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
        'lint:fix': 'eslint src --ext ts,tsx --fix',
        format: 'prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"'
      }
    }, null, 2);
  }

  private generateExpressPackageJson(vars: any): string {
    return JSON.stringify({
      name: vars.apiName,
      version: '1.0.0',
      description: 'Express TypeScript API',
      main: 'dist/index.js',
      scripts: {
        dev: 'ts-node-dev --respawn --transpile-only src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
        test: 'jest',
        'test:watch': 'jest --watch'
      }
    }, null, 2);
  }

  private generateCliPackageJson(vars: any): string {
    return JSON.stringify({
      name: vars.toolName,
      version: '1.0.0',
      description: vars.description,
      bin: {
        [vars.toolName]: './dist/index.js'
      },
      scripts: {
        build: 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js --external:./node_modules/*',
        dev: 'ts-node src/index.ts',
        prepublishOnly: 'npm run build'
      }
    }, null, 2);
  }

  private generateNextjsPackageJson(vars: any): string {
    return JSON.stringify({
      name: vars.projectName,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        'lint:fix': 'next lint --fix',
        format: 'prettier --write .',
        test: 'jest',
        'test:watch': 'jest --watch'
      }
    }, null, 2);
  }

  private generateTsConfig(vars: any): string {
    return JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        moduleResolution: 'node',
        allowJs: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    }, null, 2);
  }

  private generateViteConfig(vars: any): string {
    return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})`;
  }

  private generateReactMain(vars: any): string {
    return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`;
  }

  private generateReactApp(vars: any): string {
    const imports = [`import { useState } from 'react'`];
    
    if (vars.includeRouter) {
      imports.push(`import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'`);
    }
    
    return `${imports.join('\n')}

function App() {
  const [count, setCount] = useState(0)

  return (
    ${vars.includeRouter ? '<Router>' : '<>'}
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4">
            <h1 className="text-3xl font-bold text-gray-900">
              ${vars.appName}
            </h1>
          </div>
        </header>
        <main>
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
              <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold mb-4">Welcome to ${vars.appName}</h2>
                  <p className="text-gray-600 mb-4">Count: {count}</p>
                  <button
                    onClick={() => setCount(count + 1)}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Increment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    ${vars.includeRouter ? '</Router>' : '</>'}
  )
}

export default App`;
  }

  private generateReactStyles(vars: any): string {
    if (vars.cssFramework === 'tailwind') {
      return `@tailwind base;
@tailwind components;
@tailwind utilities;`;
    } else {
      return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}`;
    }
  }

  private generateExpressIndex(vars: any): string {
    return `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { errorHandler } from './middleware/error'
import routes from './routes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', routes)

// Error handling
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`)
})

export default app`;
  }

  private generateExpressApp(vars: any): string {
    return `import express from 'express'

const app = express()

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

export default app`;
  }

  private generateExpressRoutes(vars: any): string {
    return `import { Router } from 'express'

const router = Router()

router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ${vars.apiName} API',
    version: '1.0.0'
  })
})

// Add your routes here

export default router`;
  }

  private generateErrorMiddleware(vars: any): string {
    return `import { Request, Response, NextFunction } from 'express'

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message
      }
    })
  }

  console.error(err)
  
  res.status(500).json({
    error: {
      message: 'Internal server error'
    }
  })
}`;
  }

  private generateConfig(vars: any): string {
    return `export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  ${vars.database !== 'none' ? `database: {
    url: process.env.DATABASE_URL || '',
    name: process.env.DATABASE_NAME || '${vars.apiName}'
  },` : ''}
  ${vars.authentication === 'jwt' ? `jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },` : ''}
  cors: {
    origin: process.env.CORS_ORIGIN || '*'
  }
}`;
  }

  private generateEnvExample(vars: any): string {
    const lines = [
      'NODE_ENV=development',
      'PORT=3000'
    ];
    
    if (vars.database && vars.database !== 'none') {
      lines.push('DATABASE_URL=your-database-url');
      lines.push('DATABASE_NAME=your-database-name');
    }
    
    if (vars.authentication === 'jwt') {
      lines.push('JWT_SECRET=your-secret-key');
      lines.push('JWT_EXPIRES_IN=7d');
    }
    
    lines.push('CORS_ORIGIN=http://localhost:3000');
    
    return lines.join('\n');
  }

  private generateDockerfile(vars: any): string {
    return `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]`;
  }

  private generateDockerCompose(vars: any): string {
    const services: any = {
      app: {
        build: '.',
        ports: ['3000:3000'],
        environment: {
          NODE_ENV: 'production'
        }
      }
    };
    
    if (vars.database === 'postgresql') {
      services.postgres = {
        image: 'postgres:15-alpine',
        environment: {
          POSTGRES_USER: 'user',
          POSTGRES_PASSWORD: 'password',
          POSTGRES_DB: vars.apiName
        },
        volumes: ['postgres_data:/var/lib/postgresql/data']
      };
    }
    
    return `version: '3.8'

services:
${Object.entries(services).map(([name, config]) => `  ${name}:
${Object.entries(config as Record<string, any>).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`).join('\n')}
`).join('\n')}

${vars.database === 'postgresql' ? `volumes:
  postgres_data:` : ''}`;
  }

  private generateCliIndex(vars: any): string {
    return `#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { version } from '../package.json'

const program = new Command()

program
  .name('${vars.toolName}')
  .description('${vars.description}')
  .version(version)

program
  .command('hello [name]')
  .description('Say hello')
  .action((name = 'World') => {
    const spinner = ora('Processing...').start()
    setTimeout(() => {
      spinner.succeed(chalk.green(\`Hello, \${name}!\`))
    }, 1000)
  })

// Add more commands here

program.parse()`;
  }

  private generateCliCommands(vars: any): string {
    return `import chalk from 'chalk'

export const commands = {
  hello: (name: string = 'World') => {
    console.log(chalk.blue(\`Hello, \${name}!\`))
  },
  
  // Add more command implementations here
}`;
  }

  private generatePythonRequirements(vars: any): string {
    const deps = [
      'fastapi==0.104.1',
      'uvicorn[standard]==0.24.0',
      'pydantic==2.5.0',
      'python-dotenv==1.0.0'
    ];
    
    if (vars.includeDatabase) {
      deps.push('sqlalchemy==2.0.23');
      deps.push('alembic==1.12.1');
    }
    
    if (vars.includeAuth) {
      deps.push('python-jose[cryptography]==3.3.0');
      deps.push('passlib[bcrypt]==1.7.4');
      deps.push('python-multipart==0.0.6');
    }
    
    deps.push('pytest==7.4.3');
    deps.push('httpx==0.25.2');
    
    return deps.join('\n');
  }

  private generateFastAPIMain(vars: any): string {
    return `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import health
${vars.includeAuth ? 'from app.routes import auth' : ''}
${vars.includeDatabase ? 'from app.database import engine, Base' : ''}

app = FastAPI(title="${vars.projectName} API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

${vars.includeDatabase ? '# Create database tables\nBase.metadata.create_all(bind=engine)\n' : ''}

# Routes
app.include_router(health.router, prefix="/api/health", tags=["health"])
${vars.includeAuth ? 'app.include_router(auth.router, prefix="/api/auth", tags=["auth"])' : ''}

@app.get("/")
async def root():
    return {"message": "Welcome to ${vars.projectName} API"}`;
  }

  private generateHealthRoute(vars: any): string {
    return `from fastapi import APIRouter, status

router = APIRouter()

@router.get("/", status_code=status.HTTP_200_OK)
async def health_check():
    return {
        "status": "healthy",
        "service": "${vars.projectName}",
        "version": "1.0.0"
    }`;
  }

  private generatePythonConfig(vars: any): string {
    return `from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "${vars.projectName}"
    debug: bool = True
    ${vars.includeDatabase ? 'database_url: str = "sqlite:///./app.db"' : ''}
    ${vars.includeAuth ? 'secret_key: str = "your-secret-key-here"\n    algorithm: str = "HS256"\n    access_token_expire_minutes: int = 30' : ''}
    
    class Config:
        env_file = ".env"

settings = Settings()`;
  }

  private generatePythonTests(vars: any): string {
    return `from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to ${vars.projectName} API"}

def test_health_check():
    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"`;
  }

  private generatePythonGitignore(vars: any): string {
    return `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
ENV/
env/
.env

# Database
*.db
*.sqlite

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Testing
.pytest_cache/
.coverage
htmlcov/

# Distribution
build/
dist/
*.egg-info/`;
  }

  private generateEslintConfig(vars: any): string {
    return JSON.stringify({
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended'
      ],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint', 'react'],
      rules: {
        'react/react-in-jsx-scope': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
      },
      settings: {
        react: {
          version: 'detect'
        }
      }
    }, null, 2);
  }

  private generatePrettierConfig(vars: any): string {
    return JSON.stringify({
      semi: false,
      trailingComma: 'es5',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2
    }, null, 2);
  }

  private generateTailwindConfig(vars: any): string {
    return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#3B82F6',
        'secondary': '#10B981',
      },
    },
  },
  plugins: [],
}`;
  }

  private generateNextConfig(vars: any): string {
    return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig`;
  }

  private generateNextLayout(vars: any): string {
    return `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '${vars.projectName}',
  description: 'Generated by LM Studio Assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`;
  }

  private generateNextPage(vars: any): string {
    return `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Welcome to ${vars.projectName}
        </h1>
        <p className="text-center text-gray-600">
          Get started by editing app/page.tsx
        </p>
      </div>
    </main>
  )
}`;
  }

  private generateGlobalStyles(vars: any): string {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}`;
  }

  private generateReadme(vars: any): string {
    return `# ${vars.appName || vars.projectName || vars.apiName || vars.toolName}

Generated with LM Studio Assistant

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run test\` - Run tests
- \`npm run lint\` - Lint code
- \`npm run format\` - Format code

## Learn More

- [Documentation](https://github.com/your-repo)
- [API Reference](https://github.com/your-repo/api)

## License

MIT`;
  }
}