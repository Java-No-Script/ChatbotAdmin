import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { databaseConfig } from '../config/database.config';

export interface CrawlRecord {
  id?: number;
  url: string;
  title: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  page_index: number;
  created_at?: Date;
}

export interface ThreadGroup {
  content: string;
  link: string;
  createdAt: Date;
  count: number;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  async getClient(): Promise<Client> {
    const client = new Client(databaseConfig);
    await client.connect();
    return client;
  }

  async initializeTable(): Promise<void> {
    const client = await this.getClient();
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tmp (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT,
          content TEXT,
          embedding VECTOR(1024),
          chunk_index INTEGER,
          page_index INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      this.logger.log('테이블 초기화 완료');
    } catch (error) {
      this.logger.error('테이블 초기화 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async saveRecord(record: CrawlRecord): Promise<number> {
    const client = await this.getClient();
    
    try {
      const result = await client.query(`
        INSERT INTO tmp (url, title, content, embedding, chunk_index, page_index)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        record.url,
        record.title,
        record.content,
        JSON.stringify(record.embedding),
        record.chunk_index,
        record.page_index
      ]);

      return result.rows[0].id;
    } catch (error) {
      this.logger.error('레코드 저장 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async saveBatchRecords(records: CrawlRecord[]): Promise<number[]> {
    const client = await this.getClient();
    const ids: number[] = [];
    
    try {
      for (const record of records) {
        const embeddingString = record.embedding 
          ? `[${record.embedding.join(',')}]` 
          : null;

        // 만약 thread_url에 유니크 제약조건을 추가했다면 아래 코드를 사용하세요:
        // ALTER TABLE threads ADD CONSTRAINT threads_thread_url_unique UNIQUE (thread_url);
        /*
        const result = await client.query(`
          INSERT INTO threads (
            thread_url, root_message, thread_summary, thread_embedding
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (thread_url)
          DO UPDATE SET
            root_message = EXCLUDED.root_message,
            thread_summary = EXCLUDED.thread_summary,
            thread_embedding = EXCLUDED.thread_embedding,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          record.url,
          record.title || null,  // title이 root_message
          record.content || null, // content가 thread_summary
          embeddingString        // thread_summary(content) 기반 임베딩
        ]);
        */
        
        const result = await client.query(`
          INSERT INTO threads (
            thread_url, root_message, thread_summary, thread_embedding
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          record.url,
          record.title || null,   // title이 root_message
          record.content || null, // content가 thread_summary  
          embeddingString         // thread_summary(content) 기반 임베딩
        ]);
        
        ids.push(result.rows[0].id);
      }
      
      this.logger.log(`${records.length}개 레코드 저장 완료`);
      return ids;
    } catch (error) {
      this.logger.error('배치 레코드 저장 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async deleteByUrls(urls: string[]): Promise<number> {
    if (urls.length === 0) return 0;
    
    const client = await this.getClient();
    
    try {
      const result = await client.query('DELETE FROM tmp WHERE url = ANY($1)', [urls]);
      this.logger.log(`${result.rowCount}개 기존 레코드 삭제`);
      return result.rowCount;
    } catch (error) {
      this.logger.error('URL별 삭제 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async searchSimilar(embedding: number[], limit: number = 10): Promise<any[]> {
    const client = await this.getClient();
    
    try {
      const result = await client.query(`
        SELECT id, url, title, content, chunk_index, page_index, created_at,
               embedding <-> $1 as distance
        FROM tmp
        ORDER BY embedding <-> $1
        LIMIT $2
      `, [JSON.stringify(embedding), limit]);

      return result.rows.map(row => ({
        ...row,
        distance: parseFloat(row.distance)
      }));
    } catch (error) {
      this.logger.error('유사도 검색 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async getCrawledThreadGroups(): Promise<ThreadGroup[]> {
    const client = await this.getClient();
    
    try {
      const result = await client.query(`
        SELECT 
          root_message,
          thread_url,
          MIN(created_at) as created_at,
          COUNT(*) as count
        FROM threads 
        WHERE thread_ts IS NULL 
          AND channel_id IS NULL
          AND root_message IS NOT NULL
        GROUP BY root_message, thread_url
        ORDER BY MIN(created_at) DESC
      `);

      return result.rows.map(row => ({
        content: row.root_message,
        link: row.thread_url,
        createdAt: row.created_at,
        count: parseInt(row.count)
      }));
    } catch (error) {
      this.logger.error('크롤링된 스레드 그룹 조회 오류:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  async getCrawledDocsCount(): Promise<number> {
      const client = await this.getClient();

      try {
          const result = await client.query(`
          SELECT COUNT(*) as count
          FROM threads
          WHERE thread_ts IS NULL
          AND channel_id IS NULL
          AND root_message IS NOT NULL
          GROUP BY root_message, thread_url
          `);

          return result.rowCount;
      } catch (error) {
          this.logger.error('크롤링된 문서 개수 조회 오류:', error);
          throw error;
      } finally {
          await client.end();
      }
  }
}
