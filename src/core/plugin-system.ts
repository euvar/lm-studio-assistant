import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vm from 'vm';
import { Tool, ToolResult } from '../tools/base.js';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools?: Tool[];
  hooks?: PluginHooks;
  config?: Record<string, any>;
}

export interface PluginHooks {
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  beforeToolExecution?: (toolName: string, params: any) => Promise<any>;
  afterToolExecution?: (toolName: string, result: any) => Promise<any>;
  onError?: (error: Error) => Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author?: string;
  dependencies?: Record<string, string>;
  engines?: {
    node?: string;
    lmAssistant?: string;
  };
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private pluginTools: Map<string, Tool> = new Map();
  private pluginsPath: string;
  private sandboxGlobals: Record<string, any>;

  constructor(pluginsPath: string) {
    super();
    this.pluginsPath = pluginsPath;
    
    // Define safe globals for plugin sandbox
    this.sandboxGlobals = {
      console,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Promise,
      Buffer,
      process: {
        env: process.env,
        version: process.version,
        platform: process.platform
      },
      require: this.createSafeRequire()
    };
  }

  private createSafeRequire() {
    // Whitelist of allowed modules
    const allowedModules = [
      'fs/promises',
      'path',
      'url',
      'util',
      'crypto',
      'querystring',
      'events',
      'stream',
      'zlib'
    ];

    return (moduleName: string) => {
      if (!allowedModules.includes(moduleName)) {
        throw new Error(`Module '${moduleName}' is not allowed in plugins`);
      }
      return require(moduleName);
    };
  }

  async initialize() {
    try {
      await fs.mkdir(this.pluginsPath, { recursive: true });
      await this.loadAllPlugins();
    } catch (error) {
      console.error('Failed to initialize plugin manager:', error);
    }
  }

