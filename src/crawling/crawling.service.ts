import { Injectable, Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as puppeteer from 'puppeteer-core';
import * as chromium from 'chromium';
import * as pdfParse from 'pdf-parse';
import { Octokit } from '@octokit/rest';
import { marked } from 'marked';
import { CrawlResult } from './crawling.controller';
import { BedrockService } from '../services/bedrock.service';
import { DatabaseService, CrawlRecord } from '../services/database.service';

export class AdvancedCrawlResult {
  @ApiProperty({ description: 'Crawled URL', example: 'https://example.com' })
  url: string;

  @ApiProperty({ description: 'Page title', example: 'Example Page' })
  title: string;

  @ApiProperty({ description: 'Extracted content', example: 'This is the page content...' })
  content: string;

  @ApiProperty({ description: 'Found links', example: ['https://example.com/page1', 'https://example.com/page2'] })
  links: string[];

  @ApiProperty({ description: 'Crawl timestamp', example: '2024-01-01T00:00:00.000Z' })
  timestamp: Date;

  @ApiProperty({ description: 'Text chunks created', example: ['chunk1', 'chunk2'], required: false })
  chunks?: string[];

  @ApiProperty({ description: 'Embedding vector dimensions', example: 1024, required: false })
  embeddingDimensions?: number;

  @ApiProperty({ description: 'Total number of chunks created', example: 25, required: false })
  totalChunks?: number;

  @ApiProperty({ description: 'Total execution time in milliseconds', example: 15000, required: false })
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

  // URL 타입 감지
  private detectUrlType(url: string): 'pdf' | 'github' | 'markdown' | 'website' {
    if (url.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    if (url.includes('github.com')) {
      return 'github';
    }
    if (url.toLowerCase().endsWith('.md') || url.toLowerCase().endsWith('.markdown')) {
      return 'markdown';
    }
    return 'website';
  }

  // 통합 크롤링 메서드
  async crawlContent(url: string, maxPages: number = 10): Promise<AdvancedCrawlResult> {
    const urlType = this.detectUrlType(url);
    
    this.logger.log(`URL 타입 감지: ${urlType} - ${url}`);
    
    switch (urlType) {
      case 'pdf':
        return this.processPdf(url);
      case 'github':
        return this.processGitHubRepo(url);
      case 'markdown':
        return this.processMarkdown(url);
      default:
        return this.crawlWebsiteWithEmbedding(url, maxPages);
    }
  }

  // PDF 처리
  async processPdf(url: string): Promise<AdvancedCrawlResult> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`PDF 처리 시작: ${url}`);
      
      // PDF URL 접근 가능성 먼저 확인
      const isAccessible = await this.isUrlAccessible(url);
      if (!isAccessible) {
        throw new Error(`PDF URL에 접근할 수 없습니다: ${url}`);
      }
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60초로 증가
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/pdf,*/*'
        },
        maxContentLength: 50 * 1024 * 1024, // 50MB 제한
        maxBodyLength: 50 * 1024 * 1024
      });

      if (response.headers['content-type'] && !response.headers['content-type'].includes('pdf')) {
        throw new Error('응답이 PDF 파일이 아닙니다');
      }

      const pdfBuffer = Buffer.from(response.data);
      
      if (pdfBuffer.length === 0) {
        throw new Error('PDF 파일이 비어있습니다');
      }
      
      this.logger.log(`PDF 다운로드 완료: ${pdfBuffer.length} bytes`);
      
      const pdfData = await pdfParse(pdfBuffer);
      
      if (!pdfData.text || pdfData.text.trim().length === 0) {
        throw new Error('PDF에서 텍스트를 추출할 수 없습니다');
      }
      
      const content = pdfData.text.trim();
      const title = this.extractTitleFromPdf(content) || 'PDF Document';
      
      this.logger.log(`PDF 텍스트 추출 완료: ${content.length}자`);
      
      // 청크로 분할하고 임베딩 생성
      const chunks = this.splitTextIntoChunks(content);
      const records: CrawlRecord[] = [];
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const embedding = await this.bedrockService.createEmbedding(chunk);
        
        records.push({
          url,
          title,
          content: chunk,
          embedding,
          chunk_index: chunkIndex,
          page_index: 0
        });
      }
      
      await this.databaseService.saveBatchRecords(records);
      
      const endTime = Date.now();
      
      return {
        url,
        title,
        content: `PDF 문서에서 ${chunks.length}개 청크 생성 (${content.length}자 추출)`,
        links: [url],
        timestamp: new Date(),
        chunks: chunks.slice(0, 3), // 처음 3개 청크만 반환
        embeddingDimensions: 1024,
        totalChunks: chunks.length,
        executionTime: endTime - startTime
      };
      
    } catch (error) {
      this.logger.error(`PDF 처리 오류: ${error.message}`);
      throw new Error(`PDF 처리 실패: ${error.message}`);
    }
  }

  // Markdown 파일 처리
  async processMarkdown(url: string): Promise<AdvancedCrawlResult> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Markdown 파일 처리 시작: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const markdownContent = response.data;
      const htmlContent = await marked(markdownContent);
      const $ = cheerio.load(htmlContent);
      const textContent = $.text().trim();
      
      const title = this.extractTitleFromMarkdown(markdownContent) || 'Markdown Document';
      
      // 청크로 분할하고 임베딩 생성
      const chunks = this.splitTextIntoChunks(textContent);
      const records: CrawlRecord[] = [];
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const embedding = await this.bedrockService.createEmbedding(chunk);
        
        records.push({
          url,
          title,
          content: chunk,
          embedding,
          chunk_index: chunkIndex,
          page_index: 0
        });
      }
      
      await this.databaseService.saveBatchRecords(records);
      
      const endTime = Date.now();
      
      return {
        url,
        title,
        content: `Markdown 문서에서 ${chunks.length}개 청크 생성`,
        links: [url],
        timestamp: new Date(),
        chunks,
        embeddingDimensions: 1024,
        totalChunks: chunks.length,
        executionTime: endTime - startTime
      };
      
    } catch (error) {
      this.logger.error(`Markdown 처리 오류: ${error.message}`);
      throw new Error(`Markdown 처리 실패: ${url}`);
    }
  }

  // GitHub 저장소 처리
  async processGitHubRepo(url: string): Promise<AdvancedCrawlResult> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`GitHub 저장소 처리 시작: ${url}`);
      
      const { owner, repo } = this.parseGitHubUrl(url);
      const octokit = new Octokit();
      
      // 저장소 정보 가져오기
      const repoInfo = await octokit.rest.repos.get({ owner, repo });
      const title = repoInfo.data.full_name;
      const description = repoInfo.data.description || '';
      
      // README 파일 가져오기
      let readmeContent = '';
      try {
        const readme = await octokit.rest.repos.getReadme({ owner, repo });
        const readmeBuffer = Buffer.from(readme.data.content, 'base64');
        readmeContent = readmeBuffer.toString('utf-8');
      } catch (error) {
        this.logger.warn(`README 파일을 찾을 수 없습니다: ${owner}/${repo}`);
      }
      
      // 주요 파일들 가져오기 (최대 20개)
      const tree = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: repoInfo.data.default_branch,
        recursive: 'true'
      });
      
      const importantFiles = tree.data.tree
        .filter(item => 
          item.type === 'blob' && 
          (item.path?.endsWith('.md') || 
           item.path?.endsWith('.py') || 
           item.path?.endsWith('.js') || 
           item.path?.endsWith('.ts') || 
           item.path?.endsWith('.java') || 
           item.path?.endsWith('.cpp') || 
           item.path?.endsWith('.c') ||
           item.path?.endsWith('.go') ||
           item.path?.endsWith('.rs') ||
           item.path?.includes('README') ||
           item.path?.includes('CHANGELOG') ||
           item.path?.includes('LICENSE'))
        )
        .slice(0, 20);
      
      const allContent: string[] = [];
      
      // README 내용 추가
      if (readmeContent) {
        const htmlContent = await marked(readmeContent);
        const $ = cheerio.load(htmlContent);
        allContent.push(`README.md:\n${$.text().trim()}`);
      }
      
      // 저장소 설명 추가
      if (description) {
        allContent.push(`Repository Description:\n${description}`);
      }
      
      // 각 파일 내용 가져오기
      for (const file of importantFiles) {
        try {
          if (file.sha && file.path) {
            const fileContent = await octokit.rest.git.getBlob({
              owner,
              repo,
              file_sha: file.sha
            });
            
            const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
            
            // 파일이 너무 크면 처음 2000자만 가져오기
            const truncatedContent = content.length > 2000 ? content.substring(0, 2000) + '...' : content;
            allContent.push(`${file.path}:\n${truncatedContent}`);
          }
        } catch (error) {
          this.logger.warn(`파일 내용을 가져올 수 없습니다: ${file.path}`);
        }
      }
      
      // 모든 내용을 하나의 텍스트로 결합
      const combinedContent = allContent.join('\n\n---\n\n');
      
      // 청크로 분할하고 임베딩 생성
      const chunks = this.splitTextIntoChunks(combinedContent, 1500); // GitHub는 더 큰 청크 사용
      const records: CrawlRecord[] = [];
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const embedding = await this.bedrockService.createEmbedding(chunk);
        
        records.push({
          url,
          title,
          content: chunk,
          embedding,
          chunk_index: chunkIndex,
          page_index: 0
        });
      }
      
      await this.databaseService.saveBatchRecords(records);
      
      const endTime = Date.now();
      
      return {
        url,
        title,
        content: `GitHub 저장소에서 ${chunks.length}개 청크 생성 (${importantFiles.length}개 파일 처리)`,
        links: [url],
        timestamp: new Date(),
        chunks,
        embeddingDimensions: 1024,
        totalChunks: chunks.length,
        executionTime: endTime - startTime
      };
      
    } catch (error) {
      this.logger.error(`GitHub 저장소 처리 오류: ${error.message}`);
      throw new Error(`GitHub 저장소 처리 실패: ${url}`);
    }
  }

  // 유틸리티 메서드들
  private parseGitHubUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('유효하지 않은 GitHub URL입니다');
    }
    return { owner: match[1], repo: match[2] };
  }

  private extractTitleFromPdf(content: string): string | null {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      return lines[0].substring(0, 100);
    }
    return null;
  }

  private extractTitleFromMarkdown(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : null;
  }

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
