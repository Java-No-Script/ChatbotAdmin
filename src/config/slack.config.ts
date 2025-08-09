export interface SlackConfig {
  token: string;
  signingSecret?: string;
}

// 환경변수를 함수로 읽어서 동적으로 가져오기
export const getSlackConfig = (): SlackConfig => ({
  token: process.env.SLACK_BOT_TOKEN || '',
  signingSecret: process.env.SLACK_SIGNING_SECRET || ''
});

export const slackConfig: SlackConfig = {
  token: process.env.SLACK_BOT_TOKEN || '',
  signingSecret: process.env.SLACK_SIGNING_SECRET || ''
};