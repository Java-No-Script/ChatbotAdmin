import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ThreadService } from '../services/thread.service';
import { 
  ThreadQueryDto, 
  ThreadSummaryDto, 
  ThreadListResponseDto, 
  ThreadCategoryStatsDto,
  ThreadDto 
} from '../dto/thread.dto';
import { ThreadCategory } from '../types/thread.types';

@ApiTags('Threads')
@Controller('api/threads')
export class ThreadController {
  constructor(private readonly threadService: ThreadService) {}

  @Get('summary')
  @ApiOperation({ 
    summary: '스레드 전체 요약 정보 조회',
    description: '전체 스레드 개수, 카테고리별 통계, 최근 스레드, 인기 태그 등을 포함한 요약 정보를 반환합니다.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '스레드 요약 정보 조회 성공',
    type: ThreadSummaryDto
  })
  async getThreadSummary(): Promise<ThreadSummaryDto> {
    return await this.threadService.getThreadSummary();
  }

  @Get('stats/categories')
  @ApiOperation({ 
    summary: '카테고리별 스레드 통계 조회',
    description: '각 카테고리별 스레드 개수와 비율을 반환합니다.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '카테고리별 통계 조회 성공',
    type: [ThreadCategoryStatsDto]
  })
  async getCategoryStats(): Promise<ThreadCategoryStatsDto[]> {
    return await this.threadService.getCategoryStats();
  }

  @Get('category/:category')
  @ApiOperation({ 
    summary: '특정 카테고리의 스레드 목록 조회',
    description: '지정된 카테고리에 속하는 모든 스레드를 반환합니다.'
  })
  @ApiParam({ 
    name: 'category', 
    enum: ['technical', 'question', 'discussion', 'announcement', 'other'],
    description: '조회할 스레드 카테고리'
  })
  @ApiResponse({ 
    status: 200, 
    description: '카테고리별 스레드 목록 조회 성공',
    type: [ThreadDto]
  })
  async getThreadsByCategory(@Param('category') category: ThreadCategory): Promise<ThreadDto[]> {
    return await this.threadService.getThreadsByCategory(category);
  }

  @Get('search')
  @ApiOperation({ 
    summary: '스레드 벡터 검색',
    description: '자연어 쿼리를 사용하여 유사한 스레드를 벡터 검색으로 찾습니다.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '벡터 검색 결과',
    type: [ThreadDto]
  })
  async searchThreads(
    @Query('q') query: string,
    @Query('limit') limit?: number
  ): Promise<ThreadDto[]> {
    if (!query) {
      return [];
    }
    return await this.threadService.searchThreadsByVector(query, limit || 10);
  }

  @Get(':id/related')
  @ApiOperation({ 
    summary: '관련 스레드 조회',
    description: '특정 스레드와 유사한 다른 스레드들을 반환합니다.'
  })
  @ApiParam({ 
    name: 'id', 
    description: '스레드 ID'
  })
  @ApiResponse({ 
    status: 200, 
    description: '관련 스레드 목록',
    type: [ThreadDto]
  })
  async getRelatedThreads(
    @Param('id') threadId: string,
    @Query('limit') limit?: number
  ): Promise<ThreadDto[]> {
    return await this.threadService.getRelatedThreads(threadId, limit || 5);
  }

  @Get()
  @ApiOperation({ 
    summary: '스레드 목록 조회 (필터링 및 페이지네이션 지원)',
    description: '다양한 조건으로 스레드를 필터링하고 페이지네이션을 적용하여 조회합니다.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '스레드 목록 조회 성공',
    type: ThreadListResponseDto
  })
  async getThreads(@Query() query: ThreadQueryDto): Promise<ThreadListResponseDto> {
    const { threads, total } = await this.threadService.getThreads(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const totalPages = Math.ceil(total / limit);

    return {
      threads,
      total,
      page,
      limit,
      totalPages
    };
  }

  // 추가적인 통계 API들
  @Get('stats/overview')
  @ApiOperation({ 
    summary: '스레드 개요 통계',
    description: '카테고리별 개수와 기본 통계 정보를 간단히 반환합니다.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '개요 통계 조회 성공',
    schema: {
      type: 'object',
      properties: {
        totalThreads: { type: 'number', description: '전체 스레드 수' },
        resolvedThreads: { type: 'number', description: '해결된 스레드 수' },
        unresolvedThreads: { type: 'number', description: '미해결 스레드 수' },
        categoryCounts: {
          type: 'object',
          properties: {
            technical: { type: 'number' },
            question: { type: 'number' },
            discussion: { type: 'number' },
            announcement: { type: 'number' },
            other: { type: 'number' }
          }
        }
      }
    }
  })
  async getOverviewStats() {
    const summary = await this.threadService.getThreadSummary();
    const categoryStats = summary.categoryStats;
    
    // 해결/미해결 통계 계산 (실제 구현에서는 서비스에서 처리)
    const resolvedCount = summary.recentThreads.filter(t => t.isResolved).length;
    const unresolvedCount = summary.totalThreads - resolvedCount;

    const categoryCounts = categoryStats.reduce((acc, stat) => {
      acc[stat.category] = stat.count;
      return acc;
    }, {} as Record<ThreadCategory, number>);

    return {
      totalThreads: summary.totalThreads,
      resolvedThreads: resolvedCount,
      unresolvedThreads: unresolvedCount,
      categoryCounts
    };
  }
}
