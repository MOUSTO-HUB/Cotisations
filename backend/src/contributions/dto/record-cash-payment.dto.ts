import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

export class RecordCashPaymentDto {
  @IsUUID()
  membershipId!: string;

  @IsUUID()
  planId!: string;

  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;

  /**
   * Identifiant unique généré par l'application pour cette saisie : renvoyer
   * deux fois la même saisie (réseau coupé) ne crée pas de doublon.
   */
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;
}
