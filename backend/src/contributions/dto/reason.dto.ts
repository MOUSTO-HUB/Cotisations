import { IsString, Length } from 'class-validator';

/** Motif obligatoire : contestation, annulation, exonération (RG-C3, RG-C4). */
export class ReasonDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
