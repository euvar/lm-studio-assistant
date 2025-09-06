import { EventEmitter } from 'events';
import * as readline from 'readline';

type EditorMode = 'normal' | 'vim' | 'emacs';
type VimMode = 'normal' | 'insert' | 'visual' | 'command';

interface KeyBinding {
  key: string;
  modifiers?: string[];
  action: string;
  description: string;
}

export class EditorModeManager extends EventEmitter {
  private mode: EditorMode = 'normal';
  private vimMode: VimMode = 'normal';
  private vimRegister: Map<string, string> = new Map();
  private vimMacro: Map<string, string[]> = new Map();
  private isRecordingMacro: boolean = false;
  private macroRegister: string = '';
  private commandBuffer: string = '';
  private visualStart: number = -1;
  private visualEnd: number = -1;
  
  // Emacs specific
  private emacsMarkSet: boolean = false;
  private emacsMarkPosition: number = -1;
  private killRing: string[] = [];
  private killRingIndex: number = 0;

  constructor() {
    super();
  }

  setMode(mode: EditorMode) {
    this.mode = mode;
    this.emit('modeChanged', mode);
  }

  getMode(): EditorMode {
    return this.mode;
  }

  // Handle key press based on current mode
  handleKeyPress(key: readline.Key, content: string, cursorPosition: number): {
    action?: string;
    newContent?: string;
    newPosition?: number;
    message?: string;
  } {
    switch (this.mode) {
      case 'vim':
        return this.handleVimKey(key, content, cursorPosition);
      case 'emacs':
        return this.handleEmacsKey(key, content, cursorPosition);
      default:
        return {};
    }
  }

  // Vim key handling
  private handleVimKey(key: readline.Key, content: string, cursorPosition: number) {
    const char = key.sequence;

    switch (this.vimMode) {
      case 'normal':
        return this.handleVimNormalMode(char || '', content, cursorPosition);
      case 'insert':
        return this.handleVimInsertMode(key, content, cursorPosition);
      case 'visual':
        return this.handleVimVisualMode(char || '', content, cursorPosition);
      case 'command':
        return this.handleVimCommandMode(char || '', content, cursorPosition);
    }
  }

