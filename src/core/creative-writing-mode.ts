import { EventEmitter } from 'events';
import { LMStudioProvider } from '../providers/lmstudio.js';
import chalk from 'chalk';

export interface WritingOptions {
  style?: 'story' | 'poem' | 'script' | 'essay' | 'dialogue' | 'lyrics' | 'free';
  genre?: string;
  tone?: 'formal' | 'casual' | 'humorous' | 'serious' | 'dramatic' | 'whimsical';
  length?: 'short' | 'medium' | 'long';
  audience?: 'general' | 'technical' | 'children' | 'professional' | 'academic';
  language?: string;
  constraints?: string[];
  temperature?: number;
  perspective?: 'first' | 'second' | 'third';
  tense?: 'past' | 'present' | 'future';
}

export interface WritingPrompt {
  type: 'generate' | 'continue' | 'rewrite' | 'expand' | 'summarize' | 'polish';
  input: string;
  options: WritingOptions;
}

export interface WritingSession {
  id: string;
  title: string;
  pieces: WritingPiece[];
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalWords: number;
    genre?: string;
    style?: string;
  };
}

export interface WritingPiece {
  id: string;
  content: string;
  prompt: WritingPrompt;
  timestamp: Date;
  wordCount: number;
  version: number;
  previousVersions?: string[];
}

export class CreativeWritingMode extends EventEmitter {
  private provider: LMStudioProvider;
  private isActive: boolean = false;
  private currentSession: WritingSession | null = null;
  private sessions: Map<string, WritingSession> = new Map();
  private templates: Map<string, string>;
  private writingTips: Map<string, string[]>;
  
  constructor(provider: LMStudioProvider) {
    super();
    this.provider = provider;
    this.templates = this.initializeTemplates();
    this.writingTips = this.initializeWritingTips();
  }

  private initializeTemplates(): Map<string, string> {
    const templates = new Map<string, string>();
    
    templates.set('story_structure', `Create a story with:
- Hook: An opening that immediately captures attention
- Setup: Establish setting, characters, and initial situation
- Rising Action: Build tension and develop conflict
- Climax: The turning point or moment of highest tension
- Resolution: How the conflict is resolved
- Denouement: The aftermath and closing`);
    
    templates.set('poem_forms', `Poetry forms to consider:
- Haiku: 5-7-5 syllables, nature-focused
- Sonnet: 14 lines, specific rhyme scheme
- Free Verse: No fixed structure, focus on rhythm and imagery
- Limerick: 5 lines, AABBA rhyme, humorous
- Ballad: Narrative poem, often in quatrains`);
    
    templates.set('dialogue_techniques', `Effective dialogue should:
- Sound natural and conversational
- Reveal character through word choice and speech patterns
- Advance the plot or reveal information
- Include subtext and unspoken tension
- Use action beats to break up long speeches
- Vary sentence length and structure`);
    
    templates.set('essay_structure', `Essay organization:
- Introduction: Hook, context, thesis statement
- Body Paragraphs: Topic sentence, evidence, analysis, transition
- Counterarguments: Address opposing views
- Conclusion: Restate thesis, synthesize points, call to action`);
    
    return templates;
  }

  private initializeWritingTips(): Map<string, string[]> {
    const tips = new Map<string, string[]>();
    
    tips.set('story', [
      'Show, don\'t tell - use vivid details and actions',
      'Create compelling characters with clear motivations',
      'Use all five senses in your descriptions',
      'Vary sentence length for better rhythm',
      'Start in medias res - in the middle of action'
    ]);
    
    tips.set('poem', [
      'Use concrete imagery rather than abstract concepts',
      'Pay attention to sound - alliteration, assonance, rhythm',
      'Break lines for emphasis and breathing',
      'Use metaphor and simile to create connections',
      'End with a powerful image or revelation'
    ]);
    
    tips.set('dialogue', [
      'Give each character a unique voice',
      'Use contractions and informal speech naturally',
      'Include pauses, interruptions, and overlaps',
      'Let subtext carry emotional weight',
      'Use dialect and slang sparingly but effectively'
    ]);
    
    return tips;
  }

