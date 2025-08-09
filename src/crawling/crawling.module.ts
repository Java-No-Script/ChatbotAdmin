import { Module } from '@nestjs/common';
import { CrawlingController } from './crawling.controller';
import { CrawlingService } from './crawling.service';
import { BedrockService } from '../services/bedrock.service';
import { DatabaseService } from '../services/database.service';

@Module({
  controllers: [CrawlingController],
  providers: [CrawlingService, BedrockService, DatabaseService],
  exports: [CrawlingService, BedrockService, DatabaseService],
})
export class CrawlingModule {}