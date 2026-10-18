import {
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

export class EnrollMembersDto {
  /** Membres actifs à inscrire à la cotisation (ex. nouveaux arrivants). */
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  membershipIds!: string[];

  /**
   * Première échéance due par ces membres ; par défaut, aujourd'hui dans le
   * fuseau du groupe : un nouveau membre ne doit pas les échéances passées.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La date doit être au format AAAA-MM-JJ.',
  })
  fromDate?: string;
}
