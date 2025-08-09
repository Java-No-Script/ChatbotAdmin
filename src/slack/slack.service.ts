import { Injectable, Logger } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { slackConfig } from '../config/slack.config';

export interface SlackMessage {
  ts: string;
  text: string;
  channel: string;
  user: string;
  type: string;
  subtype?: string;
  bot_id?: string;
  app_id?: string;
  username?: string;
  attachments?: any[];
  blocks?: any[];
  reactions?: any[];
  thread_ts?: string;
  reply_count?: number;
  permalink?: string;
  created_at: Date;
}

export interface SlackMessageStats {
  totalMessages: number;
  channelStats: { [channelId: string]: { channelName: string; count: number } };
  dateRange: { from: Date; to: Date };
  botUserId: string;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly client: WebClient;
  private botUserId: string | null = null;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN || '';
    console.log('SLACK_BOT_TOKEN 환경변수:', process.env.SLACK_BOT_TOKEN);
    console.log('사용할 토큰:', token);
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
    limit: number = 100,
    oldest?: string,
    latest?: string
  ): Promise<{ messages: SlackMessage[]; stats: SlackMessageStats }> {
    try {
      if (!this.botUserId) {
        await this.initializeBotInfo();
      }

      const allMessages: SlackMessage[] = [];
      const channelStats: { [channelId: string]: { channelName: string; count: number } } = {};

      if (channelId) {
        // 특정 채널의 메시지 조회
        const messages = await this.getChannelBotMessages(channelId, limit, oldest, latest);
        allMessages.push(...messages);

        const channelInfo = await this.client.conversations.info({ channel: channelId });
        const channelName = channelInfo.channel?.name || channelId;
        channelStats[channelId] = { channelName, count: messages.length };
      } else {
        // 모든 채널의 메시지 조회
        const channels = await this.getBotChannels();
        
        for (const channel of channels) {
          const messages = await this.getChannelBotMessages(channel.id, limit, oldest, latest);
          allMessages.push(...messages);
          
          if (messages.length > 0) {
            channelStats[channel.id] = { channelName: channel.name, count: messages.length };
          }
        }
      }

      // 날짜 범위 계산
      const timestamps = allMessages.map(m => m.created_at).sort();
      const dateRange = {
        from: timestamps[0] || new Date(),
        to: timestamps[timestamps.length - 1] || new Date()
      };

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
    latest?: string
  ): Promise<SlackMessage[]> {
    try {
      const messages: SlackMessage[] = [];
      let cursor: string | undefined;
      let fetchedCount = 0;

      do {
        const result = await this.client.conversations.history({
          channel: channelId,
          limit: Math.min(200, limit - fetchedCount),
          cursor,
          oldest,
          latest
        });

        if (result.messages) {
          const botMessages = result.messages.filter(msg => 
            msg.user === this.botUserId || 
            msg.bot_id || 
            msg.subtype === 'bot_message'
          );

          for (const msg of botMessages) {
            const permalink = await this.getMessagePermalink(channelId, msg.ts!);
            
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
            if (fetchedCount >= limit) break;
          }
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor && fetchedCount < limit);

      return messages.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    } catch (error) {
      this.logger.error(`채널 ${channelId} 메시지 조회 오류:`, error);
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