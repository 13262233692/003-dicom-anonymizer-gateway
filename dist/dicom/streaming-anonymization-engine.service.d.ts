import { Readable } from 'stream';
import { AnonymizationRule, ProcessingResult } from '@common/types/anonymization.types';
import { DicomAnonymizationStream, AnonymizationStreamResult } from './dicom-anonymization-stream';
import { DicomTag } from '@common/types/dicom.types';
export interface StreamingProcessResult {
    traceId: string;
    hospitalId: string;
    stream: Readable;
    metadata: Promise<AnonymizationStreamResult>;
    modifiedTags: string[];
    removedTags: string[];
}
export declare class StreamingAnonymizationEngine {
    private readonly logger;
    createAnonymizationStream(rule: AnonymizationRule, hospitalId: string, sourceAeTitle: string): {
        stream: DicomAnonymizationStream;
        resultPromise: Promise<AnonymizationStreamResult>;
        traceId: string;
    };
    processBuffer(buffer: Buffer, rule: AnonymizationRule, hospitalId: string, sourceAeTitle: string): Promise<ProcessingResult>;
    parseMetadataOnly(buffer: Buffer): Promise<Map<string, DicomTag>>;
    getMemoryUsageInfo(): {
        maxTagValueInMemory: string;
        streamHighWaterMark: string;
        expectedMemoryPerStream: string;
    };
}
