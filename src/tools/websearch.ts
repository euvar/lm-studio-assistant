import axios from 'axios';
import * as cheerio from 'cheerio';
import { Tool, ToolResult } from './base.js';
import { SimpleProgress } from '../core/progress.js';

interface SearchResult {
  title: string;
  snippet: string;
  url?: string;
}

export const webSearchTool: Tool = {
  name: 'webSearch',
  description: 'Search the web for information',
  async execute(params: { query: string }): Promise<ToolResult> {
    // Validate input
    if (!params || !params.query) {
      return {
        success: false,
        error: 'Search query is required',
      };
    }
    
    const progress = new SimpleProgress(`Searching for "${params.query}"...`);
    
    try {
      // For weather queries, enhance the search
      let enhancedQuery = params.query;
      const weatherKeywords = ['weather', 'погода', 'temperature', 'температура', 'forecast', 'прогноз'];
      const isWeatherQuery = weatherKeywords.some(keyword => 
        params.query.toLowerCase().includes(keyword)
      );
      
      if (isWeatherQuery && !params.query.includes('site:')) {
        // Add reliable weather sites to search
        enhancedQuery = `${params.query} site:weather.com OR site:timeanddate.com OR site:weather.gov`;
      }
      
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(enhancedQuery)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      progress.update('Parsing search results...');
      const $ = cheerio.load(response.data);
      const results: SearchResult[] = [];
      
      // Parse search results
      $('.result').each((index, element) => {
        if (index >= 5) return; // Limit to 5 results
        
        const $result = $(element);
        const title = $result.find('.result__title').text().trim();
        const snippet = $result.find('.result__snippet').text().trim();
        const url = $result.find('.result__url').text().trim();
        
        if (title && snippet) {
          results.push({ title, snippet, url });
        }
      });

      // Format results for display
      let formattedResults = '';
      if (results.length > 0) {
        formattedResults = results.map((r, i) => 
          `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url ? `🔗 ${r.url}` : ''}`
        ).join('\n\n');
        progress.succeed(`Found ${results.length} results`);
      } else {
        formattedResults = 'No results found. Try different search terms.';
        progress.info('No results found');
      }

      return {
        success: true,
        data: formattedResults,
      };
    } catch (error) {
      progress.fail('Search failed');
      return {
        success: false,
        error: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

export const fetchWebPageTool: Tool = {
  name: 'fetchWebPage',
  description: 'Fetch and extract content from a specific webpage',
  async execute(params: { url: string }): Promise<ToolResult> {
    try {
      const response = await axios.get(params.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      
      // Check for common captcha/robot check indicators
      const pageText = $('body').text().toLowerCase();
      const title = $('title').text().trim();
      
      if (
        pageText.includes('captcha') ||
        pageText.includes('не робот') ||
        pageText.includes('robot check') ||
        pageText.includes('cloudflare') ||
        pageText.includes('проверка безопасности') ||
        title.includes('Just a moment') ||
        title.includes('Проверка')
      ) {
        return {
          success: false,
          error: 'This website requires human verification (captcha/robot check). Try using webSearch instead, or ask for specific information that can be found through search results.',
        };
      }
      
      // Remove script and style elements
      $('script, style').remove();
      
      // Extract content
      const h1 = $('h1').first().text().trim();
      
      // Try to get main content
      let content = '';
      
      // Look for main content areas
      const contentSelectors = ['main', 'article', '.content', '#content', '.post', '[role="main"]'];
      for (const selector of contentSelectors) {
        if ($(selector).length > 0) {
          content = $(selector).first().text().trim();
          break;
        }
      }
      
      // Fallback to body if no specific content area found
      if (!content) {
        content = $('body').text().trim();
      }
      
      // Clean up whitespace and limit length
      content = content
        .replace(/\s+/g, ' ')
        .substring(0, 2000);

      // If content is too short or seems invalid
      if (content.length < 50) {
        return {
          success: false,
          error: 'Could not extract meaningful content from this page. The page might be dynamically loaded or protected.',
        };
      }

      return {
        success: true,
        data: {
          title: title || h1,
          url: params.url,
          content: content,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          return {
            success: false,
            error: 'Access forbidden. The website is blocking automated requests. Try using webSearch for general information instead.',
          };
        }
      }
      return {
        success: false,
        error: `Failed to fetch webpage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};