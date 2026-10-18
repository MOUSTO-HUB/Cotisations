import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

export class RecordDonationDto {
  /** Caisse qui reçoit le don : celle d'un projet, d'une collecte, ou la caisse générale. */
  @IsUUID()
  cashboxId!: string;

  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;

  /** Membre donateur ; sinon, donateur extérieur nommé (ressortissant, parrain…). */
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  donorName?: string;

  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;
}
