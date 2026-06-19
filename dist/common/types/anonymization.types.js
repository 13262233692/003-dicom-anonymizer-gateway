"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEventType = exports.AnonymizationActionType = void 0;
var AnonymizationActionType;
(function (AnonymizationActionType) {
    AnonymizationActionType["REMOVE"] = "remove";
    AnonymizationActionType["REPLACE"] = "replace";
    AnonymizationActionType["HASH"] = "hash";
    AnonymizationActionType["MASK"] = "mask";
    AnonymizationActionType["SHIFT_DATE"] = "shift_date";
    AnonymizationActionType["KEEP"] = "keep";
    AnonymizationActionType["EMPTY"] = "empty";
})(AnonymizationActionType || (exports.AnonymizationActionType = AnonymizationActionType = {}));
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["DICOM_RECEIVED"] = "dicom_received";
    AuditEventType["ANONYMIZATION_STARTED"] = "anonymization_started";
    AuditEventType["ANONYMIZATION_COMPLETED"] = "anonymization_completed";
    AuditEventType["ROUTING_DECIDED"] = "routing_decided";
    AuditEventType["PACS_TRANSFER_STARTED"] = "pacs_transfer_started";
    AuditEventType["PACS_TRANSFER_COMPLETED"] = "pacs_transfer_completed";
    AuditEventType["PACS_TRANSFER_FAILED"] = "pacs_transfer_failed";
    AuditEventType["ERROR_OCCURRED"] = "error_occurred";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
//# sourceMappingURL=anonymization.types.js.map