  activate(options?: WritingOptions) {
    this.isActive = true;
    this.startNewSession(options);
    this.emit('activated', { options });
    
    console.log(chalk.magenta('\n✨ Creative Writing Mode Activated!\n'));
    this.displayWelcomeMessage(options);
  }

  private displayWelcomeMessage(options?: WritingOptions) {
    const style = options?.style || 'free';
    const tips = this.writingTips.get(style) || [];
    
    console.log(chalk.dim('I can help you create:'));
    console.log(chalk.dim('  📖 Stories - Short stories, chapters, or scenes'));
    console.log(chalk.dim('  📝 Poems - Various forms and styles'));
    console.log(chalk.dim('  🎭 Scripts - Screenplays, stage plays, or sketches'));
    console.log(chalk.dim('  📄 Essays - Academic, personal, or persuasive'));
    console.log(chalk.dim('  💬 Dialogue - Conversations and character interactions'));
    console.log(chalk.dim('  🎵 Lyrics - Song lyrics with rhythm and rhyme'));
    
    if (tips.length > 0) {
      console.log(chalk.cyan('\n💡 Writing Tips:'));
      tips.forEach(tip => console.log(chalk.dim(`  • ${tip}`)));
    }
    
    console.log(chalk.dim('\nCommands:'));
    console.log(chalk.dim('  continue - Continue from where you left off'));
    console.log(chalk.dim('  rewrite - Try a different approach'));
    console.log(chalk.dim('  expand - Add more detail to a section'));
    console.log(chalk.dim('  polish - Refine and improve the writing'));
    console.log(chalk.dim('  save - Save your work'));
    console.log(chalk.dim('  sessions - View all writing sessions'));
    console.log('');
  }

  deactivate() {
    this.isActive = false;
    if (this.currentSession) {
      this.saveSession(this.currentSession);
    }
    this.emit('deactivated');
    console.log(chalk.yellow('\n📚 Exiting Creative Writing Mode\n'));
  }

  isWritingMode(): boolean {
    return this.isActive;
  }

  private startNewSession(options?: WritingOptions) {
    const session: WritingSession = {
      id: `session_${Date.now()}`,
      title: this.generateSessionTitle(options),
      pieces: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        totalWords: 0,
        genre: options?.genre,
        style: options?.style
      }
    };
    
