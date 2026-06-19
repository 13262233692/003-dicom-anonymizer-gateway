import { Transform, TransformCallback } from 'stream';
import { DicomTag, DicomTagVR } from '@common/types/dicom.types';
export declare enum DicomStreamState {
    WAITING_PREAMBLE = "waiting_preamble",
    PARSING_FILE_META = "parsing_file_meta",
    PARSING_DATASET = "parsing_dataset",
    PARSING_TAG_HEADER = "parsing_tag_header",
    READING_TAG_VALUE = "reading_tag_value",
    STREAMING_PIXEL_DATA = "streaming_pixel_data",
    COMPLETE = "complete"
}
export interface StreamTagEvent {
    tagKey: string;
    group: number;
    element: number;
    vr: DicomTagVR;
    value: any;
    length: number;
    keyword?: string;
}
export interface StreamPixelDataEvent {
    chunk: Buffer;
    isEnd: boolean;
    totalBytesStreamed: number;
}
export declare class DicomStreamParser extends Transform {
    private state;
    private internalBuffer;
    private littleEndian;
    private explicitVR;
    private readonly PREAMBLE_LENGTH;
    private readonly DICOM_MAGIC;
    private tags;
    private currentTag;
    private pixelDataTotalLength;
    private pixelDataBytesStreamed;
    private pixelDataUndefinedLength;
    private transferSyntaxUid;
    private sopClassUid;
    private sopInstanceUid;
    private studyInstanceUid;
    private seriesInstanceUid;
    private patientId;
    private patientName;
    private modality;
    private tagHeadersAccumulated;
    private readonly MAX_TAG_VALUE_IN_MEMORY;
    constructor();
    _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private processBuffer;
    private tryParsePreamble;
    private tryParseTagHeader;
    private handleDelimiter;
    private tryReadTagValue;
    private finalizeTag;
    private tryStreamPixelData;
    private currentStateToHeaderState;
    private decodeValue;
    private validateVR;
    private isLongVr;
    private isPixelLikeVR;
    private extractTransferSyntax;
    private cleanStringValue;
    private updateTransferSyntax;
    getTags(): Map<string, DicomTag>;
    getTransferSyntaxUid(): string;
    getSopClassUid(): string;
    getSopInstanceUid(): string;
    getStudyInstanceUid(): string;
    getSeriesInstanceUid(): string;
    getPatientId(): string;
    getPatientName(): string;
    getModality(): string;
    getPixelDataBytesStreamed(): number;
    getState(): DicomStreamState;
}
