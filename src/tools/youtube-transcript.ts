import { Tool, ToolResult } from './base.js';
import axios from 'axios';

export class YouTubeTranscriptTool implements Tool {
  name = 'extractYouTubeTranscript';
  description = 'Extract transcript from YouTube videos for tutorial and learning content';

  async execute(params: {
    url: string;
    language?: string;
    includeTimestamps?: boolean;
  }): Promise<ToolResult> {
    const { url, language = 'en', includeTimestamps = false } = params;
    
    try {
      // Extract video ID from URL
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }
      
      // Try different methods to get transcript
      let transcript: TranscriptEntry[] | null = null;
      
      // Method 1: Try YouTube Transcript API (unofficial)
      try {
        transcript = await this.fetchTranscriptAPI(videoId, language);
      } catch (error) {
        console.log('API method failed, trying alternative...');
      }
      
      // Method 2: Scrape from YouTube page
      if (!transcript) {
        try {
          transcript = await this.fetchTranscriptScrape(videoId, language);
        } catch (error) {
          console.log('Scraping method failed');
        }
      }
      
      if (!transcript || transcript.length === 0) {
        throw new Error('Could not extract transcript. Video may not have captions.');
      }
      
      // Format transcript
      const formattedTranscript = this.formatTranscript(transcript, includeTimestamps);
      return {
        success: true,
        data: formattedTranscript
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to extract YouTube transcript: ${(error as Error).message}`
      };
    }
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/,
      /youtube\.com\/v\/([^&\s]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  private async fetchTranscriptAPI(videoId: string, language: string): Promise<TranscriptEntry[]> {
    // Using unofficial YouTube Transcript API endpoint
    const apiUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}&fmt=json3`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.data && response.data.events) {
      return response.data.events.map((event: any) => ({
        start: event.tStartMs / 1000,
        duration: event.dDurationMs / 1000,
        text: event.segs?.map((seg: any) => seg.utf8).join('') || ''
      }));
    }
    
    throw new Error('No transcript data found');
  }

  private async fetchTranscriptScrape(videoId: string, language: string): Promise<TranscriptEntry[]> {
    // Fallback: Scrape from YouTube page
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': language
      }
    });
    
    // Look for captions in the page data
    const captionRegex = /"captions":\s*({[^}]+})/;
    const match = response.data.match(captionRegex);
    
    if (!match) {
      throw new Error('No captions found in page');
    }
    
    // Parse caption tracks
    const captionTracks = this.parseCaptionTracks(match[1]);
    const track = captionTracks.find(t => t.languageCode === language) || captionTracks[0];
    
    if (!track) {
      throw new Error('No caption track found');
    }
    
    // Fetch the actual transcript
    const transcriptResponse = await axios.get(track.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    return this.parseTranscriptXML(transcriptResponse.data);
  }

  private parseCaptionTracks(captionData: string): CaptionTrack[] {
    try {
      const parsed = JSON.parse(captionData);
      if (parsed.playerCaptionsTracklistRenderer?.captionTracks) {
        return parsed.playerCaptionsTracklistRenderer.captionTracks.map((track: any) => ({
          baseUrl: track.baseUrl,
          languageCode: track.languageCode,
          name: track.name?.simpleText || track.languageCode
        }));
      }
    } catch (error) {
      console.error('Failed to parse caption tracks:', error);
    }
    return [];
  }

  private parseTranscriptXML(xml: string): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g;
    
    let match;
    while ((match = textRegex.exec(xml)) !== null) {
      entries.push({
        start: parseFloat(match[1]),
        duration: parseFloat(match[2]),
        text: this.unescapeHTML(match[3])
      });
    }
    
    return entries;
  }

  private unescapeHTML(html: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };
    
    return html.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  private formatTranscript(entries: TranscriptEntry[], includeTimestamps: boolean): string {
    if (includeTimestamps) {
      return entries.map(entry => {
        const timestamp = this.formatTimestamp(entry.start);
        return `[${timestamp}] ${entry.text}`;
      }).join('\n\n');
    } else {
      return entries.map(entry => entry.text).join(' ');
    }
  }

  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'YouTube video URL'
        },
        language: {
          type: 'string',
          description: 'Language code for transcript (default: en)'
        },
        includeTimestamps: {
          type: 'boolean',
          description: 'Include timestamps in output (default: false)'
        }
      },
      required: ['url']
    };
  }
}

interface TranscriptEntry {
  start: number;
  duration: number;
  text: string;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
}

// Create a more user-friendly wrapper
export class YouTubeLearningTool implements Tool {
  name = 'learnFromYouTube';
  description = 'Extract and analyze YouTube video content for learning';
  private transcriptTool: YouTubeTranscriptTool;

  constructor() {
    this.transcriptTool = new YouTubeTranscriptTool();
  }

