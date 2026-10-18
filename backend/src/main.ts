import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

// Charge backend/.env s'il existe (Node 24) ; en production, les variables
// viennent de l'hébergeur.
try {
  process.loadEnvFile();
} catch {
  // pas de fichier .env : rien à faire
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  configureApp(app);

  // Documentation interactive : http://localhost:3400/docs
  const config = new DocumentBuilder()
    .setTitle('Cotisations API')
    .setDescription(
      'Gestion des cotisations des familles, communautés villageoises et tontines. ' +
        'Connectez-vous avec /auth/otp/request puis /auth/otp/verify, copiez le jeton ' +
        '(token) dans « Authorize », puis testez les autres routes.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3400);
}
void bootstrap();
