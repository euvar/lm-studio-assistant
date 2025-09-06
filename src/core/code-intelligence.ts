import * as ts from 'typescript';
import * as babel from '@babel/parser';
import * as traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

interface CodeMatch {
  file: string;
  line: number;
  column: number;
  similarity: number;
  snippet: string;
}

interface DependencyNode {
  name: string;
  type: 'import' | 'require' | 'export';
  file: string;
  line: number;
}

interface CodeIssue {
  type: 'error' | 'warning' | 'suggestion';
  message: string;
  file: string;
  line: number;
  column: number;
  suggestion?: string;
}

interface RefactoringOp {
  type: 'rename' | 'extract' | 'inline' | 'move';
  target: string;
  options: any;
}

export class CodeIntelligence extends EventEmitter {
  private fileCache: Map<string, ts.SourceFile | any> = new Map();
  private dependencyGraph: Map<string, DependencyNode[]> = new Map();
  private symbolTable: Map<string, any[]> = new Map();

  async analyzeFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);
    
    if (ext === '.ts' || ext === '.tsx') {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );
      this.fileCache.set(filePath, sourceFile);
      this.analyzeTypeScriptAST(sourceFile, filePath);
    } else if (ext === '.js' || ext === '.jsx') {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      this.fileCache.set(filePath, ast);
      this.analyzeJavaScriptAST(ast, filePath);
    }
  }

  private analyzeTypeScriptAST(sourceFile: ts.SourceFile, filePath: string) {
    const self = this;
    const dependencies: DependencyNode[] = [];
    
    function visit(node: ts.Node) {
      // Extract imports
      if (ts.isImportDeclaration(node)) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
        dependencies.push({
          name: importPath,
          type: 'import',
          file: filePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
        });
      }
      
      // Extract exports
      if (ts.isExportDeclaration(node)) {
        dependencies.push({
          name: 'export',
          type: 'export',
          file: filePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
        });
      }
      
      // Extract function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        self.addSymbol(filePath, {
          name: node.name.text,
          type: 'function',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          parameters: node.parameters.length
        });
      }
      
      // Extract class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        self.addSymbol(filePath, {
          name: node.name.text,
          type: 'class',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          members: node.members.length
        });
      }
      
      // Extract variable declarations
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name)) {
            self.addSymbol(filePath, {
              name: decl.name.text,
              type: 'variable',
              line: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1
            });
          }
        });
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    this.dependencyGraph.set(filePath, dependencies);
  }

  private analyzeJavaScriptAST(ast: any, filePath: string) {
    const self = this;
    const dependencies: DependencyNode[] = [];
    
    (traverse as any).default(ast, {
      ImportDeclaration(path: any) {
        dependencies.push({
          name: path.node.source.value,
          type: 'import',
          file: filePath,
          line: path.node.loc.start.line
        });
      },
      
      CallExpression(path: any) {
        if (path.node.callee.name === 'require' && 
            path.node.arguments[0] && 
            t.isStringLiteral(path.node.arguments[0])) {
          dependencies.push({
            name: path.node.arguments[0].value,
            type: 'require',
            file: filePath,
            line: path.node.loc.start.line
          });
        }
      },
      
      FunctionDeclaration(path: any) {
        if (path.node.id) {
          self.addSymbol(filePath, {
            name: path.node.id.name,
            type: 'function',
            line: path.node.loc.start.line,
            parameters: path.node.params.length
          });
        }
      },
      
      ClassDeclaration(path: any) {
        if (path.node.id) {
          self.addSymbol(filePath, {
            name: path.node.id.name,
            type: 'class',
            line: path.node.loc.start.line
          });
        }
      },
      
      VariableDeclarator(path: any) {
        if (t.isIdentifier(path.node.id)) {
          self.addSymbol(filePath, {
            name: path.node.id.name,
            type: 'variable',
            line: path.node.loc.start.line
          });
        }
      }
    });
    
    this.dependencyGraph.set(filePath, dependencies);
  }

  private addSymbol(file: string, symbol: any) {
    if (!this.symbolTable.has(file)) {
      this.symbolTable.set(file, []);
    }
    this.symbolTable.get(file)!.push(symbol);
  }

  findSimilarCode(snippet: string): CodeMatch[] {
    const matches: CodeMatch[] = [];
    const snippetAST = this.parseSnippet(snippet);
    
    for (const [file, ast] of this.fileCache) {
      // Simple similarity check based on structure
      const similarity = this.calculateSimilarity(snippetAST, ast);
      if (similarity > 0.5) {
        matches.push({
          file,
          line: 1,
          column: 1,
          similarity,
          snippet: 'Similar structure found'
        });
      }
    }
    
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  private parseSnippet(snippet: string): any {
    try {
      return babel.parse(snippet, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
    } catch {
      return null;
    }
  }

  private calculateSimilarity(ast1: any, ast2: any): number {
    // Simple implementation - count matching node types
    if (!ast1 || !ast2) return 0;
    
    const types1 = new Set<string>();
    const types2 = new Set<string>();
    
    const traverseFn = (traverse as any).default || traverse;
    traverseFn(ast1, {
      enter(path: any) {
        types1.add(path.node.type);
      }
    });
    
    traverseFn(ast2, {
      enter(path: any) {
        types2.add(path.node.type);
      }
    });
    
    const intersection = new Set([...types1].filter(x => types2.has(x)));
    const union = new Set([...types1, ...types2]);
    
    return intersection.size / union.size;
  }

  async generateTests(filePath: string): Promise<string> {
    const symbols = this.symbolTable.get(filePath) || [];
    const functions = symbols.filter(s => s.type === 'function');
    const classes = symbols.filter(s => s.type === 'class');
    
    let testContent = `import { describe, it, expect } from '@jest/globals';\n`;
    testContent += `import * as module from '${filePath.replace(/\.[jt]sx?$/, '')}';\n\n`;
    
    // Generate tests for functions
    for (const func of functions) {
      testContent += `describe('${func.name}', () => {\n`;
      testContent += `  it('should be a function', () => {\n`;
      testContent += `    expect(typeof module.${func.name}).toBe('function');\n`;
      testContent += `  });\n`;
      
      if (func.parameters > 0) {
        testContent += `  it('should accept ${func.parameters} parameters', () => {\n`;
        testContent += `    expect(module.${func.name}.length).toBe(${func.parameters});\n`;
        testContent += `  });\n`;
      }
      
      testContent += `  // TODO: Add more specific tests\n`;
      testContent += `});\n\n`;
    }
    
    // Generate tests for classes
    for (const cls of classes) {
      testContent += `describe('${cls.name}', () => {\n`;
      testContent += `  it('should be a class', () => {\n`;
      testContent += `    expect(typeof module.${cls.name}).toBe('function');\n`;
      testContent += `  });\n`;
      testContent += `  \n`;
      testContent += `  it('should be instantiable', () => {\n`;
      testContent += `    expect(() => new module.${cls.name}()).not.toThrow();\n`;
      testContent += `  });\n`;
      testContent += `  // TODO: Add tests for class methods\n`;
      testContent += `});\n\n`;
    }
    
    return testContent;
  }

  async refactor(operation: RefactoringOp): Promise<Map<string, string>> {
    const changes = new Map<string, string>();
    
    switch (operation.type) {
      case 'rename':
        return this.renameSymbol(operation.target, operation.options.newName);
      
      case 'extract':
        return this.extractFunction(operation.target, operation.options);
      
      case 'inline':
        return this.inlineFunction(operation.target);
      
      case 'move':
        return this.moveSymbol(operation.target, operation.options.targetFile);
      
      default:
        throw new Error(`Unsupported refactoring operation: ${operation.type}`);
    }
  }

  private async renameSymbol(oldName: string, newName: string): Promise<Map<string, string>> {
    const changes = new Map<string, string>();
    
    for (const [file, symbols] of this.symbolTable) {
      const hasSymbol = symbols.some(s => s.name === oldName);
      if (!hasSymbol) continue;
      
      const content = await fs.readFile(file, 'utf-8');
      // Simple regex replacement - in production, use proper AST transformation
      const newContent = content.replace(
        new RegExp(`\\b${oldName}\\b`, 'g'),
        newName
      );
      
      if (content !== newContent) {
        changes.set(file, newContent);
      }
    }
    
    return changes;
  }

  private async extractFunction(code: string, options: any): Promise<Map<string, string>> {
    // Simplified implementation
    const changes = new Map<string, string>();
    const functionName = options.functionName || 'extractedFunction';
    const newFunction = `function ${functionName}() {\n  ${code}\n}\n`;
    
    // In production, this would properly extract the code and update references
    changes.set('extracted.js', newFunction);
    
    return changes;
  }

  private async inlineFunction(functionName: string): Promise<Map<string, string>> {
    // Simplified implementation
    const changes = new Map<string, string>();
    
    // In production, this would find the function definition and inline it at call sites
    return changes;
  }

  private async moveSymbol(symbolName: string, targetFile: string): Promise<Map<string, string>> {
    // Simplified implementation
    const changes = new Map<string, string>();
    
    // In production, this would move the symbol and update all imports
    return changes;
  }

  detectIssues(): CodeIssue[] {
    const issues: CodeIssue[] = [];
    
    for (const [file, ast] of this.fileCache) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        this.detectTypeScriptIssues(file, ast as ts.SourceFile, issues);
      } else {
        this.detectJavaScriptIssues(file, ast, issues);
      }
    }
    
    return issues;
  }

  private detectTypeScriptIssues(file: string, sourceFile: ts.SourceFile, issues: CodeIssue[]) {
    function visit(node: ts.Node) {
      // Check for any type
      if (ts.isTypeReferenceNode(node) && 
          node.typeName.getText() === 'any') {
        issues.push({
          type: 'warning',
          message: 'Avoid using "any" type',
          file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
          suggestion: 'Use a more specific type'
        });
      }
      
      // Check for console.log
      if (ts.isCallExpression(node) && 
          node.expression.getText().startsWith('console.')) {
        issues.push({
          type: 'warning',
          message: 'Remove console statements',
          file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1
        });
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
  }

  private detectJavaScriptIssues(file: string, ast: any, issues: CodeIssue[]) {
    (traverse as any).default(ast, {
      CallExpression(path: any) {
        // Check for console statements
        if (path.node.callee.type === 'MemberExpression' &&
            path.node.callee.object.name === 'console') {
          issues.push({
            type: 'warning',
            message: 'Remove console statements',
            file,
            line: path.node.loc.start.line,
            column: path.node.loc.start.column
          });
        }
      },
      
      VariableDeclarator(path: any) {
        // Check for unused variables (simplified)
        if (t.isIdentifier(path.node.id) && 
            path.node.id.name.startsWith('_')) {
          issues.push({
            type: 'suggestion',
            message: `Variable "${path.node.id.name}" appears to be unused`,
            file,
            line: path.node.loc.start.line,
            column: path.node.loc.start.column
          });
        }
      }
    });
  }

  getDependencyGraph() {
    return {
      nodes: Array.from(this.dependencyGraph.keys()),
      edges: Array.from(this.dependencyGraph.entries()).flatMap(([from, deps]) =>
        deps.map(dep => ({ from, to: dep.name, type: dep.type }))
      )
    };
  }

  getSymbols(file?: string) {
    if (file) {
      return this.symbolTable.get(file) || [];
    }
    
    const allSymbols: any[] = [];
    for (const symbols of this.symbolTable.values()) {
      allSymbols.push(...symbols);
    }
    return allSymbols;
  }

  suggestImprovements(): string[] {
    const suggestions: string[] = [];
    const issues = this.detectIssues();
    
    // Group issues by type
    const issuesByType = new Map<string, number>();
    for (const issue of issues) {
      issuesByType.set(issue.message, (issuesByType.get(issue.message) || 0) + 1);
    }
    
    // Generate suggestions based on common issues
    for (const [message, count] of issuesByType) {
      if (count > 3) {
        suggestions.push(`Consider addressing ${count} instances of: ${message}`);
      }
    }
    
    // Check for missing tests
    const jsFiles = Array.from(this.fileCache.keys()).filter(f => 
      (f.endsWith('.js') || f.endsWith('.ts')) && !f.includes('.test.')
    );
    const testFiles = Array.from(this.fileCache.keys()).filter(f => 
      f.includes('.test.')
    );
    
    if (jsFiles.length > testFiles.length * 2) {
      suggestions.push('Consider adding more test files for better coverage');
    }
    
    // Check for large files
    for (const [file, symbols] of this.symbolTable) {
      if (symbols.length > 20) {
        suggestions.push(`File "${file}" has ${symbols.length} symbols - consider splitting it`);
      }
    }
    
    return suggestions;
  }
}