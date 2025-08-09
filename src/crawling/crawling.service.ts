import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as puppeteer from 'puppeteer-core';
import * as chromium from 'chromium';
import { CrawlResult } from './crawling.controller';
import { BedrockService } from '../services/bedrock.service';
import { DatabaseService, CrawlRecord } from '../services/database.service';

export interface AdvancedCrawlResult extends CrawlResult {
  chunks?: string[];
  embeddingDimensions?: number;
  totalChunks?: number;
  executionTime?: number;
}

export interface PageContent {
  title: string;
  text: string;
  url: string;
}

@Injectable()
export class CrawlingService {
  private readonly logger = new Logger(CrawlingService.name);
  private crawlJobs: Map<string, any> = new Map();

  constructor(
    private readonly bedrockService: BedrockService,
    private readonly databaseService: DatabaseService
  ) {}

  async crawlUrl(url: string, depth: number = 1, selector?: string): Promise<CrawlResult> {
    try {
      this.logger.log(`Starting crawl for URL: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      const title = $('title').text().trim() || '';
      const content = selector 
        ? $(selector).text().trim()
        : $('body').text().trim();
      
      const links: string[] = [];
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && href.startsWith('http')) {
          links.push(href);
        }
      });

      const result: CrawlResult = {
        url,
        title,
        content: content.substring(0, 5000),
        links: links.slice(0, 50),
        timestamp: new Date()
      };

      this.logger.log(`Crawl completed for URL: ${url}`);
      return result;

    } catch (error) {
      this.logger.error(`Error crawling URL ${url}: ${error.message}`);
      throw new Error(`Failed to crawl URL: ${url}`);
    }
  }

  async crawlSinglePageWithPuppeteer(page: any, url: string): Promise<PageContent | null> {
    try {
      this.logger.log(`페이지 크롤링: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const content = await page.evaluate(() => {
        const elementsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'aside'];
        elementsToRemove.forEach(tag => {
          const elements = document.querySelectorAll(tag);
          elements.forEach(el => el.remove());
        });

        const mainContent = document.querySelector('main') ||
                          document.querySelector('[role="main"]') ||
                          document.querySelector('.content') ||
                          document.querySelector('#content') ||
                          document.body;

        return {
          title: document.title || '',
          text: mainContent.innerText || '',
          url: window.location.href
        };
      });

      content.text = content.text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      this.logger.log(`크롤링 완료: ${content.title} (${content.text.length}자)`);
      return content;

    } catch (error) {
      this.logger.error(`페이지 크롤링 오류 (${url}):`, error);
      return null;
    }
  }

  async collectSiteLinks(page: any, baseUrl: string): Promise<string[]> {
    try {
      const links = await page.evaluate((baseUrl) => {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const baseUrlObj = new URL(baseUrl);
        const siteLinks = new Set();

        allLinks.forEach(link => {
          try {
            const href = link.getAttribute('href');
            if (!href) return;

            let fullUrl;
            if (href.startsWith('http')) {
              fullUrl = href;
            } else if (href.startsWith('/')) {
              fullUrl = baseUrlObj.origin + href;
            } else if (href.startsWith('./') || !href.startsWith('#')) {
              fullUrl = new URL(href, baseUrl).href;
            } else {
              return;
            }

            const linkUrl = new URL(fullUrl);

            if (linkUrl.hostname === baseUrlObj.hostname) {
              if (!linkUrl.pathname.match(/\.(pdf|jpg|jpeg|png|gif|css|js|ico)$/i) &&
                  !linkUrl.pathname.includes('/api/') &&
                  !linkUrl.pathname.includes('/admin/')) {
                siteLinks.add(fullUrl);
              }
            }
          } catch (e) {
            // 잘못된 URL 무시
          }
        });

        return Array.from(siteLinks);
      }, baseUrl);

      this.logger.log(`${links.length}개의 사이트 내 링크 발견`);
      return links;

    } catch (error) {
      this.logger.error('링크 수집 오류:', error);
      return [];
    }
  }

