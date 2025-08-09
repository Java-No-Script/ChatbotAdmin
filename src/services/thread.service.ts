import { Injectable, Logger } from '@nestjs/common';
import { Thread, ThreadCategory, ThreadCategoryStats, ThreadSummary } from '../types/thread.types';
import { ThreadQueryDto } from '../dto/thread.dto';
import { DatabaseService } from './database.service';

@Injectable()
export class ThreadService {
  private readonly logger = new Logger(ThreadService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  // 실제 구현에서는 데이터베이스나 벡터 DB에서 데이터를 가져와야 합니다
  private mockThreads: Thread[] = [
    {
      id: '1',
      title: 'React Hook 사용법 질문',
      content: 'useState와 useEffect를 함께 사용할 때 주의사항이 있나요?',
      category: 'question',
      createdAt: new Date('2025-08-09T10:00:00Z'),
      updatedAt: new Date('2025-08-09T10:30:00Z'),
      authorId: 'user1',
      authorName: '김개발',
      tags: ['react', 'hooks', 'javascript'],
      isResolved: true,
      priority: 'medium'
    },
    {
      id: '2',
      title: 'API 성능 최적화 방법',
      content: 'Node.js API 서버의 응답 속도를 개선하는 방법에 대해 논의해봅시다.',
      category: 'technical',
      createdAt: new Date('2025-08-09T09:00:00Z'),
      updatedAt: new Date('2025-08-09T11:00:00Z'),
      authorId: 'user2',
      authorName: '박백엔드',
      tags: ['nodejs', 'performance', 'api'],
      isResolved: false,
      priority: 'high'
    },
    {
      id: '3',
      title: '새로운 프레임워크 도입 제안',
      content: 'Next.js 14 버전 도입에 대한 의견을 나누고 싶습니다.',
      category: 'discussion',
      createdAt: new Date('2025-08-09T08:00:00Z'),
      updatedAt: new Date('2025-08-09T12:00:00Z'),
      authorId: 'user3',
      authorName: '이프론트',
      tags: ['nextjs', 'framework', 'discussion'],
      isResolved: false,
      priority: 'low'
    },
    {
      id: '4',
      title: '서버 점검 공지',
      content: '8월 10일 새벽 2시부터 4시까지 서버 점검이 예정되어 있습니다.',
      category: 'announcement',
      createdAt: new Date('2025-08-08T15:00:00Z'),
      updatedAt: new Date('2025-08-08T15:00:00Z'),
      authorId: 'admin',
      authorName: '관리자',
      tags: ['maintenance', 'server'],
      isResolved: true,
      priority: 'high'
    },
    {
      id: '5',
      title: '코드 리뷰 요청',
      content: '새로 작성한 인증 모듈에 대한 리뷰를 부탁드립니다.',
      category: 'other',
      createdAt: new Date('2025-08-09T14:00:00Z'),
      updatedAt: new Date('2025-08-09T14:30:00Z'),
      authorId: 'user4',
      authorName: '최개발자',
      tags: ['code-review', 'authentication'],
      isResolved: false,
      priority: 'medium'
    }
  ];

  async getThreadSummary(): Promise<ThreadSummary> {
    try {
      const threads = await this.getAllThreadsFromDB();
      const totalThreads = threads.length;
      const categoryStats = this.calculateCategoryStatsFromThreads(threads);
      const recentThreads = threads
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5);
      const topTags = this.calculateTopTagsFromThreads(threads);

      return {
        totalThreads,
        categoryStats,
        recentThreads,
        topTags
      };
    } catch (error) {
      this.logger.error('스레드 요약 정보 조회 오류:', error);
      // 에러 발생 시 mock 데이터 사용
      return this.getMockThreadSummary();
    }
  }

