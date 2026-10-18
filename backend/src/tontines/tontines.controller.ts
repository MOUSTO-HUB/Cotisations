import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SimulateTontineDto } from './dto/simulate-tontine.dto';
import {
  computeTontineSchedule,
  TontineParamsError,
} from './domain/tontine-schedule';

@Controller('tontines')
export class TontinesController {
  /**
   * Simule une tontine avant sa création : pot, nombre de tours, date de fin
   * et calendrier. Les montants sont renvoyés en chaînes (entiers exacts).
   */
  @Public()
  @Post('simulate')
  simulate(@Body() dto: SimulateTontineDto) {
    try {
      const schedule = computeTontineSchedule({
        ...dto,
        contributionAmount: BigInt(dto.contributionAmount),
      });
      return {
        potAmount: schedule.potAmount.toString(),
        roundCount: schedule.roundCount,
        endDate: schedule.endDate,
        totalPerShare: schedule.totalPerShare.toString(),
        rounds: schedule.rounds.map((r) => ({
          number: r.number,
          dueDate: r.dueDate,
          potAmount: r.potAmount.toString(),
        })),
      };
    } catch (error) {
      if (error instanceof TontineParamsError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
