import { ParsedDicomObject } from '@common/types/dicom.types';
export declare class DicomBinaryParser {
    private readonly logger;
    private readonly DICOM_MAGIC;
    private readonly PREAMBLE_LENGTH;
    parse(buffer: Buffer): ParsedDicomObject;
    private validateDicomPreamble;
    private parseNextTag;
    private findSequenceDelimiter;
    private decodeValue;
    private validateVR;
    private isLongVr;
    private extractTransferSyntax;
    private cleanStringValue;
    private updateTransferSyntax;
}
