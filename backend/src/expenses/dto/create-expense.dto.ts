import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

export class CreateExpenseDto {
  @IsUUID()
  cashboxId!: string;

  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;

  /** Ex. « aide », « matériaux », « transport », « frais de réunion ». */
  @IsString()
  @Length(2, 50)
  category!: string;

  /** Ex. « Ciment pour le puits — 20 sacs ». */
  @IsString()
  @Length(3, 200)
  label!: string;

  /** Poste du budget du projet auquel la dépense est rattachée. */
  @IsOptional()
  @IsUUID()
  budgetLineId?: string;

  /** Lien vers la photo de la facture ou du devis (RG-D2). */
  @IsOptional()
  @IsUrl({ require_protocol: true })
  justificationUrl?: string;

  /** Identifiant unique de la saisie, contre les doublons (réseau coupé). */
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;
}

export class JustificationDto {
  @IsUrl({ require_protocol: true })
  justificationUrl!: string;
}
