import { execSync } from 'child_process';

export interface OSInfo {
  platform: 'darwin' | 'linux' | 'win32' | 'unknown';
  name: string;
  version?: string;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
}

export class OSDetector {
  private static instance: OSDetector;
  private osInfo: OSInfo | null = null;

  static getInstance(): OSDetector {
    if (!OSDetector.instance) {
      OSDetector.instance = new OSDetector();
    }
    return OSDetector.instance;
  }

  getOSInfo(): OSInfo {
    if (this.osInfo) {
      return this.osInfo;
    }

    const platform = process.platform as 'darwin' | 'linux' | 'win32';
    let name = 'Unknown';
    let version: string | undefined;

    switch (platform) {
      case 'darwin':
        name = 'macOS';
        try {
          version = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
        } catch {}
        break;
      
      case 'linux':
        name = 'Linux';
        try {
          const releaseInfo = execSync('cat /etc/os-release', { encoding: 'utf8' });
          const nameMatch = releaseInfo.match(/^NAME="?(.+?)"?$/m);
          if (nameMatch) {
            name = nameMatch[1];
          }
          const versionMatch = releaseInfo.match(/^VERSION="?(.+?)"?$/m);
          if (versionMatch) {
            version = versionMatch[1];
          }
        } catch {
          // Try lsb_release as fallback
          try {
            name = execSync('lsb_release -si', { encoding: 'utf8' }).trim();
            version = execSync('lsb_release -sr', { encoding: 'utf8' }).trim();
          } catch {}
        }
        break;
      
      case 'win32':
        name = 'Windows';
        try {
          version = execSync('ver', { encoding: 'utf8' }).trim();
        } catch {}
        break;
    }

    this.osInfo = {
      platform,
      name,
      version,
      isWindows: platform === 'win32',
      isMac: platform === 'darwin',
      isLinux: platform === 'linux'
    };

    return this.osInfo;
  }

  getCommandVariant(commands: {
    default: string;
    darwin?: string;
    linux?: string;
    win32?: string;
  }): string {
    const osInfo = this.getOSInfo();
    if (osInfo.platform === 'darwin' && commands.darwin) {
      return commands.darwin;
    } else if (osInfo.platform === 'linux' && commands.linux) {
      return commands.linux;
    } else if (osInfo.platform === 'win32' && commands.win32) {
      return commands.win32;
    }
    return commands.default;
  }

  // Common command mappings
  getProcessListCommand(sortBy?: 'memory' | 'cpu', limit: number = 10): string {
    const osInfo = this.getOSInfo();
    
    if (osInfo.isMac) {
      if (sortBy === 'memory') {
        return `ps aux | sort -nrk 4 | head -n ${limit}`;
      } else if (sortBy === 'cpu') {
        return `ps aux | sort -nrk 3 | head -n ${limit}`;
      } else {
        return 'ps aux';
      }
    } else if (osInfo.isLinux) {
      if (sortBy === 'memory') {
        return `ps aux --sort=-%mem | head -n ${limit}`;
      } else if (sortBy === 'cpu') {
        return `ps aux --sort=-%cpu | head -n ${limit}`;
      } else {
        return 'ps aux';
      }
    } else if (osInfo.isWindows) {
      if (sortBy === 'memory') {
        return `powershell "Get-Process | Sort-Object -Property WS -Descending | Select-Object -First ${limit} | Format-Table -AutoSize"`;
      } else if (sortBy === 'cpu') {
        return `powershell "Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First ${limit} | Format-Table -AutoSize"`;
      } else {
        return 'tasklist';
      }
    }
    
    return 'ps aux';
  }

  getSystemInfoCommand(): string {
    return this.getCommandVariant({
      default: 'uname -a',
      darwin: 'uname -a && sw_vers',
      linux: 'uname -a && cat /etc/os-release',
      win32: 'systeminfo'
    });
  }

  getDirectoryListCommand(path: string = '.'): string {
    return this.getCommandVariant({
      default: `ls -la ${path}`,
      win32: `dir ${path}`
    });
  }

  getProcessCountCommand(): string {
    return this.getCommandVariant({
      default: 'ps aux | wc -l',
      win32: 'powershell "(Get-Process).Count"'
    });
  }
}

// Export singleton instance
export const osDetector = OSDetector.getInstance();