  private async getAllThreadsFromDB(): Promise<Thread[]> {
    const client = await this.databaseService.getClient();
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          thread_url,
          root_message,
          thread_summary,
          created_at,
          updated_at
        FROM threads 
        ORDER BY created_at DESC
      `);

      return result.rows.map(row => this.mapDBRowToThread(row));
    } catch (error) {
      this.logger.error('데이터베이스에서 스레드 조회 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  private mapDBRowToThread(row: any): Thread {
    // 카테고리 추론 로직 (실제로는 threads 테이블에 category 컬럼을 추가하는 것이 좋습니다)
    const category = this.inferCategoryFromContent(row.root_message, row.thread_summary);
    
    // 태그 추출 로직 (실제로는 별도 tags 테이블이나 컬럼이 있으면 좋습니다)
    const tags = this.extractTagsFromContent(row.root_message, row.thread_summary);

    return {
      id: row.id.toString(),
      title: row.root_message || '제목 없음',
      content: row.thread_summary || '',
      category,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at || row.created_at),
      authorId: 'unknown', // 실제로는 threads 테이블에 author_id 컬럼 추가 필요
      authorName: '알 수 없음', // 실제로는 users 테이블과 조인 필요
      tags,
      isResolved: this.inferResolutionStatus(row.thread_summary),
      priority: this.inferPriority(row.root_message, row.thread_summary),
      url: row.thread_url
    };
  }

  private inferCategoryFromContent(title: string, content: string): ThreadCategory {
    const text = `${title} ${content}`.toLowerCase();
    
    if (text.includes('질문') || text.includes('문의') || text.includes('어떻게') || text.includes('?')) {
      return 'question';
    }
    if (text.includes('기술') || text.includes('api') || text.includes('코드') || text.includes('버그')) {
      return 'technical';
    }
    if (text.includes('공지') || text.includes('알림') || text.includes('안내')) {
      return 'announcement';
    }
    if (text.includes('토론') || text.includes('의견') || text.includes('논의')) {
      return 'discussion';
    }
    
    return 'other';
  }

  private extractTagsFromContent(title: string, content: string): string[] {
    const text = `${title} ${content}`.toLowerCase();
    const tags: string[] = [];
    
    // 기술 관련 키워드 추출
    const techKeywords = ['react', 'nodejs', 'javascript', 'typescript', 'api', 'database', 'aws', 'docker'];
    techKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    });
    
    // URL에서 태그 추출 (예: github.com/repo-name)
    if (text.includes('github')) tags.push('github');
    if (text.includes('stackoverflow')) tags.push('stackoverflow');
    
    return tags.slice(0, 5); // 최대 5개 태그만
  }

  private inferResolutionStatus(content: string): boolean {
    const text = content.toLowerCase();
    return text.includes('해결') || text.includes('완료') || text.includes('닫힘');
  }

  private inferPriority(title: string, content: string): 'low' | 'medium' | 'high' {
    const text = `${title} ${content}`.toLowerCase();
    
    if (text.includes('긴급') || text.includes('중요') || text.includes('버그')) {
      return 'high';
    }
    if (text.includes('질문') || text.includes('문의')) {
      return 'medium';
    }
    
    return 'low';
  }

  async getThreadsByCategory(category: ThreadCategory): Promise<Thread[]> {
    try {
      const allThreads = await this.getAllThreadsFromDB();
      return allThreads.filter(thread => thread.category === category);
    } catch (error) {
      this.logger.error('카테고리별 스레드 조회 오류:', error);
      return this.mockThreads.filter(thread => thread.category === category);
    }
  }

  async getThreads(query: ThreadQueryDto): Promise<{ threads: Thread[]; total: number }> {
    try {
      let filteredThreads = await this.getAllThreadsFromDB();

      // 카테고리 필터링
      if (query.category) {
        filteredThreads = filteredThreads.filter(thread => thread.category === query.category);
      }

      // 검색 키워드 필터링
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        filteredThreads = filteredThreads.filter(thread => 
          thread.title.toLowerCase().includes(searchLower) ||
          thread.content.toLowerCase().includes(searchLower) ||
          thread.tags?.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      // 날짜 범위 필터링
      if (query.startDate) {
        const startDate = new Date(query.startDate);
        filteredThreads = filteredThreads.filter(thread => thread.createdAt >= startDate);
      }

      if (query.endDate) {
        const endDate = new Date(query.endDate);
        endDate.setHours(23, 59, 59, 999); // 해당 날짜의 끝까지
        filteredThreads = filteredThreads.filter(thread => thread.createdAt <= endDate);
      }

      // 해결된 스레드만 조회
      if (query.resolvedOnly) {
        filteredThreads = filteredThreads.filter(thread => thread.isResolved === true);
      }

      const total = filteredThreads.length;

      // 페이지네이션
      const page = query.page || 1;
      const limit = query.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      // 최신순 정렬 후 페이지네이션 적용
      const threads = filteredThreads
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(startIndex, endIndex);

      return { threads, total };
    } catch (error) {
      this.logger.error('스레드 목록 조회 오류:', error);
      // 에러 발생 시 mock 데이터 사용
      return this.getMockThreadsWithQuery(query);
    }
  }

  async getCategoryStats(): Promise<ThreadCategoryStats[]> {
    try {
      const threads = await this.getAllThreadsFromDB();
      return this.calculateCategoryStatsFromThreads(threads);
    } catch (error) {
      this.logger.error('카테고리 통계 조회 오류:', error);
      return this.calculateCategoryStats();
    }
  }

  // 벡터 검색 메서드 (실제 구현)
  async searchThreadsByVector(query: string, limit: number = 10): Promise<Thread[]> {
    try {
      // 여기서는 query를 임베딩으로 변환하는 로직이 필요합니다
      // 예시로 빈 배열을 사용하지만, 실제로는 BedrockService를 사용해야 합니다
      const queryEmbedding: number[] = []; // await this.bedrockService.generateEmbedding(query);
      
      if (queryEmbedding.length === 0) {
        // 임베딩이 없으면 텍스트 검색으로 대체
        return this.searchThreadsByText(query, limit);
      }

      const client = await this.databaseService.getClient();
      
      try {
        const result = await client.query(`
          SELECT 
            id,
            thread_url,
            root_message,
            thread_summary,
            created_at,
            updated_at,
            thread_embedding <-> $1 as distance
          FROM threads
          WHERE thread_embedding IS NOT NULL
          ORDER BY thread_embedding <-> $1
          LIMIT $2
        `, [JSON.stringify(queryEmbedding), limit]);

        return result.rows.map(row => ({
          ...this.mapDBRowToThread(row),
          similarity: 1 - parseFloat(row.distance) // 거리를 유사도로 변환
        }));
      } finally {
        await client.end();
      }
    } catch (error) {
      this.logger.error('벡터 검색 오류:', error);
      // 벡터 검색 실패 시 텍스트 검색으로 대체
      return this.searchThreadsByText(query, limit);
    }
  }

  private async searchThreadsByText(query: string, limit: number = 10): Promise<Thread[]> {
    const client = await this.databaseService.getClient();
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          thread_url,
          root_message,
          thread_summary,
          created_at,
          updated_at
        FROM threads
        WHERE 
          root_message ILIKE $1 
          OR thread_summary ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [`%${query}%`, limit]);

      return result.rows.map(row => this.mapDBRowToThread(row));
    } finally {
      await client.end();
    }
  }

  async getRelatedThreads(threadId: string, limit: number = 5): Promise<Thread[]> {
    try {
      const client = await this.databaseService.getClient();
      
      try {
        // 먼저 해당 스레드의 임베딩을 가져옵니다
        const threadResult = await client.query(`
          SELECT thread_embedding 
          FROM threads 
          WHERE id = $1 AND thread_embedding IS NOT NULL
        `, [threadId]);

        if (threadResult.rows.length === 0) {
          // 임베딩이 없으면 빈 배열 반환
          return [];
        }

        const embedding = threadResult.rows[0].thread_embedding;

        // 유사한 스레드들을 검색 (자기 자신 제외)
        const result = await client.query(`
          SELECT 
            id,
            thread_url,
            root_message,
            thread_summary,
            created_at,
            updated_at,
            thread_embedding <-> $1 as distance
          FROM threads
          WHERE id != $2 AND thread_embedding IS NOT NULL
          ORDER BY thread_embedding <-> $1
          LIMIT $3
        `, [embedding, threadId, limit]);

        return result.rows.map(row => this.mapDBRowToThread(row));
      } finally {
        await client.end();
      }
    } catch (error) {
      this.logger.error('관련 스레드 조회 오류:', error);
      return [];
    }
  }

  private calculateCategoryStatsFromThreads(threads: Thread[]): ThreadCategoryStats[] {
    const categories: ThreadCategory[] = ['technical', 'question', 'discussion', 'announcement', 'other'];
    const totalThreads = threads.length;

    return categories.map(category => {
      const count = threads.filter(thread => thread.category === category).length;
      const percentage = totalThreads > 0 ? Math.round((count / totalThreads) * 100 * 10) / 10 : 0;

      return {
        category,
        count,
        percentage
      };
    });
  }

  private calculateTopTagsFromThreads(threads: Thread[]): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();

    threads.forEach(thread => {
      thread.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // 상위 10개 태그만 반환
  }

  private calculateCategoryStats(): ThreadCategoryStats[] {
    const categories: ThreadCategory[] = ['technical', 'question', 'discussion', 'announcement', 'other'];
    const totalThreads = this.mockThreads.length;

    return categories.map(category => {
      const count = this.mockThreads.filter(thread => thread.category === category).length;
      const percentage = totalThreads > 0 ? Math.round((count / totalThreads) * 100 * 10) / 10 : 0;

      return {
        category,
        count,
        percentage
      };
    });
  }

  private calculateTopTags(): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();

    this.mockThreads.forEach(thread => {
      thread.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // 상위 10개 태그만 반환
  }

  // Mock 데이터 관련 메서드들 (fallback용)
  private getMockThreadSummary(): ThreadSummary {
    const totalThreads = this.mockThreads.length;
    const categoryStats = this.calculateCategoryStats();
    const recentThreads = this.mockThreads
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);
    const topTags = this.calculateTopTags();

    return {
      totalThreads,
      categoryStats,
      recentThreads,
      topTags
    };
  }

  private getMockThreadsWithQuery(query: ThreadQueryDto): { threads: Thread[]; total: number } {
    let filteredThreads = [...this.mockThreads];

    // 카테고리 필터링
    if (query.category) {
      filteredThreads = filteredThreads.filter(thread => thread.category === query.category);
    }

    // 검색 키워드 필터링
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filteredThreads = filteredThreads.filter(thread => 
        thread.title.toLowerCase().includes(searchLower) ||
        thread.content.toLowerCase().includes(searchLower) ||
        thread.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // 날짜 범위 필터링
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      filteredThreads = filteredThreads.filter(thread => thread.createdAt >= startDate);
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      filteredThreads = filteredThreads.filter(thread => thread.createdAt <= endDate);
    }

    // 해결된 스레드만 조회
    if (query.resolvedOnly) {
      filteredThreads = filteredThreads.filter(thread => thread.isResolved === true);
    }

    const total = filteredThreads.length;

    // 페이지네이션
    const page = query.page || 1;
    const limit = query.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // 최신순 정렬 후 페이지네이션 적용
    const threads = filteredThreads
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(startIndex, endIndex);

    return { threads, total };
  }
}
