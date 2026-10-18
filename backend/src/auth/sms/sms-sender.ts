import { Injectable, Logger } from '@nestjs/common';

/**
 * Envoi de SMS. L'implémentation réelle (agrégateur SMS) viendra plus tard ;
 * en développement, les messages sont affichés dans la console.
 */
export abstract class SmsSender {
  abstract send(phone: string, message: string): Promise<void>;
}

@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  send(phone: string, message: string): Promise<void> {
    this.logger.log(`→ ${phone} : ${message}`);
    return Promise.resolve();
  }
}
