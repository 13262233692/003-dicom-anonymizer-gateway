import { ParsedDicomObject } from '@common/types/dicom.types';
export declare class DicomBinaryReconstructor {
    private readonly logger;
    reconstruct(parsed: ParsedDicomObject): Buffer;
    private serializeTags;
    private serializeTag;
    private encodeValue;
    private isLongVr;
    updateTag(parsed: ParsedDicomObject, group: number, element: number, value: any): void;
    removeTag(parsed: ParsedDicomObject, group: number, element: number): boolean;
    getTagValue(parsed: ParsedDicomObject, group: number, element: number): any;
    getTagValueString(parsed: ParsedDicomObject, group: number, element: number): string;
}
