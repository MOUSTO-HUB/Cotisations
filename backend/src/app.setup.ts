import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Traduit les erreurs Prisma attendues en réponses HTTP claires :
 * doublon de clé unique (saisies simultanées) → 409, ligne absente → 404.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (error.code === 'P2002') {
      return super.catch(
        new ConflictException('Cette opération a déjà été enregistrée.'),
        host,
      );
    }
    if (error.code === 'P2025') {
      return super.catch(new NotFoundException('Élément introuvable.'), host);
    }
    return super.catch(error, host);
  }
}

/** Configuration partagée par l'API et les tests e2e. */
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaExceptionFilter(httpAdapter));
}
