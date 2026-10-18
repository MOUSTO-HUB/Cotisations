import { Module } from '@nestjs/common';
import { TontinesController } from './tontines.controller';

@Module({
  controllers: [TontinesController],
})
export class TontinesModule {}
