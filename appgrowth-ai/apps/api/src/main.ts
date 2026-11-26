import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'], rawBody: true, bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('AppGrowth AI API').setVersion('1.0')
    .setDescription('Multi-tenant mobile app growth platform by Nous Healthcare Solutions. Send X-Organization-Id for organization-scoped endpoints.')
    .addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' });
  await app.listen(Number(process.env.PORT ?? 4100));
}
bootstrap();
