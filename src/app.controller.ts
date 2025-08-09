import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('openapi.json')
  @ApiTags('documentation')
  @ApiOperation({ summary: 'Get OpenAPI JSON specification' })
  @ApiResponse({ 
    status: 200, 
    description: 'OpenAPI JSON specification returned as JSON response',
    content: {
      'application/json': {
        schema: {
          type: 'object'
        }
      }
    }
  })
  getOpenApiJson() {
    try {
      const filePath = path.resolve(process.cwd(), 'openapi.json');
      
      // 파일이 존재하는지 확인
      if (!fs.existsSync(filePath)) {
        throw new Error('OpenAPI JSON file not found');
      }

      // 파일 내용 읽기
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Failed to read OpenAPI JSON file: ${error.message}`);
    }
  }
}