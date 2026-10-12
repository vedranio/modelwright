import type { DesignError } from '@modelwright/schema';
import type { CoreErrorCode, SerialisedError } from './contract';

/** A core call's expected failure: a typed value that each transport maps onto its own wire format. */
export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string,
    /** Set for `invalid-design`. */
    readonly design?: DesignError,
  ) {
    super(message);
    this.name = 'CoreError';
  }

  static invalidDesign(design: DesignError): CoreError {
    return new CoreError('invalid-design', `${design.file}.json is invalid`, design);
  }

  toJSON(): SerialisedError {
    return {
      code: this.code,
      message: this.message,
      ...(this.design && { design: this.design }),
    };
  }
}
