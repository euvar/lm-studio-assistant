import hljs from 'highlight.js';
import chalk from 'chalk';

export class SyntaxHighlighter {
  private static languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    m: 'matlab',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    cfg: 'ini',
    md: 'markdown',
    tex: 'latex',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };

  private static tokenColors = {
    keyword: chalk.blue,
    string: chalk.green,
    number: chalk.yellow,
    comment: chalk.gray,
    function: chalk.cyan,
    class: chalk.magenta,
    variable: chalk.white,
    operator: chalk.white,
    punctuation: chalk.dim,
    tag: chalk.red,
    attribute: chalk.yellow,
    value: chalk.green,
  };

  static highlight(code: string, language?: string): string {
    try {
      // Try to detect language if not provided
      if (!language) {
        const result = hljs.highlightAuto(code);
        return this.colorizeTokens(result.value);
      }

      // Map file extension to highlight.js language
      const hlLanguage = this.languageMap[language.toLowerCase()] || language;
      
      // Check if language is supported
      if (!hljs.getLanguage(hlLanguage)) {
        return code; // Return plain code if language not supported
      }

      const result = hljs.highlight(code, { language: hlLanguage });
      return this.colorizeTokens(result.value);
    } catch (error) {
      // Fallback to plain text if highlighting fails
      return code;
    }
  }

  private static colorizeTokens(highlightedHtml: string): string {
    // Remove HTML tags and apply chalk colors
    let colored = highlightedHtml;
    
    // Replace highlight.js classes with chalk colors
    colored = colored.replace(/<span class="hljs-keyword">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.keyword(content));
    colored = colored.replace(/<span class="hljs-string">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.string(content));
    colored = colored.replace(/<span class="hljs-number">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.number(content));
    colored = colored.replace(/<span class="hljs-comment">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.comment(content));
    colored = colored.replace(/<span class="hljs-function">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.function(content));
    colored = colored.replace(/<span class="hljs-class">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.class(content));
    colored = colored.replace(/<span class="hljs-variable">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.variable(content));
    colored = colored.replace(/<span class="hljs-operator">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.operator(content));
    colored = colored.replace(/<span class="hljs-punctuation">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.punctuation(content));
    colored = colored.replace(/<span class="hljs-tag">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.tag(content));
    colored = colored.replace(/<span class="hljs-attr">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.attribute(content));
    colored = colored.replace(/<span class="hljs-value">(.*?)<\/span>/g, (_, content) => 
      this.tokenColors.value(content));
    
    // Clean up any remaining HTML
    colored = colored.replace(/<[^>]*>/g, '');
    colored = colored.replace(/&lt;/g, '<');
    colored = colored.replace(/&gt;/g, '>');
    colored = colored.replace(/&amp;/g, '&');
    colored = colored.replace(/&quot;/g, '"');
    colored = colored.replace(/&#x27;/g, "'");
    
    return colored;
  }

  static detectLanguage(filename: string): string | undefined {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? this.languageMap[extension] : undefined;
  }

  static formatCodeBlock(code: string, language?: string, filename?: string): string {
    const lang = language || (filename ? this.detectLanguage(filename) : undefined);
    const highlighted = this.highlight(code, lang);
    
    // Add line numbers
    const lines = highlighted.split('\n');
    const lineNumberWidth = lines.length.toString().length;
    const numberedLines = lines.map((line, i) => {
      const lineNum = (i + 1).toString().padStart(lineNumberWidth, ' ');
      return chalk.dim(`${lineNum} │`) + ' ' + line;
    });

    // Add header
    const header = filename ? chalk.dim(`─── ${filename} ───`) : chalk.dim('─'.repeat(40));
    const footer = chalk.dim('─'.repeat(header.length));

    return `\n${header}\n${numberedLines.join('\n')}\n${footer}\n`;
  }
}