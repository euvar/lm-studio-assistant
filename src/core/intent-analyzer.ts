import { LMStudioProvider } from '../providers/lmstudio.js';

export interface Intent {
  type: 'weather' | 'crypto_price' | 'file_operation' | 'web_search' | 'general_chat' | 'unknown';
  confidence: number;
  entities: {
    [key: string]: string;
  };
  suggestedQuery?: string;
}

export class IntentAnalyzer {
  private provider: LMStudioProvider;

  constructor(provider: LMStudioProvider) {
    this.provider = provider;
  }

  async analyzeIntent(userInput: string): Promise<Intent> {
    const prompt = `Analyze this user input and determine the intent.

User input: "${userInput}"

Determine:
1. Intent type (weather/crypto_price/file_operation/web_search/general_chat)
2. Key entities (city, currency, file path, etc.)
3. Suggested search query if needed

Respond in JSON format:
{
  "type": "intent_type",
  "entities": {"entity": "value"},
  "suggestedQuery": "optimized search query"
}`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: 'You are an intent analyzer. Analyze user inputs and extract intent.' },
        { role: 'user', content: prompt }
      ]);

      // Try to parse the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type || 'unknown',
          confidence: 0.8,
          entities: parsed.entities || {},
          suggestedQuery: parsed.suggestedQuery
        };
      }
    } catch (error) {
      // Fallback to pattern matching
    }

    // Fallback pattern matching
    return this.patternBasedAnalysis(userInput);
  }

  private patternBasedAnalysis(input: string): Intent {
    const lowerInput = input.toLowerCase();
    
    // Weather patterns
    const weatherPatterns = [
      /погода|weather|температура|temperature|прогноз|forecast/i,
      /какая\s+погода|what.*weather|how.*weather/i,
      /холодно|жарко|тепло|дождь|снег|cold|hot|warm|rain|snow/i
    ];
    
    // Crypto patterns
    const cryptoPatterns = [
      /биткоин|bitcoin|btc|криптовалют|cryptocurrency|crypto/i,
      /курс|price|стоимость|cost|цена/i,
      /ethereum|eth|эфир|ripple|xrp/i
    ];
    
    // File patterns
    const filePatterns = [
      /файл|file|папк|folder|directory|директор/i,
      /создай|create|удали|delete|покажи|show|список|list/i,
      /\.txt|\.js|\.json|\.md|\.py/i
    ];

    // Check weather
    if (weatherPatterns.some(p => p.test(lowerInput))) {
      // Extract city
      const cityMatch = lowerInput.match(/(?:в|in|для|for)\s+([а-яА-Яa-zA-Z\s]+?)(?:\?|$|,|\s+сегодня|\s+today)/);
      const city = cityMatch ? cityMatch[1].trim() : 'Moscow';
      
      return {
        type: 'weather',
        confidence: 0.9,
        entities: { city },
        suggestedQuery: `weather in ${city} today`
      };
    }

    // Check crypto
    if (cryptoPatterns.some(p => p.test(lowerInput))) {
      const currencyMatch = lowerInput.match(/(bitcoin|btc|биткоин|ethereum|eth|эфир|ripple|xrp)/i);
      const currency = currencyMatch ? currencyMatch[1] : 'bitcoin';
      
      return {
        type: 'crypto_price',
        confidence: 0.9,
        entities: { currency },
        suggestedQuery: `${currency} price USD today`
      };
    }

    // Check files
    if (filePatterns.some(p => p.test(lowerInput))) {
      return {
        type: 'file_operation',
        confidence: 0.8,
        entities: {},
      };
    }

    // Default to web search for questions
    if (lowerInput.includes('?') || lowerInput.includes('что') || lowerInput.includes('как')) {
      return {
        type: 'web_search',
        confidence: 0.6,
        entities: {},
        suggestedQuery: input
      };
    }

    return {
      type: 'general_chat',
      confidence: 0.5,
      entities: {}
    };
  }
}