  private handleVimNormalMode(char: string, content: string, position: number) {
    const lines = content.split('\n');
    const currentLineIndex = this.getLineIndex(content, position);
    const currentLine = lines[currentLineIndex];
    const columnIndex = position - content.substring(0, position).lastIndexOf('\n') - 1;

    switch (char) {
      // Movement
      case 'h':
        return { newPosition: Math.max(0, position - 1) };
      case 'l':
        return { newPosition: Math.min(content.length - 1, position + 1) };
      case 'j': {
        const nextLineStart = content.indexOf('\n', position) + 1;
        if (nextLineStart > 0 && nextLineStart < content.length) {
          const nextLine = lines[currentLineIndex + 1];
          const newColumn = Math.min(columnIndex, nextLine.length);
          return { newPosition: nextLineStart + newColumn };
        }
        return {};
      }
      case 'k': {
        if (currentLineIndex > 0) {
          const prevLine = lines[currentLineIndex - 1];
          const prevLineStart = content.lastIndexOf('\n', position - 1) - prevLine.length;
          const newColumn = Math.min(columnIndex, prevLine.length);
          return { newPosition: prevLineStart + newColumn };
        }
        return {};
      }

      // Word movement
      case 'w': {
        const match = content.substring(position).match(/\w+/);
        if (match && match.index !== undefined) {
          return { newPosition: position + match.index + match[0].length };
        }
        return {};
      }
      case 'b': {
        const before = content.substring(0, position);
        const lastWord = before.match(/\w+\s*$/);
        if (lastWord && lastWord.index !== undefined) {
          return { newPosition: lastWord.index };
        }
        return {};
      }

      // Line movement
      case '0':
        return { newPosition: content.lastIndexOf('\n', position - 1) + 1 };
      case '$': {
        const nextNewline = content.indexOf('\n', position);
        return { newPosition: nextNewline > -1 ? nextNewline : content.length };
      }
      case 'G': {
        const lastLineStart = content.lastIndexOf('\n') + 1;
        return { newPosition: lastLineStart };
      }
      case 'g':
        if (this.commandBuffer === 'g') {
          this.commandBuffer = '';
          return { newPosition: 0 };
        }
        this.commandBuffer = 'g';
        return {};

      // Mode changes
      case 'i':
        this.vimMode = 'insert';
        return { message: '-- INSERT --' };
      case 'a':
        this.vimMode = 'insert';
        return { newPosition: position + 1, message: '-- INSERT --' };
      case 'o': {
        this.vimMode = 'insert';
        const lineEnd = content.indexOf('\n', position);
        const insertPos = lineEnd > -1 ? lineEnd : content.length;
        const newContent = content.substring(0, insertPos) + '\n' + content.substring(insertPos);
        return { 
          newContent, 
          newPosition: insertPos + 1,
          message: '-- INSERT --'
        };
      }
      case 'v':
        this.vimMode = 'visual';
        this.visualStart = position;
        this.visualEnd = position;
        return { message: '-- VISUAL --' };
      case ':':
        this.vimMode = 'command';
        this.commandBuffer = ':';
        return { message: ':' };

      // Editing
      case 'd':
        if (this.commandBuffer === 'd') {
          // Delete line
          const lineStart = content.lastIndexOf('\n', position - 1) + 1;
          const lineEnd = content.indexOf('\n', position) + 1;
          const deletedText = content.substring(lineStart, lineEnd || content.length);
          this.vimRegister.set('"', deletedText);
          const newContent = content.substring(0, lineStart) + content.substring(lineEnd || content.length);
          this.commandBuffer = '';
          return { newContent, newPosition: lineStart };
        }
        this.commandBuffer = 'd';
        return {};

      case 'y':
        if (this.commandBuffer === 'y') {
          // Yank line
          const lineStart = content.lastIndexOf('\n', position - 1) + 1;
          const lineEnd = content.indexOf('\n', position) + 1;
          const yankedText = content.substring(lineStart, lineEnd || content.length);
          this.vimRegister.set('"', yankedText);
          this.commandBuffer = '';
          return { message: '1 line yanked' };
        }
        this.commandBuffer = 'y';
        return {};

      case 'p': {
        // Paste
        const pasteText = this.vimRegister.get('"') || '';
        const newContent = content.substring(0, position + 1) + pasteText + content.substring(position + 1);
        return { newContent, newPosition: position + pasteText.length };
      }

      case 'u': {
        // Undo - emit event for external handling
        this.emit('undo');
        return { action: 'undo' };
      }

      default:
        this.commandBuffer = '';
        return {};
    }
  }

  private handleVimInsertMode(key: readline.Key, content: string, position: number) {
    if (key.name === 'escape') {
      this.vimMode = 'normal';
      return { message: '', newPosition: Math.max(0, position - 1) };
    }
    // Let normal typing happen in insert mode
    return {};
  }

  private handleVimVisualMode(char: string, content: string, position: number) {
    // Update visual selection
    this.visualEnd = position;

    switch (char) {
      case 'escape':
        this.vimMode = 'normal';
        this.visualStart = -1;
        this.visualEnd = -1;
        return { message: '' };

      case 'd': {
        // Delete selection
        const start = Math.min(this.visualStart, this.visualEnd);
        const end = Math.max(this.visualStart, this.visualEnd);
        const deletedText = content.substring(start, end + 1);
        this.vimRegister.set('"', deletedText);
        const newContent = content.substring(0, start) + content.substring(end + 1);
        this.vimMode = 'normal';
        this.visualStart = -1;
        this.visualEnd = -1;
        return { newContent, newPosition: start, message: '' };
      }

      case 'y': {
        // Yank selection
        const start = Math.min(this.visualStart, this.visualEnd);
        const end = Math.max(this.visualStart, this.visualEnd);
        const yankedText = content.substring(start, end + 1);
        this.vimRegister.set('"', yankedText);
        this.vimMode = 'normal';
        this.visualStart = -1;
        this.visualEnd = -1;
        return { message: `${yankedText.length} characters yanked` };
      }

      default:
        // Allow movement in visual mode
        return this.handleVimNormalMode(char, content, position);
    }
  }

