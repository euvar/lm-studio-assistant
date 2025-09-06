import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SecurityVulnerability {
  id: string;
  severity: VulnerabilitySeverity;
  type: VulnerabilityType;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
  references?: string[];
}

enum VulnerabilitySeverity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  Info = 'info'
}

enum VulnerabilityType {
  Injection = 'injection',
  XSS = 'xss',
  Authentication = 'authentication',
  Authorization = 'authorization',
  Cryptography = 'cryptography',
  Configuration = 'configuration',
  Dependency = 'dependency',
  Secrets = 'secrets',
  FileAccess = 'file-access',
  NetworkSecurity = 'network-security',
  CodeQuality = 'code-quality'
}

interface SecurityRule {
  id: string;
  name: string;
  type: VulnerabilityType;
  severity: VulnerabilitySeverity;
  pattern?: RegExp;
  check: (content: string, file: string) => SecurityVulnerability[];
  fileTypes?: string[];
}

interface ScanOptions {
  includeDevDependencies?: boolean;
  checkSecrets?: boolean;
  deepScan?: boolean;
  customRules?: SecurityRule[];
  exclude?: string[];
}

interface ScanReport {
  summary: {
    filesScanned: number;
    vulnerabilitiesFound: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  vulnerabilities: SecurityVulnerability[];
  dependencyAudit?: DependencyAudit;
  secretsFound?: SecretFinding[];
  recommendations: string[];
  score: number;
}

interface DependencyAudit {
  vulnerabilities: DependencyVulnerability[];
  totalDependencies: number;
  vulnerableDependencies: number;
}

interface DependencyVulnerability {
  package: string;
  version: string;
  severity: VulnerabilitySeverity;
  vulnerability: string;
  recommendation: string;
}

interface SecretFinding {
  file: string;
  line: number;
  type: string;
  entropy: number;
  preview: string;
}

export class SecurityScanner extends EventEmitter {
  private rules: Map<string, SecurityRule> = new Map();
  private secretPatterns: Map<string, RegExp> = new Map();
  
  constructor() {
    super();
    this.initializeRules();
    this.initializeSecretPatterns();
  }

  private initializeRules() {
    // SQL Injection
    this.addRule({
      id: 'sql-injection',
      name: 'SQL Injection',
      type: VulnerabilityType.Injection,
      severity: VulnerabilitySeverity.Critical,
      pattern: /(`|'|")\s*\+.*\+\s*(`|'|")/g,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check for string concatenation in SQL queries
          if (line.match(/query|sql|SELECT|INSERT|UPDATE|DELETE/i) && 
              line.match(/(`|'|")\s*\+.*\+\s*(`|'|")/)) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.Critical,
              type: VulnerabilityType.Injection,
              file,
              line: index + 1,
              message: 'Potential SQL injection vulnerability',
              description: 'SQL query appears to use string concatenation, which can lead to SQL injection',
              recommendation: 'Use parameterized queries or prepared statements',
              cwe: 'CWE-89',
              owasp: 'A03:2021'
            });
          }
        });
        
        return vulnerabilities;
      }
    });

