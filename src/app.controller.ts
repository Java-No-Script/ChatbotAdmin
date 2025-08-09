import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
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
  @ApiOperation({ summary: 'Download OpenAPI JSON specification' })
  @ApiResponse({ 
    status: 200, 
    description: 'OpenAPI JSON file downloaded successfully',
    content: {
      'application/json': {
        schema: {
          type: 'object'
        }
      }
    }
  })
  downloadOpenApiJson(@Res() res: Response) {
    try {
      const filePath = path.resolve(process.cwd(), 'openapi.json');
      
      // 파일이 존재하는지 확인
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          error: 'OpenAPI JSON file not found',
          message: 'The OpenAPI specification file has not been generated yet.'
        });
      }

      // 파일 내용 읽기
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const openApiSpec = JSON.parse(fileContent);

      // Content-Disposition 헤더 설정으로 다운로드 유도
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="openapi.json"');
      
      return res.json(openApiSpec);
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to read OpenAPI JSON file',
        message: error.message
      });
    }
  }

  @Get('api-docs')
  @ApiTags('documentation')
  @ApiOperation({ summary: 'Get OpenAPI JSON specification (inline)' })
  @ApiResponse({ 
    status: 200, 
    description: 'OpenAPI JSON specification returned inline'
  })
  getOpenApiJson() {
    try {
      const filePath = path.resolve(process.cwd(), 'openapi.json');
      
      if (!fs.existsSync(filePath)) {
        throw new Error('OpenAPI JSON file not found');
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Failed to read OpenAPI JSON file: ${error.message}`);
    }
  }
}