import { Module } from '@nestjs/common';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';
import {DatabaseService} from "../services/database.service";

@Module({
  controllers: [SlackController],
  providers: [SlackService, DatabaseService],
  exports: [SlackService]
})
export class SlackModule {}
