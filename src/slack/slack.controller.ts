import { Controller, Get, Put, Delete, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, IsArray } from 'class-validator';
import { SlackService, SlackMessage, SlackMessageStats } from './slack.service';

export class GetMessagesRequest {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsString()
  oldest?: string;

  @IsOptional()
  @IsString()
  latest?: string;
}

export class UpdateMessageRequest {
  @IsString()
  channelId: string;

  @IsString()
  timestamp: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  blocks?: any[];
}

export class DeleteMessageRequest {
  @IsString()
  channelId: string;

  @IsString()
  timestamp: string;
}

export class SendMessageRequest {
  @IsString()
  channelId: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  blocks?: any[];
}

export interface BotMessagesResponse {
  messages: SlackMessage[];
  stats: SlackMessageStats;
  success: boolean;
  timestamp: Date;
}

export interface MessageActionResponse {
  success: boolean;
  message?: string;
  timestamp: Date;
}

export interface ChannelListResponse {
  channels: { id: string; name: string; is_member: boolean }[];
  total: number;
  timestamp: Date;
}

@ApiTags('slack')
@Controller('slack')
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Get bot messages from Slack channels' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved bot messages' })
  @ApiQuery({ name: 'channelId', required: false, description: 'Slack channel ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to retrieve' })
  @ApiQuery({ name: 'oldest', required: false, description: 'Oldest message timestamp' })
  @ApiQuery({ name: 'latest', required: false, description: 'Latest message timestamp' })
  async getBotMessages(
    @Query('channelId') channelId?: string,
    @Query('limit') limit?: string,
    @Query('oldest') oldest?: string,
    @Query('latest') latest?: string
  ): Promise<BotMessagesResponse> {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    
    const result = await this.slackService.getBotMessages(
      channelId,
      parsedLimit,
      oldest,
      latest
    );

    return {
      messages: result.messages,
      stats: result.stats,
      success: true,
      timestamp: new Date()
    };
  }

  @Get('messages/:channelId/:timestamp')
  async getMessageDetails(
    @Param('channelId') channelId: string,
    @Param('timestamp') timestamp: string
  ): Promise<{ message: SlackMessage | null; success: boolean; timestamp: Date }> {
    const message = await this.slackService.getMessageDetails(channelId, timestamp);

    return {
      message,
      success: message !== null,
      timestamp: new Date()
    };
  }

  @Put('messages')
  @ApiOperation({ summary: 'Update a Slack message' })
  @ApiResponse({ status: 200, description: 'Successfully updated message' })
  @ApiBody({ type: UpdateMessageRequest })
  async updateMessage(@Body() request: UpdateMessageRequest): Promise<MessageActionResponse> {
    const success = await this.slackService.updateMessage(
      request.channelId,
      request.timestamp,
      request.text,
      request.blocks
    );

    return {
      success,
      message: success ? '메시지가 성공적으로 수정되었습니다.' : '메시지 수정에 실패했습니다.',
      timestamp: new Date()
    };
  }

  @Delete('messages')
  async deleteMessage(@Body() request: DeleteMessageRequest): Promise<MessageActionResponse> {
    const success = await this.slackService.deleteMessage(
      request.channelId,
      request.timestamp
    );

    return {
      success,
      message: success ? '메시지가 성공적으로 삭제되었습니다.' : '메시지 삭제에 실패했습니다.',
      timestamp: new Date()
    };
  }

  @Delete('messages/:channelId/:timestamp')
  async deleteMessageByParams(
    @Param('channelId') channelId: string,
    @Param('timestamp') timestamp: string
  ): Promise<MessageActionResponse> {
    const success = await this.slackService.deleteMessage(channelId, timestamp);

    return {
      success,
      message: success ? '메시지가 성공적으로 삭제되었습니다.' : '메시지 삭제에 실패했습니다.',
      timestamp: new Date()
    };
  }

  @Post('messages')
  async sendMessage(@Body() request: SendMessageRequest): Promise<MessageActionResponse & { messageTs?: string }> {
    const messageTs = await this.slackService.sendMessage(
      request.channelId,
      request.text,
      request.blocks
    );

    return {
      success: messageTs !== null,
      message: messageTs ? '메시지가 성공적으로 전송되었습니다.' : '메시지 전송에 실패했습니다.',
      messageTs: messageTs || undefined,
      timestamp: new Date()
    };
  }

  @Get('channels')
  async getChannelList(): Promise<ChannelListResponse> {
    const channels = await this.slackService.getChannelList();

    return {
      channels,
      total: channels.length,
      timestamp: new Date()
    };
  }

  @Get('stats')
  async getBotStats(
    @Query('channelId') channelId?: string,
    @Query('days') days?: string
  ): Promise<{ stats: SlackMessageStats; success: boolean; timestamp: Date }> {
    const daysBack = days ? parseInt(days, 10) : 7;
    const oldest = Math.floor((Date.now() - (daysBack * 24 * 60 * 60 * 1000)) / 1000).toString();

    const result = await this.slackService.getBotMessages(
      channelId,
      1000,
      oldest
    );

    return {
      stats: result.stats,
      success: true,
      timestamp: new Date()
    };
  }

  @Get('test-auth')
  @ApiOperation({ summary: 'Test Slack bot authentication' })
  @ApiResponse({ status: 200, description: 'Authentication test result' })
  async testAuth(): Promise<{ success: boolean; message: string; botInfo?: any; timestamp: Date }> {
    try {
      const botInfo = await this.slackService.testAuth();
      return {
        success: true,
        message: 'Slack 인증 성공',
        botInfo,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        message: `Slack 인증 실패: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
}