  private handleVimCommandMode(char: string, content: string, position: number) {
    if (char === '\r' || char === '\n') {
      // Execute command
      const command = this.commandBuffer.substring(1);
      this.vimMode = 'normal';
      this.commandBuffer = '';
      
      // Handle basic commands
      if (command === 'w') {
        this.emit('save');
        return { action: 'save', message: 'File saved' };
      } else if (command === 'q') {
        this.emit('quit');
        return { action: 'quit' };
      } else if (command === 'wq') {
        this.emit('save');
        this.emit('quit');
        return { action: 'save-quit' };
      }
      
      return { message: `Unknown command: ${command}` };
    } else if (char === '\x1b') {
      // Escape
      this.vimMode = 'normal';
      this.commandBuffer = '';
      return { message: '' };
    } else {
      this.commandBuffer += char;
      return { message: this.commandBuffer };
    }
  }

  // Emacs key handling
  private handleEmacsKey(key: readline.Key, content: string, position: number) {
    const ctrl = key.ctrl || false;
    const meta = key.meta || false;
    const char = key.sequence;

    if (ctrl) {
      switch (key.name) {
        case 'a':
          // Beginning of line
          return { newPosition: content.lastIndexOf('\n', position - 1) + 1 };
        case 'e': {
          // End of line
          const nextNewline = content.indexOf('\n', position);
          return { newPosition: nextNewline > -1 ? nextNewline : content.length };
        }
        case 'b':
          // Backward char
          return { newPosition: Math.max(0, position - 1) };
        case 'f':
          // Forward char
          return { newPosition: Math.min(content.length, position + 1) };
        case 'p': {
          // Previous line
          const lines = content.split('\n');
          const currentLineIndex = this.getLineIndex(content, position);
          if (currentLineIndex > 0) {
            const prevLine = lines[currentLineIndex - 1];
            const prevLineStart = content.lastIndexOf('\n', position - 1) - prevLine.length;
            return { newPosition: prevLineStart };
          }
          return {};
        }
        case 'n': {
          // Next line
          const nextLineStart = content.indexOf('\n', position) + 1;
          if (nextLineStart > 0 && nextLineStart < content.length) {
            return { newPosition: nextLineStart };
          }
          return {};
        }
        case 'k': {
          // Kill to end of line
          const lineEnd = content.indexOf('\n', position);
          const end = lineEnd > -1 ? lineEnd : content.length;
          const killedText = content.substring(position, end);
          this.killRing.push(killedText);
          this.killRingIndex = this.killRing.length - 1;
          const newContent = content.substring(0, position) + content.substring(end);
          return { newContent };
        }
        case 'y': {
          // Yank from kill ring
          if (this.killRing.length > 0) {
            const yankedText = this.killRing[this.killRingIndex];
            const newContent = content.substring(0, position) + yankedText + content.substring(position);
            return { newContent, newPosition: position + yankedText.length };
          }
          return {};
        }
        case 'space':
          // Set mark
          this.emacsMarkSet = true;
          this.emacsMarkPosition = position;
          return { message: 'Mark set' };
        case 'w': {
          // Kill region
          if (this.emacsMarkSet && this.emacsMarkPosition >= 0) {
            const start = Math.min(position, this.emacsMarkPosition);
            const end = Math.max(position, this.emacsMarkPosition);
            const killedText = content.substring(start, end);
            this.killRing.push(killedText);
            this.killRingIndex = this.killRing.length - 1;
            const newContent = content.substring(0, start) + content.substring(end);
            this.emacsMarkSet = false;
            return { newContent, newPosition: start };
          }
          return {};
        }
        case 'g':
          // Quit command
          this.emit('quit');
          return { action: 'quit' };
        case 'x':
          if (this.commandBuffer === 'C-x') {
            this.commandBuffer = '';
            // C-x C-s: save
            if (char === 's') {
              this.emit('save');
              return { action: 'save', message: 'File saved' };
            }
            // C-x C-c: quit
            if (char === 'c') {
              this.emit('quit');
              return { action: 'quit' };
            }
          } else {
            this.commandBuffer = 'C-x';
            return {};
          }
          break;
      }
    }

    if (meta) {
      switch (key.name) {
        case 'b': {
          // Backward word
          const before = content.substring(0, position);
          const lastWord = before.match(/\w+\s*$/);
          if (lastWord && lastWord.index !== undefined) {
            return { newPosition: lastWord.index };
          }
          return {};
        }
        case 'f': {
          // Forward word
          const match = content.substring(position).match(/\w+/);
          if (match && match.index !== undefined) {
            return { newPosition: position + match.index + match[0].length };
          }
          return {};
        }
        case 'y':
          // Rotate kill ring
          if (this.killRing.length > 1) {
            this.killRingIndex = (this.killRingIndex + 1) % this.killRing.length;
            return { message: `Kill ring position: ${this.killRingIndex + 1}/${this.killRing.length}` };
          }
          return {};
      }
    }

    this.commandBuffer = '';
    return {};
  }

