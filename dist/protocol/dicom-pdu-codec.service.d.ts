import { DicomPDU } from './dicom-pdu.types';
export declare class DicomPduCodec {
    private readonly logger;
    decode(buffer: Buffer): DicomPDU;
    private decodeAssociateRq;
    private decodeAssociateAc;
    private decodeAssociateRj;
    private decodePDataTf;
    private decodeAbort;
    encode(pdu: DicomPDU): Buffer;
    private encodeAssociateAc;
    private encodeAssociateRj;
    private encodePDataTf;
    private encodeReleaseRp;
    private encodeAbort;
    encodePDataChunks(presentationContextId: number, commandData: Buffer, dataSetData: Buffer | null, maxPduLength: number): Buffer[];
}
