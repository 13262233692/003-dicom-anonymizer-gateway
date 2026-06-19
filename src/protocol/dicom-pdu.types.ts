import { Readable } from 'stream';

export enum PduType {
  A_ASSOCIATE_RQ = 0x01,
  A_ASSOCIATE_AC = 0x02,
  A_ASSOCIATE_RJ = 0x03,
  P_DATA_TF = 0x04,
  A_RELEASE_RQ = 0x05,
  A_RELEASE_RP = 0x06,
  A_ABORT = 0x07,
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

export type DicomPDU =
  | AssociateRqPDU
  | AssociateAcPDU
  | AssociateRjPDU
  | PDataTfPDU
  | ReleaseRqPDU
  | ReleaseRpPDU
  | AbortPDU;

export enum CommandField {
  C_STORE_RQ = 0x0001,
  C_STORE_RSP = 0x8001,
  C_FIND_RQ = 0x0020,
  C_FIND_RSP = 0x8020,
  C_MOVE_RQ = 0x0021,
  C_MOVE_RSP = 0x8021,
  C_GET_RQ = 0x0010,
  C_GET_RSP = 0x8010,
  C_ECHO_RQ = 0x0030,
  C_ECHO_RSP = 0x8030,
}

export enum DimseStatus {
  SUCCESS = 0x0000,
  WARNING = 0x0001,
  PENDING = 0xFF00,
  CANCEL = 0xFE00,
  NO_SUCH_SOP_CLASS = 0x0112,
  CLASS_INSTANCE_CONFLICT = 0x0119,
  MISSING_ATTRIBUTE = 0x0120,
  MISSING_ATTRIBUTE_VALUE = 0x0121,
  C_STORE_UNABLE_TO_PROCESS = 0xA700,
  OUT_OF_RESOURCES = 0xA701,
  DATA_SET_DOES_NOT_MATCH_SOP_CLASS = 0xA900,
  C_STORE_CANNOT_UNDERSTAND = 0xC000,
  PROCESSING_FAILURE = 0x0110,
  DUPLICATE_SOP_INSTANCE = 0x0111,
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

export interface CStoreStreamRequest {
  association: DicomAssociation;
  presentationContextId: number;
  command: DimseCommand;
  dataSetStream: Readable;
  messageId: number;
  respond: (status: DimseStatus) => void;
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

export enum AssociationState {
  IDLE = 'idle',
  AWAITING_ASSOCIATE_RQ = 'awaiting_associate_rq',
  ASSOCIATION_ESTABLISHED = 'association_established',
  AWAITING_RELEASE_RP = 'awaiting_release_rp',
  RELEASED = 'released',
  ABORTED = 'aborted',
}
