/* eslint-disable @typescript-eslint/no-empty-function */
export class ConsoleUtil {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static logger: any;

  static DisableLog() {
    if (!ConsoleUtil.logger) {
      // eslint-disable-next-line no-console
      ConsoleUtil.logger = console.log;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    // eslint-disable-next-line no-console
    console.log = function() { };
  }

  static EnableLog() {
    // eslint-disable-next-line no-console
    console.log = ConsoleUtil.logger;
  }
}