  async execute(params: {
    url: string;
    summarize?: boolean;
    extractCode?: boolean;
    generateNotes?: boolean;
  }): Promise<ToolResult> {
    const { url, summarize = true, extractCode = true, generateNotes = true } = params;
    
    try {
      // Get transcript
      const transcriptResult = await this.transcriptTool.execute({ 
        url, 
        includeTimestamps: false 
      });
      
      if (!transcriptResult.success) {
        return transcriptResult;
      }
      
      const transcript = transcriptResult.data as string;
      
      const results: string[] = [];
      
      // Original transcript
      results.push('📝 Full Transcript:\n' + transcript);
      
      // Extract code snippets
      if (extractCode) {
        const codeSnippets = this.extractCodeFromTranscript(transcript);
        if (codeSnippets.length > 0) {
          results.push('\n💻 Code Snippets Found:');
          codeSnippets.forEach((snippet, index) => {
            results.push(`\nSnippet ${index + 1}:\n\`\`\`\n${snippet}\n\`\`\``);
          });
        }
      }
      
      // Generate summary
      if (summarize) {
        const summary = this.generateSummary(transcript);
        results.push('\n📋 Summary:\n' + summary);
      }
      
      // Generate study notes
      if (generateNotes) {
        const notes = this.generateStudyNotes(transcript);
        results.push('\n📚 Study Notes:\n' + notes);
      }
      
      return {
        success: true,
        data: results.join('\n')
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to process YouTube video: ${(error as Error).message}`
      };
    }
  }

  private extractCodeFromTranscript(transcript: string): string[] {
    const codePatterns = [
      // Common code indicators
      /(?:let|const|var|function|class|import|export)\s+\w+/g,
      /(?:def|import|from|class|if|for|while)\s+/g,
      /(?:public|private|static|void|int|string)\s+/g
    ];
    
    const snippets: string[] = [];
    const lines = transcript.split(/[.!?]/);
    
    for (const line of lines) {
      for (const pattern of codePatterns) {
        if (pattern.test(line)) {
          // Extract potential code snippet
          const cleaned = line.trim()
            .replace(/^(so |now |and |then |here )*/i, '')
            .replace(/(okay|alright|right)$/i, '');
          
          if (cleaned.length > 20) {
            snippets.push(cleaned);
          }
          break;
        }
      }
    }
    
    return snippets;
  }

  private generateSummary(transcript: string): string {
    // Simple extractive summary - take first and key sentences
    const sentences = transcript.match(/[^.!?]+[.!?]/g) || [];
    const keyPhrases = ['important', 'remember', 'key point', 'main', 'summary', 'conclusion'];
    
    const summary: string[] = [];
    
    // Add first sentence
    if (sentences.length > 0) {
      summary.push('• ' + sentences[0]!.trim());
    }
    
    // Find key sentences
    sentences.forEach(sentence => {
      if (keyPhrases.some(phrase => sentence.toLowerCase().includes(phrase))) {
        summary.push('• ' + sentence.trim());
      }
    });
    
    // Add last sentence
    if (sentences.length > 1) {
      summary.push('• ' + sentences[sentences.length - 1].trim());
    }
    
    return summary.slice(0, 5).join('\n');
  }

  private generateStudyNotes(transcript: string): string {
    const topics = this.extractTopics(transcript);
    const concepts = this.extractConcepts(transcript);
    
    let notes = '🎯 Key Topics:\n';
    topics.forEach(topic => {
      notes += `• ${topic}\n`;
    });
    
    notes += '\n💡 Important Concepts:\n';
    concepts.forEach(concept => {
      notes += `• ${concept}\n`;
    });
    
    return notes;
  }

  private extractTopics(transcript: string): string[] {
    // Extract potential topic indicators
    const topicPatterns = [
      /(?:today we'll|going to|learn about|discuss|cover)\s+([^.!?]+)/gi,
      /(?:topic is|subject is|talking about)\s+([^.!?]+)/gi
    ];
    
    const topics = new Set<string>();
    
    for (const pattern of topicPatterns) {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        if (match[1]) {
          topics.add(match[1].trim().substring(0, 50));
        }
      }
    }
    
    return Array.from(topics).slice(0, 5);
  }

  private extractConcepts(transcript: string): string[] {
    // Look for definition patterns
    const conceptPatterns = [
      /(?:\w+)\s+(?:is|are|means)\s+([^.!?]+)/gi,
      /(?:called|known as)\s+([^.!?]+)/gi
    ];
    
    const concepts = new Set<string>();
    
    for (const pattern of conceptPatterns) {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        if (match[1] && match[1].length < 100) {
          concepts.add(match[1].trim());
        }
      }
    }
    
    return Array.from(concepts).slice(0, 5);
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'YouTube video URL'
        },
        summarize: {
          type: 'boolean',
          description: 'Generate summary (default: true)'
        },
        extractCode: {
          type: 'boolean',
          description: 'Extract code snippets (default: true)'
        },
        generateNotes: {
          type: 'boolean',
          description: 'Generate study notes (default: true)'
        }
      },
      required: ['url']
    };
  }
}

// Export tools
export const youtubeTranscriptTool = new YouTubeTranscriptTool();
export const youtubeLearningTool = new YouTubeLearningTool();