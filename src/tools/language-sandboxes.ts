import { Tool, ToolResult } from './base.js';
import * as vm from 'vm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
  allowedModules?: string[];
  env?: Record<string, string>;
}

abstract class LanguageSandbox implements Tool {
  abstract name: string;
  abstract description: string;
  abstract language: string;
  
  parameters = {
    code: {
      type: 'string' as const,
      description: 'Code to execute',
      required: true
    },
    input: {
      type: 'string' as const,
      description: 'Input data for the program'
    },
    timeout: {
      type: 'number' as const,
      description: 'Execution timeout in milliseconds',
      default: 5000
    }
  };

  abstract execute(params: any): Promise<ToolResult>;
  
  protected async createTempFile(content: string, extension: string): Promise<string> {
    const tempDir = os.tmpdir();
    const filename = `sandbox_${Date.now()}.${extension}`;
    const filepath = path.join(tempDir, filename);
    await fs.writeFile(filepath, content);
    return filepath;
  }
  
  protected async cleanup(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

export class RubySandbox extends LanguageSandbox {
  name = 'rubySandbox';
  description = 'Execute Ruby code in a sandboxed environment';
  language = 'ruby';

  async execute(params: any): Promise<ToolResult> {
    const { code, input, timeout = 5000 } = params;
    
    // Create a safe Ruby script
    const safeCode = this.createSafeRubyCode(code);
    const filepath = await this.createTempFile(safeCode, 'rb');
    
    try {
      // Execute Ruby with restrictions
      const command = `ruby --disable-gems --disable-rubyopt "${filepath}"`;
      const options = {
        timeout,
        env: {
          ...process.env,
          RUBY_THREAD_VM_STACK_SIZE: '1048576', // Limit stack size
          RUBY_GC_HEAP_INIT_SLOTS: '10000' // Limit initial heap
        }
      };
      
      let result: any;
      if (input) {
        // Execute with input
        result = await execAsync(`echo '${input}' | ${command}`, options);
      } else {
        result = await execAsync(command, options);
      }
      
      return {
        success: true,
        data: {
          output: result.stdout,
          error: result.stderr,
          language: 'ruby'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          output: error.stdout || '',
          language: 'ruby'
        }
      };
    } finally {
      await this.cleanup(filepath);
    }
  }
  
  private createSafeRubyCode(code: string): string {
    // Sandbox the Ruby code
    return `
# Disable dangerous operations
class << File
  undef_method :delete
  undef_method :unlink
  undef_method :rename
  undef_method :chmod
end

class << Dir
  undef_method :delete
  undef_method :unlink
  undef_method :rmdir
end

class << FileUtils
  remove_method :rm if respond_to?(:rm)
  remove_method :rm_rf if respond_to?(:rm_rf)
  remove_method :remove if respond_to?(:remove)
end

# Disable system calls
module Kernel
  undef_method :system
  undef_method :exec
  undef_method :\`
  undef_method :fork
  undef_method :spawn
end

# Set resource limits
Process.setrlimit(Process::RLIMIT_CPU, 5, 5) # 5 second CPU limit
Process.setrlimit(Process::RLIMIT_AS, 100 * 1024 * 1024) # 100MB memory limit

# User code
begin
  ${code}
rescue Exception => e
  puts "Error: #{e.class}: #{e.message}"
  puts e.backtrace.first(5).join("\\n")
end
`;
  }
}

export class GoSandbox extends LanguageSandbox {
  name = 'goSandbox';
  description = 'Execute Go code in a sandboxed environment';
  language = 'go';

  async execute(params: any): Promise<ToolResult> {
    const { code, input, timeout = 5000 } = params;
    
    // Create a complete Go program
    const goProgram = this.createGoProgram(code);
    const filepath = await this.createTempFile(goProgram, 'go');
    
    try {
      // Run with go run
      const command = `go run "${filepath}"`;
      const options = {
        timeout,
        env: {
          ...process.env,
          GOMEMLIMIT: '100MiB', // Memory limit
          GOMAXPROCS: '1' // Limit to 1 CPU
        }
      };
      
      let result: any;
      if (input) {
        result = await execAsync(`echo '${input}' | ${command}`, options);
      } else {
        result = await execAsync(command, options);
      }
      
      return {
        success: true,
        data: {
          output: result.stdout,
          error: result.stderr,
          language: 'go'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          output: error.stdout || '',
          language: 'go'
        }
      };
    } finally {
      await this.cleanup(filepath);
    }
  }
  
  private createGoProgram(code: string): string {
    // Wrap user code in a main function if needed
    if (!code.includes('package main')) {
      return `package main

import (
  "fmt"
  "strings"
  "strconv"
  "math"
)

func main() {
  ${code}
}`;
    }
    return code;
  }
}

export class PythonSandbox extends LanguageSandbox {
  name = 'pythonSandbox';
  description = 'Execute Python code in a sandboxed environment';
  language = 'python';

  async execute(params: any): Promise<ToolResult> {
    const { code, input, timeout = 5000 } = params;
    
    // Create safe Python code
    const safeCode = this.createSafePythonCode(code);
    const filepath = await this.createTempFile(safeCode, 'py');
    
    try {
      // Execute Python with restrictions
      const command = `python3 -u "${filepath}"`;
      const options = {
        timeout,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1'
        }
      };
      
      let result: any;
      if (input) {
        result = await execAsync(`echo '${input}' | ${command}`, options);
      } else {
        result = await execAsync(command, options);
      }
      
      return {
        success: true,
        data: {
          output: result.stdout,
          error: result.stderr,
          language: 'python'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          output: error.stdout || '',
          language: 'python'
        }
      };
    } finally {
      await this.cleanup(filepath);
    }
  }
  
  private createSafePythonCode(code: string): string {
    return `
import sys
import resource

# Set resource limits
resource.setrlimit(resource.RLIMIT_CPU, (5, 5))  # 5 second CPU limit
resource.setrlimit(resource.RLIMIT_AS, (100 * 1024 * 1024, 100 * 1024 * 1024))  # 100MB memory

# Disable dangerous imports
import builtins
dangerous_modules = ['os', 'subprocess', 'shutil', 'socket', 'urllib', 'requests']
original_import = builtins.__import__

def safe_import(name, *args, **kwargs):
    if name in dangerous_modules or name.startswith('_'):
        raise ImportError(f"Import of '{name}' is not allowed")
    return original_import(name, *args, **kwargs)

builtins.__import__ = safe_import

# Disable dangerous builtins
del builtins.eval
del builtins.exec
del builtins.compile
if hasattr(builtins, 'open'):
    builtins.open = lambda *args, **kwargs: None

# User code
try:
    ${code}
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc(limit=5)
`;
  }
}

export class RustSandbox extends LanguageSandbox {
  name = 'rustSandbox';
  description = 'Execute Rust code in a sandboxed environment';
  language = 'rust';

