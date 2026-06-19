import { HttpException, HttpStatus } from '@nestjs/common';

export class DicomParseException extends HttpException {
  constructor(message: string, cause?: Error) {
    super(
      {
        code: 'DICOM_PARSE_ERROR',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
    if (cause) {
      this.cause = cause;
    }
  }
}

export class AnonymizationRuleException extends HttpException {
  constructor(message: string, ruleId?: string) {
    super(
      {
        code: 'ANONYMIZATION_RULE_ERROR',
        message,
        ruleId,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class RoutingTargetNotFoundException extends HttpException {
  constructor(hospitalId: string, modality?: string) {
    super(
      {
        code: 'ROUTING_TARGET_NOT_FOUND',
        message: `No PACS target found for hospital ${hospitalId}${modality ? ` and modality ${modality}` : ''}`,
        hospitalId,
        modality,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DicomNetworkException extends HttpException {
  constructor(message: string, aeTitle?: string, cause?: Error) {
    super(
      {
        code: 'DICOM_NETWORK_ERROR',
        message,
        aeTitle,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    if (cause) {
      this.cause = cause;
    }
  }
}

export class AuditLogException extends HttpException {
  constructor(message: string, cause?: Error) {
    super(
      {
        code: 'AUDIT_LOG_ERROR',
        message,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    if (cause) {
      this.cause = cause;
    }
  }
}