  async loadAllPlugins() {
    try {
      const entries = await fs.readdir(this.pluginsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.pluginsPath, entry.name);
          await this.loadPlugin(pluginPath);
        }
      }
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  }

  async loadPlugin(pluginPath: string): Promise<boolean> {
    try {
      // Read manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);

      // Validate manifest
      if (!manifest.name || !manifest.version || !manifest.main) {
        throw new Error('Invalid plugin manifest');
      }

      // Check if already loaded
      if (this.plugins.has(manifest.name)) {
        console.warn(`Plugin ${manifest.name} is already loaded`);
        return false;
      }

      // Load plugin code
      const mainPath = path.join(pluginPath, manifest.main);
      const pluginCode = await fs.readFile(mainPath, 'utf-8');

      // Create sandbox context
      const sandbox = {
        ...this.sandboxGlobals,
        __dirname: pluginPath,
        __filename: mainPath,
        exports: {},
        module: { exports: {} }
      };

      // Execute plugin in sandbox
      const script = new vm.Script(pluginCode, {
        filename: mainPath
      });

      const context = vm.createContext(sandbox);
      script.runInContext(context);

      // Get plugin exports
      const PluginClass = (sandbox.module.exports as any).default || sandbox.module.exports;
      const pluginInstance = new PluginClass();

      // Create plugin object
      const plugin: Plugin = {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        tools: pluginInstance.tools || [],
        hooks: pluginInstance.hooks || {},
        config: pluginInstance.config || {}
      };

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register tools
      if (plugin.tools) {
        for (const tool of plugin.tools) {
          const toolName = `${plugin.name}:${tool.name}`;
          this.pluginTools.set(toolName, tool);
        }
      }

      // Call onLoad hook
      if (plugin.hooks?.onLoad) {
        await plugin.hooks.onLoad();
      }

      this.emit('pluginLoaded', plugin);
      console.log(`Loaded plugin: ${plugin.name} v${plugin.version}`);

      return true;
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
      this.emit('pluginLoadError', { path: pluginPath, error });
      return false;
    }
  }

  async unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    try {
      // Call onUnload hook
      if (plugin.hooks?.onUnload) {
        await plugin.hooks.onUnload();
      }

      // Remove tools
      if (plugin.tools) {
        for (const tool of plugin.tools) {
          const toolName = `${plugin.name}:${tool.name}`;
          this.pluginTools.delete(toolName);
        }
      }

      // Remove plugin
      this.plugins.delete(pluginName);

      this.emit('pluginUnloaded', plugin);
      console.log(`Unloaded plugin: ${pluginName}`);

      return true;
    } catch (error) {
      console.error(`Failed to unload plugin ${pluginName}:`, error);
      return false;
    }
  }

  async reloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    // Find plugin path
    const pluginPath = path.join(this.pluginsPath, pluginName);
    
    // Unload and reload
    await this.unloadPlugin(pluginName);
    return await this.loadPlugin(pluginPath);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getTool(toolName: string): Tool | undefined {
    return this.pluginTools.get(toolName);
  }

  getAllTools(): Map<string, Tool> {
    return new Map(this.pluginTools);
  }

  // Execute hooks
  async executeHook(hookName: keyof PluginHooks, ...args: any[]): Promise<void> {
    const promises: Promise<any>[] = [];

    for (const plugin of this.plugins.values()) {
      const hook = plugin.hooks?.[hookName];
      if (hook && typeof hook === 'function') {
        promises.push((hook as Function).apply(null, args));
      }
    }

    await Promise.allSettled(promises);
  }

  // Plugin development helpers
  async createPluginTemplate(pluginName: string): Promise<string> {
    const pluginDir = path.join(this.pluginsPath, pluginName);
    await fs.mkdir(pluginDir, { recursive: true });

    // Create manifest
    const manifest: PluginManifest = {
      name: pluginName,
      version: '1.0.0',
      description: `${pluginName} plugin for LM Studio Assistant`,
      main: 'index.js',
      author: 'Your Name',
      engines: {
        node: '>=14.0.0',
        lmAssistant: '>=1.0.0'
      }
    };

    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Create main plugin file
    const pluginTemplate = `// ${pluginName} Plugin for LM Studio Assistant

class ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}Plugin {
  constructor() {
    this.name = '${pluginName}';
    this.version = '1.0.0';
  }

  // Define custom tools
  get tools() {
    return [
      {
        name: 'exampleTool',
        description: 'An example tool from ${pluginName} plugin',
        parameters: {
          message: { type: 'string', description: 'A message to process' }
        },
        execute: async (params) => {
          return {
            success: true,
            output: \`Processed message: \${params.message}\`
          };
        }
      }
    ];
  }

  // Define hooks
  get hooks() {
    return {
      onLoad: async () => {
        console.log('${pluginName} plugin loaded!');
      },
      
      onUnload: async () => {
        console.log('${pluginName} plugin unloaded!');
      },
      
      beforeToolExecution: async (toolName, params) => {
        console.log(\`Tool \${toolName} about to execute with:\`, params);
        return params; // Can modify params here
      },
      
      afterToolExecution: async (toolName, result) => {
        console.log(\`Tool \${toolName} executed with result:\`, result);
        return result; // Can modify result here
      }
    };
  }

  // Plugin configuration
  get config() {
    return {
      // Add configuration options here
    };
  }
}

module.exports = ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}Plugin;
`;

    await fs.writeFile(
      path.join(pluginDir, 'index.js'),
      pluginTemplate
    );

    // Create README
    const readme = `# ${pluginName} Plugin

## Description
${manifest.description}

## Installation
Place this directory in the plugins folder of your LM Studio Assistant.

## Usage
The plugin will be automatically loaded when the assistant starts.

## Tools
- \`${pluginName}:exampleTool\` - An example tool

## Development
Edit \`index.js\` to add your custom functionality.
`;

    await fs.writeFile(
      path.join(pluginDir, 'README.md'),
      readme
    );

    return pluginDir;
  }

  // Plugin marketplace integration (future feature)
  async installFromMarketplace(pluginId: string): Promise<boolean> {
    // TODO: Implement plugin marketplace
    console.log(`Installing plugin ${pluginId} from marketplace...`);
    return false;
  }

  async searchMarketplace(query: string): Promise<any[]> {
    // TODO: Implement plugin marketplace search
    console.log(`Searching marketplace for: ${query}`);
    return [];
  }
}

// Example plugin format for developers
export const examplePlugin = `
// Example Plugin Structure
class MyAwesomePlugin {
  constructor() {
    this.name = 'my-awesome-plugin';
    this.version = '1.0.0';
  }

  get tools() {
    return [
      {
        name: 'customGreeting',
        description: 'Generates a custom greeting',
        parameters: {
          name: { type: 'string', description: 'Name to greet' },
          style: { 
            type: 'string', 
            enum: ['formal', 'casual', 'funny'],
            description: 'Greeting style' 
          }
        },
        execute: async ({ name, style }) => {
          const greetings = {
            formal: \`Good day, \${name}. How may I assist you?\`,
            casual: \`Hey \${name}! What's up?\`,
            funny: \`Yo \${name}! Ready to code some awesome stuff?\`
          };
          
          return {
            success: true,
            output: greetings[style] || greetings.casual
          };
        }
      }
    ];
  }

  get hooks() {
    return {
      onLoad: async () => {
        console.log('MyAwesomePlugin loaded! 🚀');
      },
      
      beforeToolExecution: async (toolName, params) => {
        // Add timestamps to all tool executions
        return { ...params, timestamp: new Date().toISOString() };
      }
    };
  }
}

module.exports = MyAwesomePlugin;
`;