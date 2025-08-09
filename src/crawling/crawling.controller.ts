import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { CrawlingService, AdvancedCrawlResult } from './crawling.service';

export class CrawlRequest {
  @IsString()
  url: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  depth?: number;

  @IsOptional()
  @IsString()
  selector?: string;
}

export class AdvancedCrawlRequest {
  @IsString()
  url: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxPages?: number;
}

export class SearchRequest {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  timestamp: Date;
}

@Controller('crawling')
export class CrawlingController {
  constructor(private readonly crawlingService: CrawlingService) {}

  @Post('crawl')
  async crawlUrl(@Body() crawlRequest: CrawlRequest): Promise<CrawlResult> {
    return this.crawlingService.crawlUrl(
      crawlRequest.url,
      crawlRequest.depth || 1,
      crawlRequest.selector
    );
  }

  @Post('advanced-crawl')
  async crawlWebsiteWithEmbedding(@Body() request: AdvancedCrawlRequest): Promise<AdvancedCrawlResult> {
    return this.crawlingService.crawlWebsiteWithEmbedding(
      request.url,
      request.maxPages || 10
    );
  }

  @Post('search')
  async searchSimilar(@Body() request: SearchRequest): Promise<any> {
    return this.crawlingService.searchSimilar(request.query, request.limit || 10);
  }

  @Post('batch-crawl')
  async batchCrawl(@Body() request: { urls: string[] }): Promise<CrawlResult[]> {
    return this.crawlingService.batchCrawl(request.urls);
  }

  @Get('status/:jobId')
  async getCrawlStatus(@Param('jobId') jobId: string): Promise<any> {
    return this.crawlingService.getCrawlStatus(jobId);
  }

  @Get('results/:jobId')
  async getCrawlResults(@Param('jobId') jobId: string): Promise<CrawlResult[]> {
    return this.crawlingService.getCrawlResults(jobId);
  }
}