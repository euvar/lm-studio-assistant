import { Tool, ToolResult } from './base.js';
import { SecurityScanner } from '../core/security-scanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SecurityScannerTool implements Tool {
  name = 'securityScanner';
  description = 'Scan code for security vulnerabilities';
  
  parameters = {
    path: {
      type: 'string' as const,
      description: 'Path to scan (file or directory)',
      required: true
    },
    deepScan: {
      type: 'boolean' as const,
      description: 'Perform deep scan with additional checks',
      default: false
    },
    checkSecrets: {
      type: 'boolean' as const,
      description: 'Scan for hardcoded secrets',
      default: true
    },
    includeDevDependencies: {
      type: 'boolean' as const,
      description: 'Include dev dependencies in audit',
      default: false
    },
    exclude: {
      type: 'array' as const,
      description: 'Paths to exclude from scan',
      default: []
    },
    outputPath: {
      type: 'string' as const,
      description: 'Path to save report'
    },
    format: {
      type: 'string' as const,
      description: 'Report format: text, json, html',
      default: 'text'
    }
  };

  private scanner: SecurityScanner;

  constructor() {
    this.scanner = new SecurityScanner();
  }

  async execute(params: any): Promise<ToolResult> {
    const { 
      path: targetPath, 
      deepScan = false, 
      checkSecrets = true, 
      includeDevDependencies = false,
      exclude = [],
      outputPath,
      format = 'text'
    } = params;

    try {
      // Run security scan
      const report = await this.scanner.scan(targetPath, {
        deepScan,
        checkSecrets,
        includeDevDependencies,
        exclude
      });

      // Format report based on requested format
      let formattedReport: string;
      
      switch (format) {
        case 'json':
          formattedReport = JSON.stringify(report, null, 2);
          break;
          
        case 'html':
          formattedReport = this.generateHTMLReport(report);
          break;
          
        case 'text':
        default:
          formattedReport = this.scanner.formatReport(report);
          break;
      }

      // Save report if output path provided
      if (outputPath) {
        await fs.writeFile(outputPath, formattedReport);
      }

      return {
        success: true,
        data: {
          report,
          formattedReport: format === 'text' ? formattedReport : undefined,
          summary: {
            score: report.score,
            vulnerabilities: report.summary.vulnerabilitiesFound,
            critical: report.summary.critical,
            high: report.summary.high,
            files: report.summary.filesScanned,
            secrets: report.secretsFound?.length || 0,
            dependencies: report.dependencyAudit?.vulnerableDependencies || 0
          },
          outputPath
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Security scan failed: ${error.message}`
      };
    }
  }

  private generateHTMLReport(report: any): string {
    const severityColors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#f59e0b',
      low: '#3b82f6',
      info: '#6b7280'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    
    .header {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    
    .score {
      font-size: 3rem;
      font-weight: bold;
      color: ${report.score >= 80 ? '#10b981' : report.score >= 60 ? '#f59e0b' : '#dc2626'};
    }
    
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .vulnerability {
      background: white;
      padding: 1.5rem;
      margin-bottom: 1rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid #ccc;
    }
    
    .vulnerability.critical { border-left-color: ${severityColors.critical}; }
    .vulnerability.high { border-left-color: ${severityColors.high}; }
    .vulnerability.medium { border-left-color: ${severityColors.medium}; }
    .vulnerability.low { border-left-color: ${severityColors.low}; }
    .vulnerability.info { border-left-color: ${severityColors.info}; }
    
    .severity-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: bold;
      color: white;
    }
    
    .severity-badge.critical { background: ${severityColors.critical}; }
    .severity-badge.high { background: ${severityColors.high}; }
    .severity-badge.medium { background: ${severityColors.medium}; }
    .severity-badge.low { background: ${severityColors.low}; }
    .severity-badge.info { background: ${severityColors.info}; }
    
    .file-path {
      font-family: monospace;
      font-size: 0.875rem;
      color: #6b7280;
    }
    
    .recommendation {
      margin-top: 1rem;
      padding: 1rem;
      background: #f0f9ff;
      border-radius: 4px;
      border-left: 3px solid #3b82f6;
    }
    
    .secrets-section, .dependencies-section {
      background: white;
      padding: 1.5rem;
      margin-bottom: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    th {
      background: #f9fafb;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Scan Report</h1>
    <div class="score">Score: ${report.score}/100</div>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="summary">
    <div class="summary-card">
      <h3>Files Scanned</h3>
      <p style="font-size: 2rem; margin: 0;">${report.summary.filesScanned}</p>
    </div>
    <div class="summary-card">
      <h3>Total Vulnerabilities</h3>
      <p style="font-size: 2rem; margin: 0;">${report.summary.vulnerabilitiesFound}</p>
    </div>
    <div class="summary-card">
      <h3>Critical Issues</h3>
      <p style="font-size: 2rem; margin: 0; color: ${severityColors.critical};">${report.summary.critical}</p>
    </div>
    <div class="summary-card">
      <h3>High Risk Issues</h3>
      <p style="font-size: 2rem; margin: 0; color: ${severityColors.high};">${report.summary.high}</p>
    </div>
  </div>
  
  ${report.vulnerabilities.length > 0 ? `
    <h2>Vulnerabilities</h2>
    ${report.vulnerabilities.map((vuln: any) => `
      <div class="vulnerability ${vuln.severity}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>${vuln.message}</h3>
          <span class="severity-badge ${vuln.severity}">${vuln.severity.toUpperCase()}</span>
        </div>
        ${vuln.file ? `<p class="file-path">${vuln.file}${vuln.line ? `:${vuln.line}` : ''}</p>` : ''}
        <p>${vuln.description}</p>
        <div class="recommendation">
          <strong>Recommendation:</strong> ${vuln.recommendation}
        </div>
        ${vuln.cwe ? `<p style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">References: ${vuln.cwe}${vuln.owasp ? `, ${vuln.owasp}` : ''}</p>` : ''}
      </div>
    `).join('')}
  ` : ''}
  
  ${report.secretsFound && report.secretsFound.length > 0 ? `
    <div class="secrets-section">
      <h2>🔑 Secrets Found</h2>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>File</th>
            <th>Line</th>
            <th>Entropy</th>
          </tr>
        </thead>
        <tbody>
          ${report.secretsFound.map((secret: any) => `
            <tr>
              <td>${secret.type}</td>
              <td>${secret.file}</td>
              <td>${secret.line}</td>
              <td>${secret.entropy.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''}
  
  ${report.dependencyAudit && report.dependencyAudit.vulnerabilities.length > 0 ? `
    <div class="dependencies-section">
      <h2>📦 Dependency Vulnerabilities</h2>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Version</th>
            <th>Severity</th>
            <th>Vulnerability</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          ${report.dependencyAudit.vulnerabilities.map((dep: any) => `
            <tr>
              <td>${dep.package}</td>
              <td>${dep.version}</td>
              <td><span class="severity-badge ${dep.severity}">${dep.severity.toUpperCase()}</span></td>
              <td>${dep.vulnerability}</td>
              <td>${dep.recommendation}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''}
  
  ${report.recommendations.length > 0 ? `
    <div class="recommendations-section" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2>💡 Recommendations</h2>
      <ul>
        ${report.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
      </ul>
    </div>
  ` : ''}
</body>
</html>`;
  }
}

export class VulnerabilityFixerTool implements Tool {
  name = 'vulnerabilityFixer';
  description = 'Automatically fix security vulnerabilities where possible';
  
  parameters = {
    reportPath: {
      type: 'string' as const,
      description: 'Path to security scan report JSON file'
    },
    report: {
      type: 'object' as const,
      description: 'Security scan report object'
    },
    fixTypes: {
      type: 'array' as const,
      description: 'Types of fixes to apply',
      default: ['dependencies', 'code-quality', 'configuration']
    },
    dryRun: {
      type: 'boolean' as const,
      description: 'Show what would be fixed without applying changes',
      default: false
    }
  };

  async execute(params: any): Promise<ToolResult> {
    const { reportPath, report, fixTypes = ['dependencies', 'code-quality', 'configuration'], dryRun = false } = params;

    try {
      // Load report
      let scanReport = report;
      if (!scanReport && reportPath) {
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        scanReport = JSON.parse(reportContent);
      }

      if (!scanReport) {
        return {
          success: false,
          error: 'Either report or reportPath must be provided'
        };
      }

      const fixes = {
        applied: [] as any[],
        skipped: [] as any[],
        failed: [] as any[]
      };

      // Fix dependencies
      if (fixTypes.includes('dependencies') && scanReport.dependencyAudit) {
        await this.fixDependencies(scanReport.dependencyAudit, fixes, dryRun);
      }

      // Fix code quality issues
      if (fixTypes.includes('code-quality')) {
        await this.fixCodeQualityIssues(scanReport.vulnerabilities, fixes, dryRun);
      }

      // Fix configuration issues
      if (fixTypes.includes('configuration')) {
        await this.fixConfigurationIssues(scanReport.vulnerabilities, fixes, dryRun);
      }

      return {
        success: true,
        data: {
          fixes,
          summary: {
            applied: fixes.applied.length,
            skipped: fixes.skipped.length,
            failed: fixes.failed.length,
            dryRun
          }
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Vulnerability fixing failed: ${error.message}`
      };
    }
  }

  private async fixDependencies(audit: any, fixes: any, dryRun: boolean) {
    for (const dep of audit.vulnerabilities) {
      if (dep.recommendation.includes('Update to')) {
        const fix = {
          type: 'dependency',
          package: dep.package,
          action: dep.recommendation,
          severity: dep.severity
        };

        if (!dryRun) {
          try {
            // Extract version from recommendation
            const versionMatch = dep.recommendation.match(/Update to (.+)/);
            if (versionMatch) {
              const version = versionMatch[1];
              await fs.appendFile('fix-commands.sh', `npm install ${dep.package}@${version}\n`);
              fixes.applied.push(fix);
            } else {
              fixes.skipped.push({ ...fix, reason: 'Could not parse version' });
            }
          } catch (error: any) {
            fixes.failed.push({ ...fix, error: error.message });
          }
        } else {
          fixes.applied.push({ ...fix, dryRun: true });
        }
      }
    }
  }

  private async fixCodeQualityIssues(vulnerabilities: any[], fixes: any, dryRun: boolean) {
    for (const vuln of vulnerabilities) {
      if (vuln.file && vuln.line) {
        // Simple fixes that can be automated
        if (vuln.message.includes('console statements')) {
          const fix = {
            type: 'code-quality',
            file: vuln.file,
            line: vuln.line,
            action: 'Remove console statement',
            severity: vuln.severity
          };

          if (!dryRun) {
            try {
              const content = await fs.readFile(vuln.file, 'utf-8');
              const lines = content.split('\n');
              
              if (lines[vuln.line - 1].includes('console.')) {
                lines[vuln.line - 1] = '// ' + lines[vuln.line - 1] + ' // TODO: Remove in production';
                await fs.writeFile(vuln.file, lines.join('\n'));
                fixes.applied.push(fix);
              }
            } catch (error: any) {
              fixes.failed.push({ ...fix, error: error.message });
            }
          } else {
            fixes.applied.push({ ...fix, dryRun: true });
          }
        }
      }
    }
  }

  private async fixConfigurationIssues(vulnerabilities: any[], fixes: any, dryRun: boolean) {
    // Example: Add security headers to Express apps
    const securityHeaders = vulnerabilities.filter(v => 
      v.message.includes('security headers') || 
      v.message.includes('helmet')
    );

    if (securityHeaders.length > 0) {
      const fix = {
        type: 'configuration',
        action: 'Add security headers middleware',
        files: ['app.js', 'server.js', 'index.js']
      };

      if (!dryRun) {
        try {
          // This is a simplified example
          await fs.appendFile('security-fixes.md', `
## Security Headers

Add the following to your Express application:

\`\`\`javascript
const helmet = require('helmet');
app.use(helmet());
\`\`\`

Don't forget to install helmet:
\`\`\`bash
npm install helmet
\`\`\`
`);
          fixes.applied.push(fix);
        } catch (error: any) {
          fixes.failed.push({ ...fix, error: error.message });
        }
      } else {
        fixes.applied.push({ ...fix, dryRun: true });
      }
    }
  }
}