  async execute(params: any): Promise<ToolResult> {
    const { code, input, timeout = 10000 } = params; // Rust needs more time to compile
    
    // Create a complete Rust program
    const rustProgram = this.createRustProgram(code);
    const filepath = await this.createTempFile(rustProgram, 'rs');
    const binaryPath = filepath.replace('.rs', '');
    
    try {
      // Compile the Rust program
      const compileResult = await execAsync(
        `rustc "${filepath}" -o "${binaryPath}" --edition 2021 -C opt-level=0`,
        { timeout: 10000 }
      );
      
      if (compileResult.stderr && !compileResult.stderr.includes('warning')) {
        return {
          success: false,
          error: `Compilation error: ${compileResult.stderr}`,
          data: {
            output: '',
            language: 'rust'
          }
        };
      }
      
      // Execute the binary
      let result: any;
      const runCommand = `"${binaryPath}"`;
      const options = { timeout };
      
      if (input) {
        result = await execAsync(`echo '${input}' | ${runCommand}`, options);
      } else {
        result = await execAsync(runCommand, options);
      }
      
      return {
        success: true,
        data: {
          output: result.stdout,
          error: result.stderr,
          language: 'rust'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          output: error.stdout || '',
          language: 'rust'
        }
      };
    } finally {
      await this.cleanup(filepath);
      await this.cleanup(binaryPath);
    }
  }
  