  async crawlWebsiteWithEmbedding(url: string, maxPages: number = 10): Promise<AdvancedCrawlResult> {
    const startTime = Date.now();
    let browser = null;
    const crawledPages: PageContent[] = [];

    try {
      this.logger.log(`사이트 크롤링 시작: ${url}`);

      // 테이블 초기화
      await this.databaseService.initializeTable();

      browser = await puppeteer.launch({
        executablePath: chromium.path,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process'
        ]
      });

      const page = await browser.newPage();

      // 첫 번째 페이지 크롤링
      const firstPageContent = await this.crawlSinglePageWithPuppeteer(page, url);
      if (firstPageContent) {
        crawledPages.push(firstPageContent);
      }

      // 사이트 내 링크 수집
      const siteLinks = await this.collectSiteLinks(page, url);

      const uniqueLinks = [...new Set(siteLinks)]
        .filter(link => link !== url && !crawledPages.some(p => p.url === link))
        .slice(0, maxPages - 1);

      this.logger.log(`추가로 크롤링할 페이지: ${uniqueLinks.length}개`);

      // 각 링크 크롤링
      for (const link of uniqueLinks) {
        const pageContent = await this.crawlSinglePageWithPuppeteer(page, link);
        if (pageContent && pageContent.text.length > 100) {
          crawledPages.push(pageContent);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.log(`총 ${crawledPages.length}개 페이지 크롤링 완료`);

      // 데이터베이스에 저장 및 임베딩 생성
      const totalChunks = await this.saveToDatabase(crawledPages);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      return {
        url,
        title: crawledPages[0]?.title || '',
        content: `${crawledPages.length}개 페이지에서 ${totalChunks}개 청크 생성`,
        links: crawledPages.map(p => p.url),
        timestamp: new Date(),
        chunks: [],
        embeddingDimensions: 1024,
        totalChunks,
        executionTime
      };

    } catch (error) {
      this.logger.error('웹사이트 크롤링 오류:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private splitTextIntoChunks(text: string, maxChunkSize: number = 1000): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async saveToDatabase(crawledPages: PageContent[]): Promise<number> {
    // 기존 URL들 삭제
    const urls = crawledPages.map(page => page.url);
    if (urls.length > 0) {
      await this.databaseService.deleteByUrls(urls);
    }

    let totalChunks = 0;
    const records: CrawlRecord[] = [];

    // 각 페이지 처리
    for (let pageIndex = 0; pageIndex < crawledPages.length; pageIndex++) {
      const page = crawledPages[pageIndex];
      const chunks = this.splitTextIntoChunks(page.text);

      // 각 청크에 대해 임베딩 생성
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const embedding = await this.bedrockService.createEmbedding(chunk);

        console.log('embedding:', embedding)

        records.push({
          url: page.url,
          title: page.title,
          content: chunk,
          embedding,
          chunk_index: chunkIndex,
          page_index: pageIndex
        });

        totalChunks++;
      }

      this.logger.log(`페이지 ${pageIndex + 1}/${crawledPages.length} 처리 완료: ${page.title} (${chunks.length}개 청크)`);
    }

    // 배치로 저장
    await this.databaseService.saveBatchRecords(records);
    this.logger.log(`총 ${totalChunks}개의 청크가 데이터베이스에 저장되었습니다.`);

    return totalChunks;
  }

  async batchCrawl(urls: string[]): Promise<CrawlResult[]> {
    const jobId = this.generateJobId();
    const results: CrawlResult[] = [];
    
    this.crawlJobs.set(jobId, {
      status: 'running',
      total: urls.length,
      completed: 0,
      results: []
    });

    try {
      for (const url of urls) {
        try {
          const result = await this.crawlUrl(url);
          results.push(result);
          
          const job = this.crawlJobs.get(jobId);
          job.completed += 1;
          job.results.push(result);
          this.crawlJobs.set(jobId, job);
          
        } catch (error) {
          this.logger.error(`Error in batch crawl for URL ${url}: ${error.message}`);
        }
      }

      const job = this.crawlJobs.get(jobId);
      job.status = 'completed';
      this.crawlJobs.set(jobId, job);

      return results;

    } catch (error) {
      const job = this.crawlJobs.get(jobId);
      job.status = 'failed';
      job.error = error.message;
      this.crawlJobs.set(jobId, job);
      
      throw error;
    }
  }

  async getCrawlStatus(jobId: string): Promise<any> {
    const job = this.crawlJobs.get(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    return {
      jobId,
      status: job.status,
      progress: {
        total: job.total,
        completed: job.completed,
        percentage: Math.round((job.completed / job.total) * 100)
      }
    };
  }

  async getCrawlResults(jobId: string): Promise<CrawlResult[]> {
    const job = this.crawlJobs.get(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    return job.results || [];
  }

  async searchSimilar(query: string, limit: number = 10): Promise<any> {
    try {
      // 쿼리를 임베딩으로 변환
      const queryEmbedding = await this.bedrockService.createEmbedding(query);
      
      // 유사도 검색 수행
      const results = await this.databaseService.searchSimilar(queryEmbedding, limit);
      
      return {
        query,
        results: results.map(result => ({
          id: result.id,
          url: result.url,
          title: result.title,
          content: result.content,
          similarity: 1 - result.distance, // distance를 similarity로 변환
          chunk_index: result.chunk_index,
          page_index: result.page_index,
          created_at: result.created_at
        })),
        total: results.length,
        embedding_model: 'amazon.titan-embed-text-v2:0',
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('유사도 검색 오류:', error);
      throw error;
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async extractTextFromHtml(html: string, selector?: string): Promise<string> {
    const $ = cheerio.load(html);
    
    if (selector) {
      return $(selector).text().trim();
    }
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Get text from body
    return $('body').text().trim();
  }

  async extractLinksFromHtml(html: string, baseUrl?: string): Promise<string[]> {
    const $ = cheerio.load(html);
    const links: string[] = [];
    
    $('a[href]').each((_, element) => {
      let href = $(element).attr('href');
      if (href) {
        // Convert relative URLs to absolute
        if (baseUrl && !href.startsWith('http')) {
          try {
            href = new URL(href, baseUrl).toString();
          } catch (error) {
            // Skip invalid URLs
            return;
          }
        }
        if (href.startsWith('http')) {
          links.push(href);
        }
      }
    });
    
    return [...new Set(links)]; // Remove duplicates
  }

  async isUrlAccessible(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: (status) => status < 400
      });
      return response.status < 400;
    } catch (error) {
      return false;
    }
  }
}
