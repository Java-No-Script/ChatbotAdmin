import { Injectable, Logger } from '@nestjs/common';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { awsConfig } from '../config/aws.config';

@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private readonly bedrockClient: BedrockRuntimeClient;

  constructor() {
    this.bedrockClient = new BedrockRuntimeClient({
      region: awsConfig.region,
      credentials: awsConfig.credentials
    });
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const input = {
        modelId: awsConfig.bedrock.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text,
          dimensions: awsConfig.bedrock.dimensions,
          normalize: true
        })
      };

      this.logger.log(`임베딩 생성 중: ${text.substring(0, 50)}...`);
      const command = new InvokeModelCommand(input);
      const response = await this.bedrockClient.send(command);

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      this.logger.log(`임베딩 생성 완료: ${responseBody.embedding.length}차원`);
      
      return responseBody.embedding;

    } catch (error) {
      if (error.name === 'ValidationException' && error.message.includes('Operation not allowed')) {
        this.logger.warn('Bedrock 모델에 접근 권한이 없습니다. AWS 콘솔에서 모델 액세스를 요청하세요.');
        // 임시로 더미 임베딩 반환 (개발용)
        return new Array(awsConfig.bedrock.dimensions).fill(0).map(() => Math.random());
      }
      this.logger.error('Bedrock 임베딩 생성 오류:', error);
      this.logger.error('사용된 모델 ID:', awsConfig.bedrock.modelId);
      this.logger.error('AWS 리전:', awsConfig.region);
      throw error;
    }
  }

  async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      try {
        const embedding = await this.createEmbedding(text);
        embeddings.push(embedding);
        
        // API 호출 제한 방지를 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`배치 임베딩 생성 실패: ${text.substring(0, 50)}`, error);
        throw error;
      }
    }
    
    return embeddings;
  }
}