    // Cross-Site Scripting (XSS)
    this.addRule({
      id: 'xss-vulnerability',
      name: 'Cross-Site Scripting',
      type: VulnerabilityType.XSS,
      severity: VulnerabilitySeverity.High,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check for innerHTML without sanitization
          if (line.includes('innerHTML') && !line.includes('sanitize')) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.High,
              type: VulnerabilityType.XSS,
              file,
              line: index + 1,
              message: 'Potential XSS vulnerability with innerHTML',
              description: 'Using innerHTML without sanitization can lead to XSS attacks',
              recommendation: 'Use textContent or sanitize HTML content before insertion',
              cwe: 'CWE-79',
              owasp: 'A03:2021'
            });
          }
          
          // Check for dangerouslySetInnerHTML in React
          if (line.includes('dangerouslySetInnerHTML')) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.High,
              type: VulnerabilityType.XSS,
              file,
              line: index + 1,
              message: 'Use of dangerouslySetInnerHTML',
              description: 'dangerouslySetInnerHTML can lead to XSS if content is not properly sanitized',
              recommendation: 'Ensure content is sanitized or use alternative approaches',
              cwe: 'CWE-79',
              owasp: 'A03:2021'
            });
          }
        });
        
        return vulnerabilities;
      },
      fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.html']
    });

    // Hardcoded Credentials
    this.addRule({
      id: 'hardcoded-credentials',
      name: 'Hardcoded Credentials',
      type: VulnerabilityType.Secrets,
      severity: VulnerabilitySeverity.Critical,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        const credentialPatterns = [
          /password\s*[:=]\s*["'](?!(?:password|example|test|demo|placeholder))[^"']+["']/i,
          /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
          /secret\s*[:=]\s*["'][^"']+["']/i,
          /token\s*[:=]\s*["'][^"']+["']/i
        ];
        
        lines.forEach((line, index) => {
          credentialPatterns.forEach(pattern => {
            if (pattern.test(line) && !line.includes('process.env')) {
              vulnerabilities.push({
                id: crypto.randomUUID(),
                severity: VulnerabilitySeverity.Critical,
                type: VulnerabilityType.Secrets,
                file,
                line: index + 1,
                message: 'Hardcoded credentials detected',
                description: 'Credentials should not be hardcoded in source code',
                recommendation: 'Use environment variables or secure credential storage',
                cwe: 'CWE-798'
              });
            }
          });
        });
        
        return vulnerabilities;
      }
    });

    // Insecure Random Number Generation
    this.addRule({
      id: 'insecure-random',
      name: 'Insecure Random Number Generation',
      type: VulnerabilityType.Cryptography,
      severity: VulnerabilitySeverity.Medium,
      pattern: /Math\.random\(\)/g,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('Math.random()') && 
              (line.match(/token|password|key|secret|crypto|security/i))) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.High,
              type: VulnerabilityType.Cryptography,
              file,
              line: index + 1,
              message: 'Insecure random number generation for security-sensitive operation',
              description: 'Math.random() is not cryptographically secure',
              recommendation: 'Use crypto.randomBytes() or similar secure random functions',
              cwe: 'CWE-330'
            });
          }
        });
        
        return vulnerabilities;
      }
    });

    // Path Traversal
    this.addRule({
      id: 'path-traversal',
      name: 'Path Traversal',
      type: VulnerabilityType.FileAccess,
      severity: VulnerabilitySeverity.High,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if ((line.includes('readFile') || line.includes('writeFile')) &&
              !line.includes('path.join') && !line.includes('path.resolve')) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.High,
              type: VulnerabilityType.FileAccess,
              file,
              line: index + 1,
              message: 'Potential path traversal vulnerability',
              description: 'File operations without proper path validation can lead to path traversal attacks',
              recommendation: 'Use path.join() or path.resolve() and validate user input',
              cwe: 'CWE-22',
              owasp: 'A01:2021'
            });
          }
        });
        
        return vulnerabilities;
      }
    });

    // Insecure HTTP
    this.addRule({
      id: 'insecure-http',
      name: 'Insecure HTTP Usage',
      type: VulnerabilityType.NetworkSecurity,
      severity: VulnerabilitySeverity.Medium,
      pattern: /http:\/\//g,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('http://') && 
              !line.includes('localhost') && 
              !line.includes('127.0.0.1') &&
              !line.includes('example.com')) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.Medium,
              type: VulnerabilityType.NetworkSecurity,
              file,
              line: index + 1,
              message: 'Insecure HTTP connection',
              description: 'Using HTTP instead of HTTPS can expose data in transit',
              recommendation: 'Use HTTPS for all external connections',
              cwe: 'CWE-319'
            });
          }
        });
        
        return vulnerabilities;
      }
    });

    // Weak Cryptographic Algorithm
    this.addRule({
      id: 'weak-crypto',
      name: 'Weak Cryptographic Algorithm',
      type: VulnerabilityType.Cryptography,
      severity: VulnerabilitySeverity.High,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        const weakAlgorithms = ['md5', 'sha1', 'des', 'rc4'];
        
        lines.forEach((line, index) => {
          weakAlgorithms.forEach(algo => {
            if (line.toLowerCase().includes(algo) && 
                (line.includes('crypto') || line.includes('hash'))) {
              vulnerabilities.push({
                id: crypto.randomUUID(),
                severity: VulnerabilitySeverity.High,
                type: VulnerabilityType.Cryptography,
                file,
                line: index + 1,
                message: `Weak cryptographic algorithm: ${algo.toUpperCase()}`,
                description: `${algo.toUpperCase()} is considered cryptographically weak`,
                recommendation: 'Use stronger algorithms like SHA-256, SHA-3, or AES',
                cwe: 'CWE-327'
              });
            }
          });
        });
        
        return vulnerabilities;
      }
    });

    // Command Injection
    this.addRule({
      id: 'command-injection',
      name: 'Command Injection',
      type: VulnerabilityType.Injection,
      severity: VulnerabilitySeverity.Critical,
      check: (content, file) => {
        const vulnerabilities: SecurityVulnerability[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if ((line.includes('exec') || line.includes('spawn') || line.includes('system')) &&
              (line.includes('+') || line.includes('`'))) {
            vulnerabilities.push({
              id: crypto.randomUUID(),
              severity: VulnerabilitySeverity.Critical,
              type: VulnerabilityType.Injection,
              file,
              line: index + 1,
              message: 'Potential command injection vulnerability',
              description: 'Executing system commands with user input can lead to command injection',
              recommendation: 'Validate and sanitize all user input, use parameterized commands',
              cwe: 'CWE-78',
              owasp: 'A03:2021'
            });
          }
        });
        
        return vulnerabilities;
      }
    });
  }

  private initializeSecretPatterns() {
    // API Keys
    this.secretPatterns.set('aws-access-key', /AKIA[0-9A-Z]{16}/);
    this.secretPatterns.set('aws-secret-key', /(?:aws_secret_access_key|aws_secret_key|aws_secret)(?:\s*=\s*|\s*:\s*)([A-Za-z0-9/+=]{40})/i);
    this.secretPatterns.set('github-token', /ghp_[a-zA-Z0-9]{36}/);
    this.secretPatterns.set('gitlab-token', /glpat-[a-zA-Z0-9\-\_]{20}/);
    this.secretPatterns.set('slack-token', /xox[baprs]-[0-9a-zA-Z]{10,48}/);
    
    // Private Keys
    this.secretPatterns.set('rsa-private-key', /-----BEGIN RSA PRIVATE KEY-----/);
    this.secretPatterns.set('dsa-private-key', /-----BEGIN DSA PRIVATE KEY-----/);
    this.secretPatterns.set('ec-private-key', /-----BEGIN EC PRIVATE KEY-----/);
    this.secretPatterns.set('pgp-private-key', /-----BEGIN PGP PRIVATE KEY BLOCK-----/);
    
    // Generic patterns
    this.secretPatterns.set('jwt', /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/);
    this.secretPatterns.set('base64-key', /(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})/);
  }

  // Add custom rule
  addRule(rule: SecurityRule) {
    this.rules.set(rule.id, rule);
  }

  // Scan files for vulnerabilities
  async scan(targetPath: string, options: ScanOptions = {}): Promise<ScanReport> {
    const report: ScanReport = {
      summary: {
        filesScanned: 0,
        vulnerabilitiesFound: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      vulnerabilities: [],
      recommendations: [],
      score: 100
    };

    try {
      // Get all files to scan
      const files = await this.getFilesToScan(targetPath, options.exclude || []);
      report.summary.filesScanned = files.length;

      // Scan each file
      for (const file of files) {
        const fileVulnerabilities = await this.scanFile(file, options);
        report.vulnerabilities.push(...fileVulnerabilities);
      }

      // Check for secrets if enabled
      if (options.checkSecrets) {
        report.secretsFound = await this.scanForSecrets(files);
        if (report.secretsFound.length > 0) {
          report.vulnerabilities.push(...this.secretsToVulnerabilities(report.secretsFound));
        }
      }

      // Run dependency audit if package.json exists
      const packageJsonPath = path.join(targetPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        report.dependencyAudit = await this.auditDependencies(targetPath, options.includeDevDependencies);
      } catch {}

      // Update summary
      this.updateSummary(report);

      // Calculate security score
      report.score = this.calculateSecurityScore(report);

      // Generate recommendations
      report.recommendations = this.generateRecommendations(report);

      this.emit('scanComplete', report);

      return report;
    } catch (error) {
      console.error('Security scan error:', error);
      throw error;
    }
  }

  // Scan individual file
  private async scanFile(filePath: string, options: ScanOptions): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath);
      
      // Apply all rules
      for (const rule of this.rules.values()) {
        // Check if rule applies to this file type
        if (rule.fileTypes && !rule.fileTypes.includes(ext)) {
          continue;
        }
        
        const ruleVulnerabilities = rule.check(content, filePath);
        vulnerabilities.push(...ruleVulnerabilities);
      }
      
      // Apply custom rules if provided
      if (options.customRules) {
        for (const rule of options.customRules) {
          const customVulnerabilities = rule.check(content, filePath);
          vulnerabilities.push(...customVulnerabilities);
        }
      }
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error);
    }
    
    return vulnerabilities;
  }

  // Scan for secrets
  private async scanForSecrets(files: string[]): Promise<SecretFinding[]> {
    const secrets: SecretFinding[] = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check each secret pattern
          for (const [type, pattern] of this.secretPatterns.entries()) {
            const match = line.match(pattern);
            if (match) {
              // Calculate Shannon entropy
              const entropy = this.calculateEntropy(match[0]);
              
              if (entropy > 3.5) { // High entropy indicates likely secret
                secrets.push({
                  file,
                  line: index + 1,
                  type,
                  entropy,
                  preview: this.redactSecret(match[0])
                });
              }
            }
          }
        });
      } catch (error) {
        console.error(`Error scanning for secrets in ${file}:`, error);
      }
    }
    
    return secrets;
  }

  // Calculate Shannon entropy
  private calculateEntropy(str: string): number {
    const freq: Map<string, number> = new Map();
    
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }
    
    let entropy = 0;
    const len = str.length;
    
    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }

  // Redact secret for display
  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4);
  }

  // Convert secrets to vulnerabilities
  private secretsToVulnerabilities(secrets: SecretFinding[]): SecurityVulnerability[] {
    return secrets.map(secret => ({
      id: crypto.randomUUID(),
      severity: VulnerabilitySeverity.Critical,
      type: VulnerabilityType.Secrets,
      file: secret.file,
      line: secret.line,
      message: `Potential ${secret.type} found`,
      description: `A potential secret or API key was detected (entropy: ${secret.entropy.toFixed(2)})`,
      recommendation: 'Remove secrets from code and use environment variables or secure key management',
      cwe: 'CWE-798'
    }));
  }

  // Audit dependencies
  private async auditDependencies(projectPath: string, includeDevDependencies = false): Promise<DependencyAudit> {
    const audit: DependencyAudit = {
      vulnerabilities: [],
      totalDependencies: 0,
      vulnerableDependencies: 0
    };

    try {
      // Try npm audit
      const { stdout } = await execAsync('npm audit --json', { cwd: projectPath });
      const auditResult = JSON.parse(stdout);
      
      if (auditResult.vulnerabilities) {
        for (const [pkg, data] of Object.entries(auditResult.vulnerabilities) as any) {
          if (!includeDevDependencies && data.isDev) {
            continue;
          }
          
          audit.vulnerabilities.push({
            package: pkg,
            version: data.range,
            severity: this.mapNpmSeverity(data.severity),
            vulnerability: data.via[0]?.title || 'Unknown vulnerability',
            recommendation: data.fixAvailable ? `Update to ${data.fixAvailable}` : 'No fix available'
          });
        }
      }
      
      audit.totalDependencies = Object.keys(auditResult.dependencies || {}).length;
      audit.vulnerableDependencies = audit.vulnerabilities.length;
    } catch (error) {
      console.error('Dependency audit failed:', error);
    }
    
    return audit;
  }

  // Map npm severity to our severity
  private mapNpmSeverity(npmSeverity: string): VulnerabilitySeverity {
    const mapping: Record<string, VulnerabilitySeverity> = {
      'critical': VulnerabilitySeverity.Critical,
      'high': VulnerabilitySeverity.High,
      'moderate': VulnerabilitySeverity.Medium,
      'low': VulnerabilitySeverity.Low,
      'info': VulnerabilitySeverity.Info
    };
    
    return mapping[npmSeverity.toLowerCase()] || VulnerabilitySeverity.Medium;
  }

  // Get files to scan
  private async getFilesToScan(targetPath: string, exclude: string[]): Promise<string[]> {
    const files: string[] = [];
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      ...exclude
    ];

    async function scanDirectory(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip excluded paths
        if (excludePatterns.some(pattern => fullPath.includes(pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const scannable = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.java', '.php', '.cs'].includes(ext);
          if (scannable || entry.name === '.env' || entry.name.includes('config')) {
            files.push(fullPath);
          }
        }
      }
    }

    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await scanDirectory(targetPath);
    } else {
      files.push(targetPath);
    }
    
    return files;
  }

  // Update report summary
  private updateSummary(report: ScanReport) {
    report.summary.vulnerabilitiesFound = report.vulnerabilities.length;
    
    for (const vuln of report.vulnerabilities) {
      switch (vuln.severity) {
        case VulnerabilitySeverity.Critical:
          report.summary.critical++;
          break;
        case VulnerabilitySeverity.High:
          report.summary.high++;
          break;
        case VulnerabilitySeverity.Medium:
          report.summary.medium++;
          break;
        case VulnerabilitySeverity.Low:
          report.summary.low++;
          break;
        case VulnerabilitySeverity.Info:
          report.summary.info++;
          break;
      }
    }
  }

  // Calculate security score
  private calculateSecurityScore(report: ScanReport): number {
    let score = 100;
    
    // Deduct points based on vulnerabilities
    score -= report.summary.critical * 20;
    score -= report.summary.high * 10;
    score -= report.summary.medium * 5;
    score -= report.summary.low * 2;
    score -= report.summary.info * 0.5;
    
    // Deduct for dependency vulnerabilities
    if (report.dependencyAudit) {
      const depVulns = report.dependencyAudit.vulnerabilities;
      score -= depVulns.filter(v => v.severity === VulnerabilitySeverity.Critical).length * 10;
      score -= depVulns.filter(v => v.severity === VulnerabilitySeverity.High).length * 5;
    }
    
    // Deduct for secrets
    if (report.secretsFound && report.secretsFound.length > 0) {
      score -= report.secretsFound.length * 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // Generate recommendations
  private generateRecommendations(report: ScanReport): string[] {
    const recommendations: string[] = [];
    
    // Critical vulnerabilities
    if (report.summary.critical > 0) {
      recommendations.push('⚠️ Address critical vulnerabilities immediately');
    }
    
    // Secrets
    if (report.secretsFound && report.secretsFound.length > 0) {
      recommendations.push('🔐 Remove all hardcoded secrets and rotate compromised credentials');
      recommendations.push('📝 Set up .gitignore to exclude sensitive files');
      recommendations.push('🔧 Use environment variables or secure key management services');
    }
    
    // Dependencies
    if (report.dependencyAudit && report.dependencyAudit.vulnerableDependencies > 0) {
      recommendations.push('📦 Update vulnerable dependencies');
      recommendations.push('🔄 Set up automated dependency scanning in CI/CD');
    }
    
    // Code quality
    if (report.vulnerabilities.some(v => v.type === VulnerabilityType.CodeQuality)) {
      recommendations.push('📏 Implement linting and code quality checks');
    }
    
    // Security headers
    if (report.vulnerabilities.some(v => v.type === VulnerabilityType.Configuration)) {
      recommendations.push('🛡️ Configure security headers properly');
    }
    
    // General recommendations based on score
    if (report.score < 50) {
      recommendations.push('🚨 Consider a comprehensive security audit');
      recommendations.push('📚 Provide security training for the development team');
    } else if (report.score < 80) {
      recommendations.push('💡 Implement security testing in your development workflow');
    }
    
    return recommendations;
  }

  // Format report for display
  formatReport(report: ScanReport): string {
    const lines: string[] = [];
    
    lines.push('=== Security Scan Report ===\n');
    lines.push(`Security Score: ${report.score}/100 ${this.getScoreEmoji(report.score)}\n`);
    
    lines.push('Summary:');
    lines.push(`  Files scanned: ${report.summary.filesScanned}`);
    lines.push(`  Vulnerabilities found: ${report.summary.vulnerabilitiesFound}`);
    lines.push(`    Critical: ${report.summary.critical}`);
    lines.push(`    High: ${report.summary.high}`);
    lines.push(`    Medium: ${report.summary.medium}`);
    lines.push(`    Low: ${report.summary.low}`);
    lines.push(`    Info: ${report.summary.info}`);
    lines.push('');
    
    if (report.vulnerabilities.length > 0) {
      lines.push('Vulnerabilities:');
      
      // Group by severity
      const grouped = this.groupBySeverity(report.vulnerabilities);
      
      for (const [severity, vulns] of Object.entries(grouped)) {
        if (vulns.length === 0) continue;
        
        lines.push(`\n${this.getSeverityEmoji(severity as VulnerabilitySeverity)} ${severity.toUpperCase()}:`);
        
        for (const vuln of vulns) {
          lines.push(`\n  ${vuln.message}`);
          if (vuln.file) {
            lines.push(`    File: ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
          }
          lines.push(`    ${vuln.description}`);
          lines.push(`    ➜ ${vuln.recommendation}`);
          if (vuln.cwe) {
            lines.push(`    Reference: ${vuln.cwe}${vuln.owasp ? `, ${vuln.owasp}` : ''}`);
          }
        }
      }
    }
    
    if (report.secretsFound && report.secretsFound.length > 0) {
      lines.push('\n🔑 Secrets Found:');
      for (const secret of report.secretsFound) {
        lines.push(`  ${secret.type} in ${secret.file}:${secret.line}`);
        lines.push(`    Preview: ${secret.preview}`);
      }
    }
    
    if (report.dependencyAudit && report.dependencyAudit.vulnerabilities.length > 0) {
      lines.push('\n📦 Dependency Vulnerabilities:');
      for (const dep of report.dependencyAudit.vulnerabilities) {
        lines.push(`  ${dep.package}@${dep.version} - ${dep.severity}`);
        lines.push(`    ${dep.vulnerability}`);
        lines.push(`    ➜ ${dep.recommendation}`);
      }
    }
    
    if (report.recommendations.length > 0) {
      lines.push('\n💡 Recommendations:');
      for (const rec of report.recommendations) {
        lines.push(`  ${rec}`);
      }
    }
    
    return lines.join('\n');
  }

  // Group vulnerabilities by severity
  private groupBySeverity(vulnerabilities: SecurityVulnerability[]): Record<string, SecurityVulnerability[]> {
    const grouped: Record<string, SecurityVulnerability[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };
    
    for (const vuln of vulnerabilities) {
      grouped[vuln.severity].push(vuln);
    }
    
    return grouped;
  }

  // Get emoji for severity
  private getSeverityEmoji(severity: VulnerabilitySeverity): string {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️'
    };
    
    return emojis[severity] || '⚪';
  }

  // Get emoji for score
  private getScoreEmoji(score: number): string {
    if (score >= 90) return '✅';
    if (score >= 70) return '⚠️';
    if (score >= 50) return '🟠';
    return '🔴';
  }
}