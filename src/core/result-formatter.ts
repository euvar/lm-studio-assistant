import chalk from 'chalk';
import { Intent } from './intent-analyzer.js';

export class ResultFormatter {
  
  formatSearchResults(results: string, intent: Intent): string {
    switch (intent.type) {
      case 'weather':
        return this.formatWeatherResults(results, intent.entities.city || 'Unknown');
      case 'crypto_price':
        return this.formatCryptoResults(results, intent.entities.currency || 'bitcoin');
      default:
        return this.formatGenericResults(results);
    }
  }

  private formatWeatherResults(rawResults: string, city: string): string {
    // Extract temperature, conditions, and forecast
    const lines = rawResults.split('\n');
    let output = chalk.cyan(`\n🌤️  Погода в ${city}:\n\n`);
    
    let foundWeatherInfo = false;
    
    for (const line of lines) {
      // Look for temperature patterns
      const tempMatch = line.match(/(\d+)°C|(\d+)°F|температура:?\s*(\d+)/i);
      const conditionMatch = line.match(/(sunny|cloudy|rain|snow|clear|облачно|ясно|дождь|снег|солнечно)/i);
      
      if (tempMatch) {
        const temp = tempMatch[1] || tempMatch[2] || tempMatch[3];
        output += chalk.yellow(`🌡️  Температура: ${temp}°C\n`);
        foundWeatherInfo = true;
      }
      
      if (conditionMatch) {
        output += chalk.blue(`☁️  Условия: ${conditionMatch[1]}\n`);
        foundWeatherInfo = true;
      }
      
      // Look for wind
      if (line.match(/ветер|wind/i) && line.match(/\d+/)) {
        const windMatch = line.match(/(\d+)\s*(м\/с|m\/s|mph|км\/ч)/i);
        if (windMatch) {
          output += chalk.gray(`💨 Ветер: ${windMatch[1]} ${windMatch[2] || 'м/с'}\n`);
          foundWeatherInfo = true;
        }
      }
      
      // Look for humidity
      if (line.match(/влажность|humidity/i) && line.match(/\d+/)) {
        const humidityMatch = line.match(/(\d+)%/);
        if (humidityMatch) {
          output += chalk.blue(`💧 Влажность: ${humidityMatch[1]}%\n`);
          foundWeatherInfo = true;
        }
      }
    }
    
    if (!foundWeatherInfo) {
      // Fallback: show first few results nicely formatted
      const searchResults = this.extractSearchResults(rawResults);
      if (searchResults.length > 0) {
        output += chalk.dim('\nРезультаты поиска:\n');
        searchResults.slice(0, 3).forEach((result, i) => {
          output += chalk.dim(`${i + 1}. ${result.title}\n`);
          if (result.snippet) {
            output += `   ${result.snippet}\n`;
          }
        });
      }
    }
    
    return output;
  }

  private formatCryptoResults(rawResults: string, currency: string): string {
    const currencySymbols: { [key: string]: string } = {
      bitcoin: '₿',
      btc: '₿',
      биткоин: '₿',
      ethereum: 'Ξ',
      eth: 'Ξ',
      эфир: 'Ξ',
    };
    
    const symbol = currencySymbols[currency.toLowerCase()] || '💰';
    let output = chalk.cyan(`\n${symbol} Курс ${currency}:\n\n`);
    
    // Extract price information
    const priceMatch = rawResults.match(/\$\s?([\d,]+\.?\d*)/);
    const btcPriceMatch = rawResults.match(/(\d{2,3},?\d{3})\s*(USD|usd|\$)/);
    
    if (priceMatch || btcPriceMatch) {
      const price = priceMatch ? priceMatch[1] : btcPriceMatch![1];
      output += chalk.green(`💵 Текущий курс: $${price} USD\n`);
      
      // Look for percentage changes
      const percentMatch = rawResults.match(/([+-]?\d+\.?\d*)%/);
      if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        const arrow = percent >= 0 ? '📈' : '📉';
        const color = percent >= 0 ? chalk.green : chalk.red;
        output += color(`${arrow} Изменение: ${percentMatch[1]}%\n`);
      }
      
      // Look for additional info
      if (rawResults.includes('24 hour') || rawResults.includes('24h')) {
        output += chalk.dim('\n📊 Изменения за 24 часа\n');
      }
    } else {
      // Fallback to search results
      const searchResults = this.extractSearchResults(rawResults);
      searchResults.slice(0, 3).forEach((result, i) => {
        output += `${i + 1}. ${result.title}\n`;
        if (result.snippet && result.snippet.includes('$')) {
          output += chalk.green(`   ${result.snippet}\n`);
        }
      });
    }
    
    return output;
  }

  private formatGenericResults(rawResults: string): string {
    const searchResults = this.extractSearchResults(rawResults);
    
    if (searchResults.length === 0) {
      return rawResults;
    }
    
    let output = chalk.cyan('\n🔍 Результаты поиска:\n\n');
    
    searchResults.forEach((result, i) => {
      output += chalk.bold(`${i + 1}. ${result.title}\n`);
      if (result.snippet) {
        output += chalk.dim(`   ${result.snippet}\n`);
      }
      if (result.url) {
        output += chalk.blue(`   🔗 ${result.url}\n`);
      }
      output += '\n';
    });
    
    return output;
  }

  private extractSearchResults(rawText: string): Array<{title: string, snippet?: string, url?: string}> {
    const results: Array<{title: string, snippet?: string, url?: string}> = [];
    
    // Split by numbered results
    const resultBlocks = rawText.split(/\d+\.\s+\*\*/).slice(1);
    
    for (const block of resultBlocks) {
      const lines = block.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const titleMatch = lines[0].match(/^(.*?)\*\*/);
        const title = titleMatch ? titleMatch[1] : lines[0];
        
        const snippet = lines.slice(1).find(l => !l.includes('🔗') && l.trim()) || '';
        const urlLine = lines.find(l => l.includes('🔗'));
        const url = urlLine ? urlLine.replace('🔗', '').trim() : '';
        
        results.push({ title, snippet, url });
      }
    }
    
    return results;
  }
}