import { Matches } from 'class-validator';

export class SetPinDto {
  @Matches(/^\d{4,6}$/, {
    message: 'Le code PIN doit contenir 4 à 6 chiffres.',
  })
  pin!: string;
}
