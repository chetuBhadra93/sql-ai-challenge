import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.enableCors();
  await app.listen(3000);
  console.log('API listening on http://localhost:3000');
}
bootstrap();