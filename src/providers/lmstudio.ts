import axios, { AxiosInstance } from 'axios';

export interface LMStudioModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LMStudioProvider {
  private client: AxiosInstance;
  private currentModel: string | null = null;

  constructor(baseURL: string = 'http://localhost:1234/v1') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });
  }

  async getModels(): Promise<LMStudioModel[]> {
    try {
      const response = await this.client.get('/models');
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        const err = new Error('Cannot connect to LM Studio');
        (err as any).code = 'ECONNREFUSED';
        throw err;
      }
      throw error;
    }
  }

  setModel(modelId: string): void {
    this.currentModel = modelId;
  }

  getModel(): string | null {
    return this.currentModel;
  }

  async chat(messages: ChatMessage[], temperature: number = 0.7, maxTokens: number = 2000): Promise<ChatMessage> {
    if (!this.currentModel) {
      throw new Error('No model selected. Please select a model first.');
    }

    try {
      const response = await this.client.post<ChatCompletionResponse>('/chat/completions', {
        model: this.currentModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      });

      if (response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message;
      }

      throw new Error('No response from model');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`Model ${this.currentModel} not found. Please select a different model.`);
        }
        throw new Error(`LM Studio error: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async *chatStream(
    messages: ChatMessage[], 
    temperature: number = 0.7, 
    maxTokens: number = 2000,
    onToken?: (token: string) => void
  ): AsyncGenerator<string, void, unknown> {
    if (!this.currentModel) {
      throw new Error('No model selected. Please select a model first.');
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.currentModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }, {
        responseType: 'stream',
      });

      let buffer = '';
      
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                if (onToken) onToken(content);
                yield content;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`LM Studio streaming error: ${error.message}`);
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch {
      return false;
    }
  }
}