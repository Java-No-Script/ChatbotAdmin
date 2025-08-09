import { Module } from '@nestjs/common';
import { ThreadController } from '../controllers/thread.controller';
import { ThreadService } from '../services/thread.service';
import { DatabaseService } from '../services/database.service';

@Module({
  controllers: [ThreadController],
  providers: [ThreadService, DatabaseService],
  exports: [ThreadService]
})
export class ThreadModule {}