  private createRustProgram(code: string): string {
    // Wrap user code in a main function if needed
    if (!code.includes('fn main()')) {
      return `fn main() {
    ${code}
}`;
    }
    return code;
  }
}

export class CSharpSandbox extends LanguageSandbox {
  name = 'csharpSandbox';
  description = 'Execute C# code in a sandboxed environment';
  language = 'csharp';

  async execute(params: any): Promise<ToolResult> {
    const { code, input, timeout = 5000 } = params;
    
    // Create a complete C# program
    const csharpProgram = this.createCSharpProgram(code);
    const filepath = await this.createTempFile(csharpProgram, 'cs');
    
    try {
      // Use dotnet-script or csharp REPL
      const command = `dotnet script "${filepath}"`;
      const options = {
        timeout,
        env: {
          ...process.env,
          DOTNET_CLI_TELEMETRY_OPTOUT: '1'
        }
      };
      
      let result: any;
      if (input) {
        result = await execAsync(`echo '${input}' | ${command}`, options);
      } else {
        result = await execAsync(command, options);
      }
      
      return {
        success: true,
        data: {
          output: result.stdout,
          error: result.stderr,
          language: 'csharp'
        }
      };
    } catch (error: any) {
      // Fallback to csharp interactive
      try {
        const fallbackCommand = `csharp "${filepath}"`;
        const result = await execAsync(fallbackCommand, { timeout });
        
        return {
          success: true,
          data: {
            output: result.stdout,
            error: result.stderr,
            language: 'csharp'
          }
        };
      } catch (fallbackError: any) {
        return {
          success: false,
          error: error.message,
          data: {
            output: error.stdout || '',
            language: 'csharp'
          }
        };
      }
    } finally {
      await this.cleanup(filepath);
    }
  }
  
  private createCSharpProgram(code: string): string {
    // Check if it's a complete program
    if (!code.includes('using System;') && !code.includes('Console.')) {
      return `using System;
using System.Linq;
using System.Collections.Generic;

class Program {
    static void Main() {
        ${code}
    }
}`;
    }
    return code;
  }
}

// Multi-language executor
export class MultiLanguageExecutor implements Tool {
  name = 'executeCode';
  description = 'Execute code in multiple programming languages';
  
  private sandboxes: Map<string, LanguageSandbox> = new Map();
  
  parameters = {
    code: {
      type: 'string' as const,
      description: 'Code to execute',
      required: true
    },
    language: {
      type: 'string' as const,
      description: 'Programming language',
      required: true,
      enum: ['python', 'javascript', 'typescript', 'ruby', 'go', 'rust', 'csharp']
    },
    input: {
      type: 'string' as const,
      description: 'Input data for the program'
    },
    timeout: {
      type: 'number' as const,
      description: 'Execution timeout in milliseconds',
      default: 5000
    }
  };
  
  constructor() {
    // Register all sandboxes
    this.sandboxes.set('python', new PythonSandbox());
    this.sandboxes.set('ruby', new RubySandbox());
    this.sandboxes.set('go', new GoSandbox());
    this.sandboxes.set('rust', new RustSandbox());
    this.sandboxes.set('csharp', new CSharpSandbox());
  }
  
  async execute(params: any): Promise<ToolResult> {
    const { language, ...sandboxParams } = params;
    
    const sandbox = this.sandboxes.get(language.toLowerCase());
    if (!sandbox) {
      return {
        success: false,
        error: `Unsupported language: ${language}`
      };
    }
    
    return sandbox.execute(sandboxParams);
  }
  
  getSupportedLanguages(): string[] {
    return Array.from(this.sandboxes.keys());
  }
  
  getLanguageInfo(language: string): any {
    const sandbox = this.sandboxes.get(language.toLowerCase());
    if (!sandbox) return null;
    
    return {
      name: sandbox.name,
      description: sandbox.description,
      language: sandbox.language
    };
  }
}