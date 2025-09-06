import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import FormData from 'form-data';
import axios from 'axios';

const execAsync = promisify(exec);

interface VoiceConfig {
  whisperApiKey?: string;
  whisperApiUrl?: string;
  language?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  audioDevice?: string;
  sampleRate?: number;
  enableTTS?: boolean;
  ttsVoice?: string;
}

interface TranscriptionResult {
  text: string;
  language: string;
  confidence?: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export class VoiceInterface extends EventEmitter {
  private config: VoiceConfig;
  private isRecording: boolean = false;
  private recordingProcess: any = null;
  private audioQueue: string[] = [];
  private processingQueue: boolean = false;

  constructor(config: VoiceConfig = {}) {
    super();
    this.config = {
      whisperApiUrl: 'https://api.openai.com/v1/audio/transcriptions',
      language: 'auto',
      sampleRate: 16000,
      enableTTS: true,
      ttsVoice: 'en-US-Standard-A',
      ...config
    };
  }

  // Start voice recording
  async startRecording(outputPath?: string): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const audioFile = outputPath || path.join('/tmp', `recording_${Date.now()}.wav`);
    this.isRecording = true;

    // Platform-specific recording commands
    const recordCommand = this.getRecordCommand(audioFile);
    
    try {
      this.emit('recordingStarted', { file: audioFile });
      
      if (process.platform === 'darwin') {
        // macOS: Use sox or ffmpeg
        this.recordingProcess = exec(recordCommand);
      } else if (process.platform === 'linux') {
        // Linux: Use arecord or ffmpeg
        this.recordingProcess = exec(recordCommand);
      } else if (process.platform === 'win32') {
        // Windows: Use PowerShell
        this.recordingProcess = exec(recordCommand);
      }

      return audioFile;
    } catch (error) {
      this.isRecording = false;
      throw error;
    }
  }

