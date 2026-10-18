import { Module } from '@nestjs/common';
import { CashboxModule } from '../cashbox/cashbox.module';
import { GroupsModule } from '../groups/groups.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [GroupsModule, CashboxModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
