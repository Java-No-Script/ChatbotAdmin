import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean, IsDateString, IsArray, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ThreadCategory } from '../types/thread.types';

export class ThreadQueryDto {
  @ApiPropertyOptional({ enum: ['technical', 'question', 'discussion', 'announcement', 'other'] })
  @IsOptional()
  @IsEnum(['technical', 'question', 'discussion', 'announcement', 'other'])
  category?: ThreadCategory;

  @ApiPropertyOptional({ description: '페이지 번호 (1부터 시작)', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '페이지당 항목 수', minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: '검색 키워드' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '시작 날짜 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '종료 날짜 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '해결된 스레드만 조회', default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resolvedOnly?: boolean;
}

export class ThreadCategoryStatsDto {
  @ApiProperty({ enum: ['technical', 'question', 'discussion', 'announcement', 'other'] })
  category: ThreadCategory;

  @ApiProperty({ description: '해당 카테고리의 스레드 개수' })
  count: number;

  @ApiProperty({ description: '전체 대비 비율 (%)', example: 25.5 })
  percentage: number;
}

export class ThreadDto {
  @ApiProperty({ description: '스레드 ID' })
  id: string;

  @ApiProperty({ description: '스레드 제목' })
  title: string;

  @ApiProperty({ description: '스레드 내용' })
  content: string;

  @ApiProperty({ enum: ['technical', 'question', 'discussion', 'announcement', 'other'] })
  category: ThreadCategory;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;

  @ApiProperty({ description: '작성자 ID' })
  authorId: string;

  @ApiProperty({ description: '작성자 이름' })
  authorName: string;

  @ApiPropertyOptional({ description: '태그 목록', type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ description: '해결 여부' })
  isResolved?: boolean;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'], description: '우선순위' })
  priority?: 'low' | 'medium' | 'high';
}

export class ThreadSummaryDto {
  @ApiProperty({ description: '전체 스레드 개수' })
  totalThreads: number;

  @ApiProperty({ type: [ThreadCategoryStatsDto], description: '카테고리별 통계' })
  categoryStats: ThreadCategoryStatsDto[];

  @ApiProperty({ type: [ThreadDto], description: '최근 스레드 목록' })
  recentThreads: ThreadDto[];

  @ApiPropertyOptional({ 
    type: [Object], 
    description: '인기 태그 목록',
    example: [{ tag: 'javascript', count: 15 }, { tag: 'react', count: 12 }]
  })
  topTags?: { tag: string; count: number }[];
}

export class ThreadListResponseDto {
  @ApiProperty({ type: [ThreadDto], description: '스레드 목록' })
  threads: ThreadDto[];

  @ApiProperty({ description: '전체 스레드 개수' })
  total: number;

  @ApiProperty({ description: '현재 페이지' })
  page: number;

  @ApiProperty({ description: '페이지당 항목 수' })
  limit: number;

  @ApiProperty({ description: '전체 페이지 수' })
  totalPages: number;
}
