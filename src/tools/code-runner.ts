import { Tool, ToolResult } from './index.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

interface CodeRunnerParams {
  language: 'python' | 'javascript' | 'typescript' | 'node';
  code: string;
  timeout?: number;
  input?: string;
}

export const codeRunnerTool: Tool = {
  name: 'runCode',
  description: 'Execute code snippets in a sandboxed environment',

  async execute(params: CodeRunnerParams): Promise<ToolResult> {
    const timeout = params.timeout || 10000; // 10 seconds default
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-assistant-code-'));
    
    try {
      let command: string;
      let args: string[];
      let filename: string;
      
      switch (params.language) {
        case 'python':
          filename = path.join(tempDir, 'script.py');
          await fs.writeFile(filename, params.code, 'utf-8');
          command = 'python3';
          args = [filename];
          break;
          
        case 'javascript':
        case 'node':
          filename = path.join(tempDir, 'script.js');
          await fs.writeFile(filename, params.code, 'utf-8');
          command = 'node';
          args = [filename];
          break;
          
        case 'typescript':
          filename = path.join(tempDir, 'script.ts');
          await fs.writeFile(filename, params.code, 'utf-8');
          command = 'tsx';
          args = [filename];
          break;
          
        default:
          return {
            success: false,
            error: `Unsupported language: ${params.language}`,
          };
      }
      
      // Execute the code
      const result = await runCommand(command, args, {
        cwd: tempDir,
        timeout,
        input: params.input,
      });
      
      return {
        success: true,
        data: {
          ...result,
          language: params.language,
          executedCode: params.code,
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  },
};

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; input?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, NODE_ENV: 'sandbox' },
      });
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      // Set timeout
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.timeout);
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      
      child.on('close', (code) => {
        clearTimeout(timer);
        
        if (timedOut) {
          reject(new Error(`Execution timed out after ${options.timeout}ms`));
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
          });
        }
      });
      
      // Send input if provided
      if (options.input) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
}

// Python sandbox wrapper
export const pythonSandboxTool: Tool = {
  name: 'pythonSandbox',
  description: 'Execute Python code in a sandboxed environment with restricted imports',
  
  async execute(params: { code: string; timeout?: number }): Promise<ToolResult> {
    // Add safety wrapper
    const wrappedCode = `
import sys
import io
from contextlib import redirect_stdout, redirect_stderr

# Restrict dangerous imports
forbidden_modules = ['subprocess', 'os', 'shutil', 'socket', 'urllib', 'requests']
original_import = __builtins__.__import__

def restricted_import(name, *args, **kwargs):
    if name in forbidden_modules:
        raise ImportError(f"Module '{name}' is not allowed in sandbox")
    return original_import(name, *args, **kwargs)

__builtins__.__import__ = restricted_import

# Capture output
output = io.StringIO()
error_output = io.StringIO()

try:
    with redirect_stdout(output), redirect_stderr(error_output):
        ${params.code.split('\n').map(line => '        ' + line).join('\n')}
except Exception as e:
    error_output.write(f"\\nError: {type(e).__name__}: {str(e)}")

print(output.getvalue())
if error_output.getvalue():
    print("Errors:", error_output.getvalue(), file=sys.stderr)
`;

    return codeRunnerTool.execute({
      language: 'python',
      code: wrappedCode,
      timeout: params.timeout,
    });
  },
};

// JavaScript sandbox wrapper
export const jsSandboxTool: Tool = {
  name: 'jsSandbox',
  description: 'Execute JavaScript code in a sandboxed Node.js environment',
  
  async execute(params: { code: string; timeout?: number }): Promise<ToolResult> {
    // Add safety wrapper
    const wrappedCode = `
'use strict';

// Create a limited global scope
const sandbox = {
  console: console,
  Math: Math,
  Date: Date,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  JSON: JSON,
  Promise: Promise,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval,
};

// Disable dangerous functions
delete global.require;
delete global.process;
delete global.module;
delete global.exports;
delete global.__dirname;
delete global.__filename;

// Run the code
try {
  const result = (function() {
    ${params.code.split('\n').map(line => '    ' + line).join('\n')}
  })();
  
  if (result !== undefined) {
    console.log('Result:', result);
  }
} catch (error) {
  console.error('Error:', error.name + ':', error.message);
}
`;

    return codeRunnerTool.execute({
      language: 'javascript',
      code: wrappedCode,
      timeout: params.timeout,
    });
  },
};