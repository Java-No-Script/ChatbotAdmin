import { Injectable, Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { WebClient } from '@slack/web-api';
import { slackConfig } from '../config/slack.config';

export class SlackMessage {
  @ApiProperty({ description: 'Message timestamp', example: '1609459200.000400' })
  ts: string;

  @ApiProperty({ description: 'Message text content', example: 'Hello from the bot!' })
  text: string;

  @ApiProperty({ description: 'Channel ID', example: 'C1234567890' })
  channel: string;

  @ApiProperty({ description: 'User ID', example: 'U1234567890' })
  user: string;

  @ApiProperty({ description: 'Message type', example: 'message' })
  type: string;

  @ApiProperty({ description: 'Message subtype', example: 'bot_message', required: false })
  subtype?: string;

  @ApiProperty({ description: 'Bot ID', example: 'B1234567890', required: false })
  bot_id?: string;

  @ApiProperty({ description: 'App ID', example: 'A1234567890', required: false })
  app_id?: string;

  @ApiProperty({ description: 'Bot username', example: 'mybot', required: false })
  username?: string;

  @ApiProperty({ description: 'Message attachments', required: false })
  attachments?: any[];

  @ApiProperty({ description: 'Message blocks', required: false })
  blocks?: any[];

  @ApiProperty({ description: 'Message reactions', required: false })
  reactions?: any[];

  @ApiProperty({ description: 'Thread timestamp if reply', example: '1609459200.000400', required: false })
  thread_ts?: string;

  @ApiProperty({ description: 'Number of replies', example: 3, required: false })
  reply_count?: number;

  @ApiProperty({ description: 'Permalink to message', example: 'https://workspace.slack.com/archives/C1234567890/p1609459200000400', required: false })
  permalink?: string;

  @ApiProperty({ description: 'Message creation date', example: '2024-01-01T00:00:00.000Z' })
  created_at: Date;
}

export class SlackMessageStats {
  @ApiProperty({ description: 'Total number of messages', example: 150 })
  totalMessages: number;

  @ApiProperty({ 
    description: 'Message count per channel',
    example: { 'C1234567890': { channelName: 'general', count: 50 } }
  })
  channelStats: { [channelId: string]: { channelName: string; count: number } };

  @ApiProperty({ 
    description: 'Date range of messages',
    example: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' }
  })
  dateRange: { from: Date; to: Date };

  @ApiProperty({ description: 'Bot user ID', example: 'U1234567890' })
  botUserId: string;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly client: WebClient;
  private botUserId: string | null = null;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN || '';
    this.client = new WebClient(token);
    this.initializeBotInfo();
  }

  private async initializeBotInfo(): Promise<void> {
    try {
      this.logger.log('Slack 봇 인증 테스트 시작...');
      this.logger.log(`사용중인 토큰: ${slackConfig.token.substring(0, 20)}...`);
      
      const auth = await this.client.auth.test();
      this.botUserId = auth.user_id as string;
      this.logger.log(`봇 초기화 완료. Bot User ID: ${this.botUserId}, Team: ${auth.team}`);
    } catch (error) {
      this.logger.error('봇 정보 초기화 실패:', error);
      this.logger.error('토큰 확인 필요:', slackConfig.token ? '토큰 있음' : '토큰 없음');
    }
  }

  async getBotMessages(
    channelId?: string,
    limit: number = 20, // 기본값을 20으로 변경
    oldest?: string,
    latest?: string,
    includeThreads: boolean = true,
    page: number = 1
  ): Promise<{ messages: SlackMessage[]; stats: SlackMessageStats }> {
    try {
      if (!this.botUserId) {
        await this.initializeBotInfo();
      }

      const allMessages: SlackMessage[] = [];
      const channelStats: { [channelId: string]: { channelName: string; count: number } } = {};

      if (channelId) {
        // 특정 채널의 메시지 조회
        const messages = await this.getChannelBotMessages(channelId, limit, oldest, latest, includeThreads, page);
        allMessages.push(...messages);

        const channelInfo = await this.client.conversations.info({ channel: channelId });
        const channelName = channelInfo.channel?.name || channelId;
        channelStats[channelId] = { channelName, count: messages.length };
      } else {
        // 모든 채널의 메시지 조회 (페이지네이션은 특정 채널에서만 적용)
        const channels = await this.getBotChannels();
        
        for (const channel of channels) {
          const messages = await this.getChannelBotMessages(channel.id, limit, oldest, latest, includeThreads, 1);
          allMessages.push(...messages);
          
          if (messages.length > 0) {
            channelStats[channel.id] = { channelName: channel.name, count: messages.length };
          }
        }
        
        // 모든 채널 조회 시 페이지네이션 적용
        if (page > 1) {
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          allMessages.splice(0, allMessages.length, ...allMessages.slice(startIndex, endIndex));
        } else {
          allMessages.splice(limit);
        }
      }

      // 날짜 범위 계산
      const timestamps = allMessages.map(m => m.created_at).sort();
      const dateRange = {
        from: timestamps[0] || new Date(),
        to: timestamps[timestamps.length - 1] || new Date()
      };

      console.log("allMessages:", allMessages);

      const stats: SlackMessageStats = {
        totalMessages: allMessages.length,
        channelStats,
        dateRange,
        botUserId: this.botUserId || ''
      };

      this.logger.log(`총 ${allMessages.length}개의 봇 메시지를 찾았습니다.`);
      return { messages: allMessages, stats };

    } catch (error) {
      this.logger.error('봇 메시지 조회 오류:', error);
      throw error;
    }
  }

  private async getBotChannels(): Promise<{ id: string; name: string }[]> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel,mpim,im',
        limit: 1000
      });

      return result.channels?.map(channel => ({
        id: channel.id!,
        name: channel.name || 'DM'
      })) || [];
    } catch (error) {
      this.logger.error('채널 목록 조회 오류:', error);
      return [];
    }
  }

  private async getChannelBotMessages(
    channelId: string,
    limit: number,
    oldest?: string,
    latest?: string,
    includeThreads: boolean = true,
    page: number = 1
  ): Promise<SlackMessage[]> {
    try {
      const messages: SlackMessage[] = [];
      let cursor: string | undefined;
      let fetchedCount = 0;
      let skipCount = (page - 1) * limit; // 스킵할 메시지 수
      let skippedCount = 0;

      do {
        // 페이지네이션을 위해 더 많은 메시지를 가져올 수 있도록 조정
        const batchSize = Math.min(200, (limit * page) + 200 - fetchedCount);
        const result = await this.client.conversations.history({
          channel: channelId,
          limit: batchSize,
          cursor,
          oldest,
          latest
        });

        if (result.messages) {
          // 먼저 봇 메시지 필터링
          const botMessages = result.messages.filter(msg => {
            // 시스템 메시지 제외 (bot_add, bot_remove, channel_join 등)
            const systemSubtypes = [
              'bot_add',
              'bot_remove', 
              'channel_join',
              'channel_leave',
              'channel_topic',
              'channel_purpose',
              'channel_name',
              'channel_archive',
              'channel_unarchive',
              'pinned_item',
              'unpinned_item'
            ];
            
            // 시스템 메시지인 경우 제외
            if (msg.subtype && systemSubtypes.includes(msg.subtype)) {
              return false;
            }
            
            // 실제 봇 메시지만 포함
            return msg.user === this.botUserId || 
                   msg.bot_id || 
                   msg.subtype === 'bot_message';
          });

          // 모든 메시지 중에서 스레드가 있는 것들도 확인 (유저 메시지 포함)
          const allMessagesWithThreads = includeThreads ? 
            result.messages.filter(msg => msg.reply_count && msg.reply_count > 0) : [];

          // 봇 메시지 처리
          for (const msg of botMessages) {
            // 스킵 로직
            if (skippedCount < skipCount) {
              skippedCount++;
              continue;
            }

            if (fetchedCount >= limit) break;

            const permalink = await this.getMessagePermalink(channelId, msg.ts!);
            
            // 메인 메시지 추가
            messages.push({
              ts: msg.ts!,
              text: msg.text || '',
              channel: channelId,
              user: msg.user || msg.bot_id || 'bot',
              type: msg.type!,
              subtype: msg.subtype,
              bot_id: msg.bot_id,
              app_id: msg.app_id,
              username: msg.username,
              attachments: msg.attachments,
              blocks: msg.blocks,
              reactions: msg.reactions,
              thread_ts: msg.thread_ts,
              reply_count: msg.reply_count,
              permalink,
              created_at: new Date(parseFloat(msg.ts!) * 1000)
            });

            fetchedCount++;

            // 봇 메시지의 스레드 답글들도 가져오기
            if (includeThreads && msg.reply_count && msg.reply_count > 0 && fetchedCount < limit) {
              try {
                const threadMessages = await this.getThreadMessages(channelId, msg.ts!, limit - fetchedCount);
                messages.push(...threadMessages);
                fetchedCount += threadMessages.length;
              } catch (error) {
                this.logger.warn(`스레드 메시지 조회 실패 (${channelId}/${msg.ts!}):`, error);
              }
            }
          }

          // 유저 메시지의 스레드에서 봇 댓글이 있는지 확인
          if (includeThreads && fetchedCount < limit) {
            const userMessagesWithThreads = allMessagesWithThreads.filter(msg => 
              !botMessages.some(botMsg => botMsg.ts === msg.ts)
            );

            for (const msg of userMessagesWithThreads) {
              if (fetchedCount >= limit) break;
              
              try {
                const threadMessages = await this.getThreadMessages(channelId, msg.ts!, limit - fetchedCount);
                if (threadMessages.length > 0) {
                  // 스킵 로직 적용
                  for (const threadMsg of threadMessages) {
                    if (skippedCount < skipCount) {
                      skippedCount++;
                      continue;
                    }
                    if (fetchedCount >= limit) break;
                    
                    messages.push(threadMsg);
                    fetchedCount++;
                  }
                }
              } catch (error) {
                this.logger.warn(`유저 메시지 스레드 조회 실패 (${channelId}/${msg.ts!}):`, error);
              }
            }
          }
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor && fetchedCount < limit && (skippedCount < skipCount + fetchedCount));

      return messages.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    } catch (error) {
      this.logger.error(`채널 ${channelId} 메시지 조회 오류:`, error);
      return [];
    }
  }

  // 스레드 메시지들을 가져오는 새로운 메서드
  private async getThreadMessages(
    channelId: string, 
    threadTs: string, 
    maxMessages: number
  ): Promise<SlackMessage[]> {
    try {
      const threadMessages: SlackMessage[] = [];
      let cursor: string | undefined;
      let fetchedCount = 0;

      do {
        const result = await this.client.conversations.replies({
          channel: channelId,
          ts: threadTs,
          limit: Math.min(200, maxMessages - fetchedCount),
          cursor
        });

        if (result.messages) {
          // 첫 번째 메시지는 원본 메시지이므로 제외하고 답글들만 처리
          const replies = result.messages.slice(1).filter(msg => {
            // 봇 메시지만 필터링 (타입 안전성을 위해 any로 캐스팅)
            const message = msg as any;
            return message.user === this.botUserId || 
                   message.bot_id || 
                   message.subtype === 'bot_message';
          });

          for (const reply of replies) {
            const message = reply as any; // 타입 안전성을 위해 any로 캐스팅
            const permalink = await this.getMessagePermalink(channelId, message.ts!);
            
            threadMessages.push({
              ts: message.ts!,
              text: message.text || '',
              channel: channelId,
              user: message.user || message.bot_id || 'bot',
              type: message.type!,
              subtype: message.subtype,
              bot_id: message.bot_id,
              app_id: message.app_id,
              username: message.username,
              attachments: message.attachments,
              blocks: message.blocks,
              reactions: message.reactions,
              thread_ts: message.thread_ts,
              reply_count: message.reply_count,
              permalink,
              created_at: new Date(parseFloat(message.ts!) * 1000)
            });

            fetchedCount++;
            if (fetchedCount >= maxMessages) break;
          }
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor && fetchedCount < maxMessages);

      return threadMessages;

    } catch (error) {
      this.logger.error(`스레드 메시지 조회 오류 (${channelId}/${threadTs}):`, error);
      return [];
    }
  }

  async updateMessage(channelId: string, timestamp: string, newText: string, blocks?: any[]): Promise<boolean> {
    try {
      const result = await this.client.chat.update({
        channel: channelId,
        ts: timestamp,
        text: newText,
        blocks: blocks
      });

      if (result.ok) {
        this.logger.log(`메시지 수정 성공: ${channelId}/${timestamp}`);
        return true;
      } else {
        this.logger.error('메시지 수정 실패:', result.error);
        return false;
      }
    } catch (error) {
      this.logger.error('메시지 수정 오류:', error);
      throw error;
    }
  }

  async deleteMessage(channelId: string, timestamp: string): Promise<boolean> {
    try {
      const result = await this.client.chat.delete({
        channel: channelId,
        ts: timestamp
      });

      if (result.ok) {
        this.logger.log(`메시지 삭제 성공: ${channelId}/${timestamp}`);
        return true;
      } else {
        this.logger.error('메시지 삭제 실패:', result.error);
        return false;
      }
    } catch (error) {
      this.logger.error('메시지 삭제 오류:', error);
      throw error;
    }
  }

  async getMessageDetails(channelId: string, timestamp: string): Promise<SlackMessage | null> {
    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        latest: timestamp,
        oldest: timestamp,
        limit: 1,
        inclusive: true
      });

      if (result.messages && result.messages.length > 0) {
        const msg = result.messages[0];
        const permalink = await this.getMessagePermalink(channelId, timestamp);

        return {
          ts: msg.ts!,
          text: msg.text || '',
          channel: channelId,
          user: msg.user || msg.bot_id || 'bot',
          type: msg.type!,
          subtype: msg.subtype,
          bot_id: msg.bot_id,
          app_id: msg.app_id,
          username: msg.username,
          attachments: msg.attachments,
          blocks: msg.blocks,
          reactions: msg.reactions,
          thread_ts: msg.thread_ts,
          reply_count: msg.reply_count,
          permalink,
          created_at: new Date(parseFloat(msg.ts!) * 1000)
        };
      }

      return null;
    } catch (error) {
      this.logger.error('메시지 상세 조회 오류:', error);
      return null;
    }
  }

  private async getMessagePermalink(channelId: string, timestamp: string): Promise<string | undefined> {
    try {
      const result = await this.client.chat.getPermalink({
        channel: channelId,
        message_ts: timestamp
      });
      return result.permalink;
    } catch (error) {
      return undefined;
    }
  }

  async sendMessage(channelId: string, text: string, blocks?: any[]): Promise<string | null> {
    try {
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: text,
        blocks: blocks
      });

      if (result.ok && result.ts) {
        this.logger.log(`메시지 전송 성공: ${channelId}`);
        return result.ts;
      } else {
        this.logger.error('메시지 전송 실패:', result.error);
        return null;
      }
    } catch (error) {
      this.logger.error('메시지 전송 오류:', error);
      throw error;
    }
  }

  async getChannelList(): Promise<{ id: string; name: string; is_member: boolean }[]> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 1000
      });

      return result.channels?.map(channel => ({
        id: channel.id!,
        name: channel.name!,
        is_member: channel.is_member || false
      })) || [];
    } catch (error) {
      this.logger.error('채널 목록 조회 오류:', error);
      return [];
    }
  }

  async testAuth(): Promise<any> {
    try {
      const auth = await this.client.auth.test();
      this.logger.log('Slack 인증 테스트 성공:', auth);
      return {
        ok: auth.ok,
        team: auth.team,
        user: auth.user,
        team_id: auth.team_id,
        user_id: auth.user_id,
        bot_id: auth.bot_id,
        url: auth.url
      };
    } catch (error) {
      this.logger.error('Slack 인증 테스트 실패:', error);
      throw error;
    }
  }
}
