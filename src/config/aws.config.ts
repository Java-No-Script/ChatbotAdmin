export interface AWSConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  bedrock: {
    modelId: string;
    dimensions: number;
  };
}

export const awsConfig: AWSConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
  bedrock: {
    modelId: process.env.BEDROCK_MODEL_ID || 'amazon.titan-embed-text-v2:0',
    dimensions: 1024
  }
};