    this.currentSession = session;
    this.sessions.set(session.id, session);
  }

  private generateSessionTitle(options?: WritingOptions): string {
    const date = new Date().toLocaleDateString();
    const style = options?.style || 'Writing';
    return `${style.charAt(0).toUpperCase() + style.slice(1)} - ${date}`;
  }

  async generate(prompt: WritingPrompt): Promise<string> {
    if (!this.currentSession) {
      this.startNewSession(prompt.options);
    }
    
    const systemPrompt = this.buildWritingSystemPrompt(prompt);
    const enhancedInput = this.enhanceWritingInput(prompt);
    
    try {
      console.log(chalk.dim('🖊️  Generating creative content...'));
      
      // Use appropriate temperature for creative writing
      const temperature = prompt.options.temperature || this.getDefaultTemperature(prompt.options.style);
      
      const response = await this.provider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedInput }
      ], temperature, this.getMaxTokens(prompt.options.length));
      
      const output = response.content;
      const wordCount = this.countWords(output);
      
      // Create writing piece
      const piece: WritingPiece = {
        id: `piece_${Date.now()}`,
        content: output,
        prompt,
        timestamp: new Date(),
        wordCount,
        version: 1
      };
      
      // Add to current session
      if (this.currentSession) {
        this.currentSession.pieces.push(piece);
        this.currentSession.updatedAt = new Date();
        this.currentSession.metadata.totalWords += wordCount;
      }
      
      // Format and display output
      const formattedOutput = this.formatWritingOutput(output, prompt.options.style);
      this.displayWritingPiece(formattedOutput, wordCount);
      
      this.emit('generated', { prompt, output: formattedOutput, wordCount });
      
      return formattedOutput;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private buildWritingSystemPrompt(prompt: WritingPrompt): string {
    const basePrompt = `You are a talented creative writer with expertise in various literary forms and styles. 
You create engaging, original content that captivates readers while following specific requirements.`;
    
    const styleInstructions = this.getStyleInstructions(prompt.options);
    const constraintInstructions = this.getConstraintInstructions(prompt.options.constraints);
    const audienceInstructions = this.getAudienceInstructions(prompt.options.audience);
    
    return `${basePrompt}

${styleInstructions}

${audienceInstructions}

${constraintInstructions}

Writing guidelines:
- Use vivid, sensory language
- Create engaging narratives or arguments
- Maintain consistency in voice and style
- Pay attention to pacing and rhythm
- ${prompt.options.perspective ? `Write in ${prompt.options.perspective} person perspective` : ''}
- ${prompt.options.tense ? `Use ${prompt.options.tense} tense` : ''}`;
  }

  private getStyleInstructions(options: WritingOptions): string {
    const style = options.style || 'free';
    const tone = options.tone || 'casual';
    
    switch (style) {
      case 'story':
        return `Write engaging narrative fiction.
Style: ${options.genre || 'general fiction'}
Tone: ${tone}
Focus on: Character development, plot progression, vivid descriptions, emotional resonance`;
        
      case 'poem':
        return `Craft evocative poetry.
Form: ${options.genre || 'free verse'}
Tone: ${tone}
Focus on: Imagery, rhythm, sound, metaphor, emotional impact`;
        
      case 'script':
        return `Write in screenplay/stage play format.
Genre: ${options.genre || 'drama'}
Tone: ${tone}
Include: Character names in CAPS, action lines, dialogue, scene headings`;
        
      case 'essay':
        return `Compose a well-structured essay.
Type: ${options.genre || 'expository'}
Tone: ${tone}
Include: Clear thesis, supporting arguments, evidence, logical flow`;
        
      case 'dialogue':
        return `Create natural, engaging dialogue.
Context: ${options.genre || 'contemporary'}
Tone: ${tone}
Focus on: Distinct character voices, subtext, conflict, revelation`;
        
      case 'lyrics':
        return `Write song lyrics.
Genre: ${options.genre || 'pop'}
Tone: ${tone}
Include: Verses, chorus, bridge, rhyme scheme, rhythm`;
        
      default:
        return `Express ideas creatively and engagingly.
Tone: ${tone}
Be imaginative and original in your approach.`;
    }
  }

  private getAudienceInstructions(audience?: string): string {
    switch (audience) {
      case 'children':
        return 'Write for a young audience using simple language, engaging imagery, and age-appropriate themes.';
      case 'technical':
        return 'Write for a technically savvy audience, using appropriate terminology while remaining engaging.';
      case 'academic':
        return 'Write in an academic style with formal language, citations where appropriate, and scholarly tone.';
      case 'professional':
        return 'Write for a professional audience with clear, concise language and industry-appropriate tone.';
      default:
        return 'Write for a general audience, balancing accessibility with depth.';
    }
  }

  private getConstraintInstructions(constraints?: string[]): string {
    if (!constraints || constraints.length === 0) {
      return '';
    }
    
    return `Specific requirements:
${constraints.map(c => `- ${c}`).join('\n')}`;
  }

  private enhanceWritingInput(prompt: WritingPrompt): string {
    const { type, input } = prompt;
    
    switch (type) {
      case 'continue':
        return `Continue this ${prompt.options.style || 'piece'} seamlessly from where it ends:

${input}

[Continue writing from here, maintaining the same voice, style, and narrative flow...]`;
        
      case 'rewrite':
        return `Rewrite this passage with a ${prompt.options.tone || 'different'} approach, ${
          prompt.options.style ? `as a ${prompt.options.style}` : 'keeping the core message'
        }:

${input}`;
        
      case 'expand':
        return `Expand this section with more detail, depth, and development:

${input}

[Add rich details, develop ideas further, and enhance the narrative...]`;
        
      case 'summarize':
        return `Create a ${prompt.options.length || 'concise'} summary of:

${input}`;
        
      case 'polish':
        return `Polish and refine this writing, improving flow, clarity, and impact:

${input}`;
        
      default:
        return input;
    }
  }

  private getDefaultTemperature(style?: WritingOptions['style']): number {
    switch (style) {
      case 'poem':
        return 0.9;
      case 'story':
        return 0.8;
      case 'lyrics':
        return 0.85;
      case 'dialogue':
        return 0.75;
      case 'script':
        return 0.7;
      case 'essay':
        return 0.6;
      default:
        return 0.8;
    }
  }

  private getMaxTokens(length?: WritingOptions['length']): number {
    switch (length) {
      case 'short':
        return 500;
      case 'medium':
        return 1500;
      case 'long':
        return 3000;
      default:
        return 1500;
    }
  }

  private formatWritingOutput(output: string, style?: WritingOptions['style']): string {
    // Clean up the output
    output = output.trim();
    
    switch (style) {
      case 'poem':
        // Preserve line breaks and add subtle formatting
        return output.split('\n').map(line => 
          line.trim() ? chalk.italic(line) : ''
        ).join('\n');
        
      case 'script':
        // Format character names and stage directions
        return output
          .replace(/^([A-Z][A-Z\s]+):/gm, (match, name) => 
            chalk.bold.cyan(`${name}:`))
          .replace(/\[([^\]]+)\]/g, (match, direction) => 
            chalk.dim(`[${direction}]`))
          .replace(/\(([^\)]+)\)/g, (match, parenthetical) => 
            chalk.dim(`(${parenthetical})`));
        
      case 'dialogue':
        // Format dialogue with proper quotation styling
        return output
          .replace(/"([^"]+)"/g, (match, dialogue) => 
            chalk.white(`"${dialogue}"`))
          .replace(/^(\w+):/gm, (match, speaker) => 
            chalk.bold(`${speaker}:`));
        
      default:
        return output;
    }
  }

  private displayWritingPiece(content: string, wordCount: number) {
    console.log('\n' + chalk.gray('─'.repeat(60)) + '\n');
    console.log(content);
    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(chalk.dim(`📊 Word count: ${wordCount}`));
    console.log('');
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  async continueWriting(): Promise<string> {
    if (!this.currentSession || this.currentSession.pieces.length === 0) {
      throw new Error('No writing to continue from');
    }
    
    const lastPiece = this.currentSession.pieces[this.currentSession.pieces.length - 1];
    const prompt: WritingPrompt = {
      type: 'continue',
      input: lastPiece.content,
      options: lastPiece.prompt.options
    };
    
    return this.generate(prompt);
  }

  async rewriteLastPiece(options?: Partial<WritingOptions>): Promise<string> {
    if (!this.currentSession || this.currentSession.pieces.length === 0) {
      throw new Error('No writing to rewrite');
    }
    
    const lastPiece = this.currentSession.pieces[this.currentSession.pieces.length - 1];
    const prompt: WritingPrompt = {
      type: 'rewrite',
      input: lastPiece.content,
      options: { ...lastPiece.prompt.options, ...options }
    };
    
    const result = await this.generate(prompt);
    
    // Store as new version
    const updatedPiece = this.currentSession.pieces[this.currentSession.pieces.length - 1];
    updatedPiece.previousVersions = updatedPiece.previousVersions || [];
    updatedPiece.previousVersions.push(lastPiece.content);
    updatedPiece.version += 1;
    
    return result;
  }

  getSessions(): WritingSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getSession(sessionId: string): WritingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  private saveSession(session: WritingSession) {
    this.sessions.set(session.id, session);
    this.emit('sessionSaved', session);
  }

  async exportSession(sessionId: string, format: 'text' | 'markdown' | 'html' = 'markdown'): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    const content = session.pieces.map(piece => piece.content).join('\n\n---\n\n');
    const metadata = `Title: ${session.title}
Created: ${session.createdAt.toLocaleString()}
Total Words: ${session.metadata.totalWords}
Style: ${session.metadata.style || 'Mixed'}
Genre: ${session.metadata.genre || 'General'}`;
    
    switch (format) {
      case 'text':
        return `${metadata}\n\n${'='.repeat(60)}\n\n${content}`;
        
      case 'markdown':
        return `# ${session.title}

## Metadata
${metadata}

---

${content}`;
        
      case 'html':
        return `<!DOCTYPE html>
<html>
<head>
  <title>${session.title}</title>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: Georgia, serif; 
      max-width: 800px; 
      margin: 40px auto; 
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #333; }
    .metadata { 
      background: #f5f5f5; 
      padding: 15px; 
      border-radius: 5px;
      margin-bottom: 30px;
    }
    .piece { 
      margin: 40px 0; 
      padding: 20px 0;
      border-bottom: 1px solid #ddd;
    }
    hr { margin: 40px 0; border: none; border-top: 2px solid #ddd; }
  </style>
</head>
<body>
  <h1>${session.title}</h1>
  <div class="metadata">
    <pre>${metadata}</pre>
  </div>
  ${session.pieces.map(piece => 
    `<div class="piece">${piece.content.replace(/\n/g, '<br>')}</div>`
  ).join('<hr>')}
</body>
</html>`;
        
      default:
        return content;
    }
  }

  async brainstormIdeas(topic: string, style?: WritingOptions['style'], count: number = 5): Promise<string[]> {
    const styleContext = style ? `for ${style} writing` : '';
    const prompt = `Generate ${count} creative and unique ideas ${styleContext} related to: ${topic}

Make each idea:
- Specific and actionable
- Different in approach or angle
- Interesting and engaging
- Suitable for creative writing

Format as a numbered list with brief descriptions.`;
    
    const response = await this.provider.chat([
      { role: 'system', content: 'You are a creative writing coach helping brainstorm ideas.' },
      { role: 'user', content: prompt }
    ], 0.9);
    
    // Parse the response
    const ideas = response.content
      .split('\n')
      .filter(line => line.match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
    
    return ideas;
  }

  getWritingPrompts(style?: WritingOptions['style']): string[] {
    const prompts: Record<string, string[]> = {
      story: [
        'A door appears in your bedroom wall that wasn\'t there before...',
        'The last person on Earth sits alone in a room. There\'s a knock on the door...',
        'You wake up one day with the ability to hear everyone\'s thoughts...',
        'A letter arrives addressed to you from 100 years in the future...',
        'Every photograph you take shows how things will look in 24 hours...'
      ],
      poem: [
        'Write about the silence between heartbeats',
        'Capture the feeling of rain on a summer evening',
        'Describe a color to someone who has never seen',
        'The weight of words left unspoken',
        'Where shadows go when the lights turn on'
      ],
      dialogue: [
        'Two strangers stuck in an elevator realize they share a secret',
        'A parent and child switch bodies for a day',
        'The first conversation between humans and newly-arrived aliens',
        'Two people saying goodbye without using the word "goodbye"',
        'A job interview where both parties are hiding something'
      ],
      essay: [
        'The impact of a single decision that changed your life',
        'Why failure is more valuable than success',
        'The art that exists in everyday moments',
        'How technology changes the way we remember',
        'The philosophy of a perfect day'
      ]
    };
    
    return prompts[style || 'story'] || prompts.story;
  }
}