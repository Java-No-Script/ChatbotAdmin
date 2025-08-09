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
}