  private getLineIndex(content: string, position: number): number {
    return content.substring(0, position).split('\n').length - 1;
  }

  // Get key bindings for current mode
  getKeyBindings(): KeyBinding[] {
    switch (this.mode) {
      case 'vim':
        return this.getVimBindings();
      case 'emacs':
        return this.getEmacsBindings();
      default:
        return [];
    }
  }

  private getVimBindings(): KeyBinding[] {
    return [
      { key: 'h', action: 'Move left', description: 'Move cursor left' },
      { key: 'j', action: 'Move down', description: 'Move cursor down' },
      { key: 'k', action: 'Move up', description: 'Move cursor up' },
      { key: 'l', action: 'Move right', description: 'Move cursor right' },
      { key: 'i', action: 'Insert mode', description: 'Enter insert mode' },
      { key: 'a', action: 'Append', description: 'Enter insert mode after cursor' },
      { key: 'o', action: 'Open line', description: 'Open new line below' },
      { key: 'dd', action: 'Delete line', description: 'Delete current line' },
      { key: 'yy', action: 'Yank line', description: 'Copy current line' },
      { key: 'p', action: 'Paste', description: 'Paste after cursor' },
      { key: 'u', action: 'Undo', description: 'Undo last change' },
      { key: ':w', action: 'Save', description: 'Save file' },
      { key: ':q', action: 'Quit', description: 'Quit editor' },
      { key: 'ESC', action: 'Normal mode', description: 'Return to normal mode' }
    ];
  }

  private getEmacsBindings(): KeyBinding[] {
    return [
      { key: 'C-a', action: 'Beginning of line', description: 'Move to beginning of line' },
      { key: 'C-e', action: 'End of line', description: 'Move to end of line' },
      { key: 'C-b', action: 'Backward char', description: 'Move backward one character' },
      { key: 'C-f', action: 'Forward char', description: 'Move forward one character' },
      { key: 'M-b', action: 'Backward word', description: 'Move backward one word' },
      { key: 'M-f', action: 'Forward word', description: 'Move forward one word' },
      { key: 'C-p', action: 'Previous line', description: 'Move to previous line' },
      { key: 'C-n', action: 'Next line', description: 'Move to next line' },
      { key: 'C-k', action: 'Kill line', description: 'Kill to end of line' },
      { key: 'C-y', action: 'Yank', description: 'Yank from kill ring' },
      { key: 'C-space', action: 'Set mark', description: 'Set mark at current position' },
      { key: 'C-w', action: 'Kill region', description: 'Kill marked region' },
      { key: 'C-x C-s', action: 'Save', description: 'Save file' },
      { key: 'C-x C-c', action: 'Quit', description: 'Quit editor' }
    ];
  }

  // Get current mode status
  getStatus(): string {
    if (this.mode === 'vim') {
      switch (this.vimMode) {
        case 'insert':
          return '-- INSERT --';
        case 'visual':
          return '-- VISUAL --';
        case 'command':
          return this.commandBuffer;
        default:
          return '';
      }
    }
    return '';
  }
}

// Export singleton instance
export const editorModes = new EditorModeManager();