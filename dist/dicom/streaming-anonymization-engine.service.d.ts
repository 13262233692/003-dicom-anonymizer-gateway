import { Readable } from 'stream';
import { AnonymizationRule, ProcessingResult, TagRule } from '@common/types/anonymization.types';
import { DicomAnonymizationStream, AnonymizationStreamResult } from './dicom-anonymization-stream';
import { DicomTag } from '@common/types/dicom.types';
import { PatientState } from '@common/types/hl7.types';
import { AnonymizationRuleEnhancer } from './anonymization-rule-enhancer.service';
export interface StreamingProcessResult {
    traceId: string;
    hospitalId: string;
    stream: Readable;
    metadata: Promise<AnonymizationStreamResult>;
    modifiedTags: string[];
    removedTags: string[];
}
export declare class StreamingAnonymizationEngine {
    private readonly ruleEnhancer;
    private readonly logger;
    constructor(ruleEnhancer: AnonymizationRuleEnhancer);
    createAnonymizationStream(rule: AnonymizationRule, hospitalId: string, sourceAeTitle: string, patientState?: PatientState | null): {
        stream: DicomAnonymizationStream;
        resultPromise: Promise<AnonymizationStreamResult>;
        traceId: string;
        effectiveTagRules: TagRule[];
    };
    processBuffer(buffer: Buffer, rule: AnonymizationRule, hospitalId: string, sourceAeTitle: string, patientState?: PatientState | null): Promise<ProcessingResult>;
    parseMetadataOnly(buffer: Buffer): Promise<Map<string, DicomTag>>;
    getMemoryUsageInfo(): {
        maxTagValueInMemory: string;
        streamHighWaterMark: string;
        expectedMemoryPerStream: string;
    };
}
