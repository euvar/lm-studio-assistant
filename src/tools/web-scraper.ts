import { Tool, ToolResult } from './base.js';
import { SimpleProgress } from '../core/progress.js';
import puppeteer from 'puppeteer';

interface ScraperOptions {
  waitForSelector?: string;
  screenshot?: boolean;
  fullPage?: boolean;
  extractData?: string; // JS code to run in page context
  clickElement?: string;
  scrollToBottom?: boolean;
  timeout?: number;
}

export const advancedWebScrapeTool: Tool = {
  name: 'advancedWebScrape',
  description: 'Advanced web scraping with headless Chrome (JavaScript rendering, screenshots, interactions)',
  async execute(params: { url: string; options?: ScraperOptions }): Promise<ToolResult> {
    if (!params.url) {
      return {
        success: false,
        error: 'URL is required'
      };
    }

    const progress = new SimpleProgress(`Launching headless browser...`);
    let browser;

    try {
      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      progress.update('Opening page...');
      const page = await browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1280, height: 800 });

      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to URL
      progress.update(`Navigating to ${params.url}...`);
      await page.goto(params.url, {
        waitUntil: 'networkidle2',
        timeout: params.options?.timeout || 30000
      });

      // Wait for specific selector if provided
      if (params.options?.waitForSelector) {
        progress.update(`Waiting for selector: ${params.options.waitForSelector}...`);
        await page.waitForSelector(params.options.waitForSelector, {
          timeout: params.options?.timeout || 30000
        });
      }

      // Click element if requested
      if (params.options?.clickElement) {
        progress.update(`Clicking element: ${params.options.clickElement}...`);
        await page.click(params.options.clickElement);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for any changes
      }

      // Scroll to bottom if requested
      if (params.options?.scrollToBottom) {
        progress.update('Scrolling to load content...');
        await autoScroll(page);
      }

      const results: any = {
        url: params.url,
        title: await page.title()
      };

      // Extract custom data if provided
      if (params.options?.extractData) {
        progress.update('Extracting custom data...');
        try {
          results.customData = await page.evaluate(params.options.extractData);
        } catch (error) {
          results.customDataError = `Failed to execute custom script: ${error}`;
        }
      }

      // Extract page content
      progress.update('Extracting page content...');
      results.content = await page.evaluate(() => {
        // Remove scripts and styles
        const scripts = document.querySelectorAll('script, style');
        scripts.forEach(el => el.remove());

        // Get text content
        const body = document.body;
        return body ? body.innerText.trim() : '';
      });

      // Extract structured data
      results.structuredData = await page.evaluate(() => {
        const data: any = {};

        // Meta tags
        const metaTags: Record<string, string> = {};
        document.querySelectorAll('meta').forEach(meta => {
          const name = meta.getAttribute('name') || meta.getAttribute('property');
          const content = meta.getAttribute('content');
          if (name && content) {
            metaTags[name] = content;
          }
        });
        data.meta = metaTags;

        // Headers
        data.headers = {
          h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()),
          h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim())
        };

        // Links
        data.links = Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim(),
          href: a.href
        })).filter(link => link.href && link.href.startsWith('http'));

        // Images
        data.images = Array.from(document.querySelectorAll('img')).map(img => ({
          alt: img.alt,
          src: img.src
        })).filter(img => img.src && img.src.startsWith('http'));

        return data;
      });

      // Take screenshot if requested
      if (params.options?.screenshot) {
        progress.update('Taking screenshot...');
        const screenshotBuffer = await page.screenshot({
          fullPage: params.options.fullPage || false,
          type: 'png'
        });
        results.screenshot = {
          data: (screenshotBuffer as Buffer).toString('base64'),
          type: 'png'
        };
      }

      progress.succeed('Web scraping completed');

      return {
        success: true,
        data: results
      };

    } catch (error) {
      progress.fail('Web scraping failed');
      return {
        success: false,
        error: `Advanced web scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};

// Auto-scroll function for infinite scroll pages
async function autoScroll(page: puppeteer.Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

export const extractTableDataTool: Tool = {
  name: 'extractTableData',
  description: 'Extract table data from a webpage',
  async execute(params: { url: string; tableSelector?: string }): Promise<ToolResult> {
    if (!params.url) {
      return {
        success: false,
        error: 'URL is required'
      };
    }

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      const tableData = await page.evaluate((selector: string | undefined) => {
        const tables = selector 
          ? document.querySelectorAll(selector)
          : document.querySelectorAll('table');

        return Array.from(tables).map((table, tableIndex) => {
          const headers: string[] = [];
          const rows: string[][] = [];

          // Extract headers
          const headerCells = table.querySelectorAll('thead th, thead td');
          if (headerCells.length === 0) {
            // Try first row as headers
            const firstRow = table.querySelector('tr');
            if (firstRow) {
              firstRow.querySelectorAll('th, td').forEach(cell => {
                headers.push(((cell as HTMLElement).textContent || '').trim());
              });
            }
          } else {
            headerCells.forEach(cell => {
              headers.push(((cell as HTMLElement).textContent || '').trim());
            });
          }

          // Extract data rows
          const dataRows = table.querySelectorAll('tbody tr');
          if (dataRows.length === 0) {
            // Fallback to all rows except first if no tbody
            const allRows = table.querySelectorAll('tr');
            Array.from(allRows).slice(headers.length > 0 ? 1 : 0).forEach((row: Element) => {
              const rowData: string[] = [];
              row.querySelectorAll('td, th').forEach(cell => {
                rowData.push(((cell as HTMLElement).textContent || '').trim());
              });
              if (rowData.length > 0) {
                rows.push(rowData);
              }
            });
          } else {
            dataRows.forEach((row: Element) => {
              const rowData: string[] = [];
              row.querySelectorAll('td').forEach(cell => {
                rowData.push(((cell as HTMLElement).textContent || '').trim());
              });
              if (rowData.length > 0) {
                rows.push(rowData);
              }
            });
          }

          return {
            tableIndex,
            headers,
            rows,
            rowCount: rows.length
          };
        });
      }, params.tableSelector);

      return {
        success: true,
        data: {
          url: params.url,
          tables: tableData,
          tableCount: tableData.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to extract table data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};

export const fillFormTool: Tool = {
  name: 'fillForm',
  description: 'Fill and submit forms on a webpage',
  async execute(params: { 
    url: string; 
    formData: Record<string, string>;
    submitButton?: string;
    waitAfterSubmit?: number;
  }): Promise<ToolResult> {
    if (!params.url || !params.formData) {
      return {
        success: false,
        error: 'URL and formData are required'
      };
    }

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      // Fill form fields
      for (const [selector, value] of Object.entries(params.formData)) {
        await page.waitForSelector(selector, { timeout: 5000 });
        const element = await page.$(selector);
        
        if (!element) continue;

        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        
        if (tagName === 'input' || tagName === 'textarea') {
          await page.click(selector); // Focus
          await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) el.value = '';
          }, selector);
          await page.type(selector, value);
        } else if (tagName === 'select') {
          await page.select(selector, value);
        }
      }

      let result = {
        formFilled: true,
        submitted: false,
        currentUrl: page.url(),
        pageTitle: await page.title()
      };

      // Submit form if button selector provided
      if (params.submitButton) {
        await page.click(params.submitButton);
        
        if (params.waitAfterSubmit) {
          await new Promise(resolve => setTimeout(resolve, params.waitAfterSubmit));
        } else {
          await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
        }

        result.submitted = true;
        result.currentUrl = page.url();
        result.pageTitle = await page.title();
      }

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to fill form: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};

export const captureNetworkTool: Tool = {
  name: 'captureNetwork',
  description: 'Capture network requests while loading a page',
  async execute(params: { 
    url: string; 
    filterPattern?: string;
    captureResponse?: boolean;
  }): Promise<ToolResult> {
    if (!params.url) {
      return {
        success: false,
        error: 'URL is required'
      };
    }

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      const requests: any[] = [];

      // Enable request interception
      await page.setRequestInterception(true);

      page.on('request', (request: puppeteer.HTTPRequest) => {
        const url = request.url();
        
        if (!params.filterPattern || url.includes(params.filterPattern)) {
          requests.push({
            url,
            method: request.method(),
            headers: request.headers(),
            postData: request.postData(),
            resourceType: request.resourceType(),
            timestamp: new Date().toISOString()
          });
        }

        request.continue();
      });

      if (params.captureResponse) {
        page.on('response', (response: puppeteer.HTTPResponse) => {
          const url = response.url();
          if (!params.filterPattern || url.includes(params.filterPattern)) {
            const request = requests.find(r => r.url === url);
            if (request) {
              request.response = {
                status: response.status(),
                statusText: response.statusText(),
                headers: response.headers()
              };
            }
          }
        });
      }

      await page.goto(params.url, { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for any late requests

      return {
        success: true,
        data: {
          url: params.url,
          capturedRequests: requests,
          totalRequests: requests.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to capture network: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};