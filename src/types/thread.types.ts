export type ThreadCategory = 'technical' | 'question' | 'discussion' | 'announcement' | 'other';

export interface Thread {
  id: string;
  title: string;
  content: string;
  category: ThreadCategory;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string;
  tags?: string[];
  isResolved?: boolean;
  priority?: 'low' | 'medium' | 'high';
  url?: string; // 스레드 URL 추가
  similarity?: number; // 벡터 검색 시 유사도 점수
}

export interface ThreadCategoryStats {
  category: ThreadCategory;
  count: number;
  percentage: number;
}

export interface ThreadSummary {
  totalThreads: number;
  categoryStats: ThreadCategoryStats[];
  recentThreads: Thread[];
  topTags?: { tag: string; count: number }[];
}
