export declare enum AnonymizationActionType {
    REMOVE = "remove",
    REPLACE = "replace",
    HASH = "hash",
    MASK = "mask",
    SHIFT_DATE = "shift_date",
    KEEP = "keep",
    EMPTY = "empty"
}
export interface AnonymizationRule {
    id: string;
    hospitalId: string;
    ruleName: string;
    description?: string;
    tagRules: TagRule[];
    enabled: boolean;
    priority: number;
    createdAt: string;
    updatedAt: string;
}
export interface TagRule {
    tagKey: string;
    action: AnonymizationActionType;
    replacementValue?: string | number | null;
    maskPattern?: string;
    dateShiftDays?: number;
    hashAlgorithm?: string;
    hashSalt?: string;
}
export interface RoutingTarget {
    id: string;
    hospitalId: string;
    targetName: string;
    host: string;
    port: number;
    aeTitle: string;
    modalities?: string[];
    sourceAeTitles?: string[];
    priority: number;
    enabled: boolean;
    description?: string;
}
export interface PacsTransferContext {
    sourceAeTitle: string;
    sourceHost: string;
    sourcePort: number;
    destinationAeTitle: string;
    destinationHost: string;
    destinationPort: number;
    sopClassUid: string;
    sopInstanceUid: string;
    patientId: string;
    studyInstanceUid: string;
    seriesInstanceUid: string;
    hospitalId: string;
    modality: string;
}
export declare enum AuditEventType {
    DICOM_RECEIVED = "dicom_received",
    ANONYMIZATION_STARTED = "anonymization_started",
    ANONYMIZATION_COMPLETED = "anonymization_completed",
    ROUTING_DECIDED = "routing_decided",
    PACS_TRANSFER_STARTED = "pacs_transfer_started",
    PACS_TRANSFER_COMPLETED = "pacs_transfer_completed",
    PACS_TRANSFER_FAILED = "pacs_transfer_failed",
    ERROR_OCCURRED = "error_occurred"
}
export interface AuditLogEntry {
    id: string;
    eventType: AuditEventType;
    timestamp: string;
    traceId: string;
    hospitalId?: string;
    sourceAeTitle?: string;
    destinationAeTitle?: string;
    sopClassUid?: string;
    sopInstanceUid?: string;
    patientId?: string;
    anonymizedPatientId?: string;
    studyInstanceUid?: string;
    seriesInstanceUid?: string;
    ruleApplied?: string;
    ruleId?: string;
    tagsModified?: string[];
    tagsRemoved?: string[];
    routingTargetId?: string;
    durationMs?: number;
    status: 'success' | 'failed' | 'processing';
    errorMessage?: string;
    errorStack?: string;
    additionalData?: Record<string, any>;
}
export interface ProcessingResult {
    traceId: string;
    hospitalId: string;
    originalSopInstanceUid: string;
    anonymizedSopInstanceUid: string;
    anonymizedBuffer: Buffer;
    routingTarget: RoutingTarget;
    modifiedTags: string[];
    removedTags: string[];
    processingDurationMs: number;
}
