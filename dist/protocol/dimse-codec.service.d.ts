import { DimseCommand, DimseStatus } from './dicom-pdu.types';
export declare class DimseCodec {
    private readonly logger;
    decodeCommand(buffer: Buffer): DimseCommand;
    private decodeValue;
    encodeCStoreResponse(messageId: number, status: DimseStatus, sopClassUid: string, sopInstanceUid: string): Buffer;
    encodeCEchoResponse(messageId: number, status: DimseStatus): Buffer;
    private encodeTag;
    private encodeValue;
}
