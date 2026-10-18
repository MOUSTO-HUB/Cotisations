import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { TontinesModule } from './tontines/tontines.module';

@Module({
  imports: [TontinesModule],
  controllers: [HealthController],
})
export class AppModule {}
