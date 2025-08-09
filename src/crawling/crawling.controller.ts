import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { CrawlingService, AdvancedCrawlResult } from './crawling.service';

export class CrawlRequest {
  @ApiProperty({ 
    description: 'URL to crawl', 
    example: 'https://example.com' 
  })
  @IsString()
  url: string;

  @ApiProperty({ 
    description: 'Crawling depth', 
    example: 1, 
    required: false,
    minimum: 1 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  depth?: number;

  @ApiProperty({ 
    description: 'CSS selector to extract specific content', 
    example: '.content', 
    required: false 
  })
  @IsOptional()
  @IsString()
  selector?: string;
}

export class AdvancedCrawlRequest {
  @ApiProperty({ 
    description: 'Website URL to crawl with embeddings', 
    example: 'https://example.com' 
  })
  @IsString()
  url: string;

  @ApiProperty({ 
    description: 'Maximum number of pages to crawl', 
    example: 10, 
    required: false,
    minimum: 1,
    maximum: 50 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxPages?: number;
}

export class SearchRequest {
  @ApiProperty({ 
    description: 'Search query for similarity search', 
    example: 'machine learning' 
  })
  @IsString()
  query: string;

  @ApiProperty({ 
    description: 'Maximum number of results to return', 
    example: 10, 
    required: false,
    minimum: 1,
    maximum: 50 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CrawlResult {
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
}

@ApiTags('crawling')
@Controller('crawling')
export class CrawlingController {
  constructor(private readonly crawlingService: CrawlingService) {}

  @Post('crawl')
  @ApiOperation({ summary: 'Basic web page crawling' })
  @ApiResponse({ status: 200, description: 'Successfully crawled the webpage', type: CrawlResult })
  @ApiBody({ type: CrawlRequest })
  async crawlUrl(@Body() crawlRequest: CrawlRequest): Promise<CrawlResult> {
    return this.crawlingService.crawlUrl(
      crawlRequest.url,
      crawlRequest.depth || 1,
      crawlRequest.selector
    );
  }

  @Post('advanced-crawl')
  @ApiOperation({ summary: 'Advanced website crawling with embeddings' })
  @ApiResponse({ status: 200, description: 'Successfully crawled website and generated embeddings', type: AdvancedCrawlResult })
  @ApiBody({ type: AdvancedCrawlRequest })
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