export interface SlackConfig {
  token: string;
  signingSecret?: string;
}

export const slackConfig: SlackConfig = {
  token: process.env.SLACK_BOT_TOKEN || '',
  signingSecret: process.env.SLACK_SIGNING_SECRET || ''
};