"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogException = exports.DicomNetworkException = exports.RoutingTargetNotFoundException = exports.AnonymizationRuleException = exports.DicomParseException = void 0;
const common_1 = require("@nestjs/common");
class DicomParseException extends common_1.HttpException {
    constructor(message, cause) {
        super({
            code: 'DICOM_PARSE_ERROR',
            message,
            timestamp: new Date().toISOString(),
        }, common_1.HttpStatus.BAD_REQUEST);
        if (cause) {
            this.cause = cause;
        }
    }
}
exports.DicomParseException = DicomParseException;
class AnonymizationRuleException extends common_1.HttpException {
    constructor(message, ruleId) {
        super({
            code: 'ANONYMIZATION_RULE_ERROR',
            message,
            ruleId,
            timestamp: new Date().toISOString(),
        }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
exports.AnonymizationRuleException = AnonymizationRuleException;
class RoutingTargetNotFoundException extends common_1.HttpException {
    constructor(hospitalId, modality) {
        super({
            code: 'ROUTING_TARGET_NOT_FOUND',
            message: `No PACS target found for hospital ${hospitalId}${modality ? ` and modality ${modality}` : ''}`,
            hospitalId,
            modality,
            timestamp: new Date().toISOString(),
        }, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.RoutingTargetNotFoundException = RoutingTargetNotFoundException;
class DicomNetworkException extends common_1.HttpException {
    constructor(message, aeTitle, cause) {
        super({
            code: 'DICOM_NETWORK_ERROR',
            message,
            aeTitle,
            timestamp: new Date().toISOString(),
        }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        if (cause) {
            this.cause = cause;
        }
    }
}
exports.DicomNetworkException = DicomNetworkException;
class AuditLogException extends common_1.HttpException {
    constructor(message, cause) {
        super({
            code: 'AUDIT_LOG_ERROR',
            message,
            timestamp: new Date().toISOString(),
        }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        if (cause) {
            this.cause = cause;
        }
    }
}
exports.AuditLogException = AuditLogException;
//# sourceMappingURL=custom.exceptions.js.map