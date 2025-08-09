import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());
  
  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Chatbot Admin API')
    .setDescription('NestJS chatbot admin application with Slack integration and web crawling')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('crawling', 'Web crawling operations')
    .addTag('slack', 'Slack bot message management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  // Save OpenAPI JSON file
  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI spec written to ${outputPath}`);
  
  // Setup Swagger UI
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI available at: http://localhost:${port}/api`);
}
bootstrap();
