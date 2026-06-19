import { HttpException } from '@nestjs/common';
export declare class DicomParseException extends HttpException {
    constructor(message: string, cause?: Error);
}
export declare class AnonymizationRuleException extends HttpException {
    constructor(message: string, ruleId?: string);
}
export declare class RoutingTargetNotFoundException extends HttpException {
    constructor(hospitalId: string, modality?: string);
}
export declare class DicomNetworkException extends HttpException {
    constructor(message: string, aeTitle?: string, cause?: Error);
}
export declare class AuditLogException extends HttpException {
    constructor(message: string, cause?: Error);
}
