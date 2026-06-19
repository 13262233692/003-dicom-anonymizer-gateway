export declare enum PduType {
    A_ASSOCIATE_RQ = 1,
    A_ASSOCIATE_AC = 2,
    A_ASSOCIATE_RJ = 3,
    P_DATA_TF = 4,
    A_RELEASE_RQ = 5,
    A_RELEASE_RP = 6,
    A_ABORT = 7
}
export interface PresentationContext {
    id: number;
    abstractSyntax: string;
    transferSyntaxes: string[];
    result?: number;
    acceptedTransferSyntax?: string;
}
export interface UserIdentityItem {
    type: number;
    primaryField?: string;
    secondaryField?: string;
}
export interface AssociateRqPDU {
    type: PduType.A_ASSOCIATE_RQ;
    callingAeTitle: string;
    calledAeTitle: string;
    applicationContext: string;
    presentationContexts: PresentationContext[];
    userIdentity?: UserIdentityItem;
    maxLength: number;
    implementationClassUid?: string;
    implementationVersionName?: string;
    callingPresentationAddress?: string;
}
export interface AssociateAcPDU {
    type: PduType.A_ASSOCIATE_AC;
    callingAeTitle: string;
    calledAeTitle: string;
    applicationContext: string;
    presentationContexts: PresentationContext[];
    maxLength: number;
    implementationClassUid?: string;
    implementationVersionName?: string;
}
export interface AssociateRjPDU {
    type: PduType.A_ASSOCIATE_RJ;
    result: number;
    source: number;
    reason: number;
}
export interface PresentationDataValueItem {
    presentationContextId: number;
    command: boolean;
    last: boolean;
    data: Buffer;
}
export interface PDataTfPDU {
    type: PduType.P_DATA_TF;
    pdvItems: PresentationDataValueItem[];
}
export interface ReleaseRqPDU {
    type: PduType.A_RELEASE_RQ;
}
export interface ReleaseRpPDU {
    type: PduType.A_RELEASE_RP;
}
export interface AbortPDU {
    type: PduType.A_ABORT;
    source: number;
    reason: number;
}
export type DicomPDU = AssociateRqPDU | AssociateAcPDU | AssociateRjPDU | PDataTfPDU | ReleaseRqPDU | ReleaseRpPDU | AbortPDU;
export declare enum CommandField {
    C_STORE_RQ = 1,
    C_STORE_RSP = 32769,
    C_FIND_RQ = 32,
    C_FIND_RSP = 32800,
    C_MOVE_RQ = 33,
    C_MOVE_RSP = 32801,
    C_GET_RQ = 16,
    C_GET_RSP = 32784,
    C_ECHO_RQ = 48,
    C_ECHO_RSP = 32816
}
export declare enum DimseStatus {
    SUCCESS = 0,
    WARNING = 1,
    PENDING = 65280,
    CANCEL = 65024,
    NO_SUCH_SOP_CLASS = 274,
    CLASS_INSTANCE_CONFLICT = 281,
    MISSING_ATTRIBUTE = 288,
    MISSING_ATTRIBUTE_VALUE = 289,
    C_STORE_UNABLE_TO_PROCESS = 42752,
    OUT_OF_RESOURCES = 42753,
    DATA_SET_DOES_NOT_MATCH_SOP_CLASS = 43264,
    C_STORE_CANNOT_UNDERSTAND = 49152,
    PROCESSING_FAILURE = 272,
    DUPLICATE_SOP_INSTANCE = 273
}
export interface DimseCommand {
    commandField: CommandField;
    messageId: number;
    messageIdBeingRespondedTo?: number;
    sopClassUid?: string;
    sopInstanceUid?: string;
    status: DimseStatus;
    priority?: number;
    dataSetType: number;
    moveOriginatorApplicationEntityTitle?: string;
    moveOriginatorMessageId?: number;
    affectedSopInstanceUid?: string;
}
export interface CStoreRequest {
    association: DicomAssociation;
    presentationContextId: number;
    command: DimseCommand;
    dataSet: Buffer;
}
export interface CStoreResponse {
    status: DimseStatus;
    message: string;
}
export interface DicomAssociation {
    id: string;
    callingAeTitle: string;
    calledAeTitle: string;
    callingHost: string;
    callingPort: number;
    presentationContexts: Map<number, PresentationContext>;
    maxReceivePduLength: number;
    maxSendPduLength: number;
    acceptedAt: Date;
    state: AssociationState;
}
export declare enum AssociationState {
    IDLE = "idle",
    AWAITING_ASSOCIATE_RQ = "awaiting_associate_rq",
    ASSOCIATION_ESTABLISHED = "association_established",
    AWAITING_RELEASE_RP = "awaiting_release_rp",
    RELEASED = "released",
    ABORTED = "aborted"
}