  // Stop voice recording
  async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.recordingProcess) {
      return null;
    }

    this.isRecording = false;
    
    // Stop the recording process
    if (process.platform === 'win32') {
      // Windows: Send Ctrl+C
      this.recordingProcess.stdin.write('\x03');
    } else {
      // Unix: Send SIGINT
      this.recordingProcess.kill('SIGINT');
    }

    this.emit('recordingStoped');
    return 'Recording stopped';
  }

  // Transcribe audio using Whisper
  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    this.emit('transcriptionStarted', { file: audioPath });

    try {
      let result: TranscriptionResult;

      if (this.config.useLocalWhisper) {
        result = await this.transcribeLocal(audioPath);
      } else {
        result = await this.transcribeAPI(audioPath);
      }

      this.emit('transcriptionCompleted', result);
      return result;
    } catch (error) {
      this.emit('transcriptionError', error);
      throw error;
    }
  }

  // Transcribe using local Whisper
  private async transcribeLocal(audioPath: string): Promise<TranscriptionResult> {
    const whisperPath = this.config.localWhisperPath || 'whisper';
    const language = this.config.language === 'auto' ? '' : `--language ${this.config.language}`;
    
    const command = `${whisperPath} ${audioPath} --model base ${language} --output_format json`;
    
    try {
      const { stdout } = await execAsync(command);
      const result = JSON.parse(stdout);
      
      return {
        text: result.text,
        language: result.language || this.config.language || 'unknown',
        segments: result.segments
      };
    } catch (error) {
      throw new Error(`Local Whisper transcription failed: ${error}`);
    }
  }

  // Transcribe using OpenAI Whisper API
  private async transcribeAPI(audioPath: string): Promise<TranscriptionResult> {
    if (!this.config.whisperApiKey) {
      throw new Error('Whisper API key not configured');
    }

    const form = new FormData();
    form.append('file', await fs.readFile(audioPath), path.basename(audioPath));
    form.append('model', 'whisper-1');
    
    if (this.config.language !== 'auto') {
      form.append('language', this.config.language);
    }

    try {
      const response = await axios.post(
        this.config.whisperApiUrl!,
        form,
        {
          headers: {
            'Authorization': `Bearer ${this.config.whisperApiKey}`,
            ...form.getHeaders()
          }
        }
      );

      return {
        text: response.data.text,
        language: response.data.language || this.config.language || 'unknown'
      };
    } catch (error: any) {
      throw new Error(`Whisper API transcription failed: ${error.message}`);
    }
  }

  // Text-to-speech
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.config.enableTTS) {
      return;
    }

    this.emit('ttStarted', { text, options });

    try {
      const audioFile = await this.generateSpeech(text, options);
      await this.playAudio(audioFile);
      
      // Clean up
      await fs.unlink(audioFile).catch(() => {});
      
      this.emit('ttsCompleted');
    } catch (error) {
      this.emit('ttsError', error);
      throw error;
    }
  }

  // Generate speech audio
  private async generateSpeech(text: string, options: TTSOptions): Promise<string> {
    const outputFile = path.join('/tmp', `speech_${Date.now()}.mp3`);
    
    if (process.platform === 'darwin') {
      // macOS: Use say command
      const voice = options.voice || this.config.ttsVoice || 'Samantha';
      const rate = options.speed ? Math.round(options.speed * 200) : 200;
      
      await execAsync(`say -v ${voice} -r ${rate} -o ${outputFile} "${text}"`);
    } else if (process.platform === 'linux') {
      // Linux: Use espeak or festival
      const speed = options.speed ? Math.round(options.speed * 175) : 175;
      
      await execAsync(`espeak "${text}" -s ${speed} -w ${outputFile}`);
    } else if (process.platform === 'win32') {
      // Windows: Use SAPI
      const script = `
        Add-Type -AssemblyName System.Speech
        $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $speak.SetOutputToWaveFile("${outputFile}")
        $speak.Speak("${text}")
        $speak.Dispose()
      `;
      
      await execAsync(`powershell -Command "${script}"`);
    }

    return outputFile;
  }

  // Play audio file
  private async playAudio(audioPath: string): Promise<void> {
    let playCommand: string;

    if (process.platform === 'darwin') {
      playCommand = `afplay "${audioPath}"`;
    } else if (process.platform === 'linux') {
      // Try multiple players
      const players = ['aplay', 'play', 'mpg123', 'ffplay'];
      for (const player of players) {
        try {
          await execAsync(`which ${player}`);
          playCommand = `${player} "${audioPath}"`;
          break;
        } catch {
          continue;
        }
      }
      if (!playCommand!) {
        throw new Error('No audio player found');
      }
    } else if (process.platform === 'win32') {
      playCommand = `powershell -c "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`;
    } else {
      throw new Error('Unsupported platform');
    }

    await execAsync(playCommand);
  }

  // Get platform-specific record command
  private getRecordCommand(outputFile: string): string {
    if (process.platform === 'darwin') {
      // macOS
      return `sox -d -r ${this.config.sampleRate} -c 1 -b 16 "${outputFile}"`;
    } else if (process.platform === 'linux') {
      // Linux
      const device = this.config.audioDevice || 'default';
      return `arecord -D ${device} -f S16_LE -r ${this.config.sampleRate} -c 1 "${outputFile}"`;
    } else if (process.platform === 'win32') {
      // Windows PowerShell script
      return `powershell -Command "
        Add-Type -TypeDefinition @'
        using System;
        using System.IO;
        using System.Threading;
        using NAudio.Wave;
        
        public class Recorder {
          public static void Record(string outputFile, int sampleRate) {
            var waveIn = new WaveInEvent();
            waveIn.WaveFormat = new WaveFormat(sampleRate, 16, 1);
            var writer = new WaveFileWriter(outputFile, waveIn.WaveFormat);
            
            waveIn.DataAvailable += (s, e) => writer.Write(e.Buffer, 0, e.BytesRecorded);
            waveIn.StartRecording();
            
            Console.ReadLine();
            
            waveIn.StopRecording();
            writer.Close();
          }
        }
        '@ -ReferencedAssemblies NAudio.dll
        
        [Recorder]::Record('${outputFile}', ${this.config.sampleRate})
      "`;
    } else {
      throw new Error('Unsupported platform');
    }
  }

  // Voice activity detection
  async detectVoiceActivity(audioPath: string): Promise<boolean> {
    try {
      // Simple VAD using sox
      const { stdout } = await execAsync(
        `sox "${audioPath}" -n stat 2>&1 | grep "Maximum amplitude" | awk '{print $3}'`
      );
      
      const maxAmplitude = parseFloat(stdout.trim());
      return maxAmplitude > 0.1; // Threshold for voice activity
    } catch {
      return true; // Assume voice activity if detection fails
    }
  }

  // Continuous listening mode
  async startListening(callback: (text: string) => void): Promise<void> {
    this.emit('listeningStarted');
    
    const listen = async () => {
      if (!this.isRecording) {
        return;
      }

      try {
        // Record for 3 seconds chunks
        const audioFile = await this.recordChunk(3000);
        
        // Check for voice activity
        const hasVoice = await this.detectVoiceActivity(audioFile);
        
        if (hasVoice) {
          // Transcribe
          const result = await this.transcribe(audioFile);
          
          if (result.text.trim()) {
            callback(result.text);
          }
        }
        
        // Clean up
        await fs.unlink(audioFile).catch(() => {});
        
        // Continue listening
        if (this.isRecording) {
          setTimeout(listen, 100);
        }
      } catch (error) {
        this.emit('listeningError', error);
      }
    };

    this.isRecording = true;
    listen();
  }

  // Record audio chunk
  private async recordChunk(durationMs: number): Promise<string> {
    const audioFile = path.join('/tmp', `chunk_${Date.now()}.wav`);
    
    const recordCommand = this.getRecordCommand(audioFile);
    const timeoutCommand = process.platform === 'win32' 
      ? `timeout /t ${Math.ceil(durationMs / 1000)}`
      : `timeout ${durationMs / 1000}s`;

    await execAsync(`${recordCommand} & ${timeoutCommand}`);
    
    return audioFile;
  }

  // Stop continuous listening
  stopListening(): void {
    this.isRecording = false;
    this.emit('listeningStopped');
  }

  // Voice commands support
  async processVoiceCommand(audioPath: string): Promise<{ command: string; confidence: number }> {
    const result = await this.transcribe(audioPath);
    
    // Simple command extraction
    const commands = [
      { pattern: /^(?:hey |ok |)(?:assistant|computer|jarvis)/i, type: 'wake' },
      { pattern: /(?:create|make|build) (?:a |an |)(.+)/i, type: 'create' },
      { pattern: /(?:search|find|look for) (.+)/i, type: 'search' },
      { pattern: /(?:run|execute|start) (.+)/i, type: 'execute' },
      { pattern: /(?:stop|cancel|abort)/i, type: 'stop' },
      { pattern: /(?:help|what can you do)/i, type: 'help' }
    ];

    for (const cmd of commands) {
      const match = result.text.match(cmd.pattern);
      if (match) {
        return {
          command: cmd.type,
          confidence: result.confidence || 0.9
        };
      }
    }

    return {
      command: result.text,
      confidence: result.confidence || 0.5
    };
  }

  // Language detection from voice
  async detectLanguageFromVoice(audioPath: string): Promise<string> {
    // Transcribe without specifying language
    const tempConfig = { ...this.config, language: 'auto' };
    this.config = tempConfig;
    
    const result = await this.transcribe(audioPath);
    
    return result.language;
  }

  // Noise reduction
  async reduceNoise(inputPath: string, outputPath: string): Promise<void> {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Use sox for noise reduction
      await execAsync(
        `sox "${inputPath}" "${outputPath}" noisered /tmp/noise.prof 0.21`
      );
    } else {
      // On Windows, just copy (no built-in noise reduction)
      await fs.copyFile(inputPath, outputPath);
    }
  }

  // Get audio devices
  async getAudioDevices(): Promise<string[]> {
    const devices: string[] = [];
    
    try {
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync('system_profiler SPAudioDataType');
        // Parse macOS audio devices
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('Device ID:')) {
            devices.push(line.split(':')[1].trim());
          }
        });
      } else if (process.platform === 'linux') {
        const { stdout } = await execAsync('arecord -l');
        // Parse ALSA devices
        const matches = stdout.match(/card \d+:.+device \d+:.+/g);
        if (matches) {
          devices.push(...matches);
        }
      } else if (process.platform === 'win32') {
        // Use PowerShell to get audio devices
        const { stdout } = await execAsync(
          'powershell -Command "Get-AudioDevice -List | Select-Object -Property Name"'
        );
        devices.push(...stdout.split('\n').filter(line => line.trim()));
      }
    } catch (error) {
      console.error('Failed to get audio devices:', error);
    }
    
    return devices;
  }
}