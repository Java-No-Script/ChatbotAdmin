import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CrawlingModule } from './crawling/crawling.module';
import { SlackModule } from './slack/slack.module';

@Module({
  imports: [CrawlingModule, SlackModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}