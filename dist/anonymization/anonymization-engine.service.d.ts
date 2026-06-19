import { AnonymizationRule, ProcessingResult } from '@common/types/anonymization.types';
import { DicomBinaryReconstructor } from '@dicom/dicom-binary-reconstructor.service';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
export interface AnonymizationContext {
    traceId: string;
    hospitalId: string;
    sourceAeTitle: string;
    originalPatientId?: string;
    originalPatientName?: string;
    modifiedTags: string[];
    removedTags: string[];
    patientIdMapping?: Map<string, string>;
    dateShiftDays?: number;
    startTime: number;
}
export declare class AnonymizationEngine {
    private readonly reconstructor;
    private readonly parser;
    private readonly logger;
    constructor(reconstructor: DicomBinaryReconstructor, parser: DicomBinaryParser);
    process(rawBuffer: Buffer, rule: AnonymizationRule, hospitalId: string, sourceAeTitle: string): Promise<ProcessingResult>;
    private applyTagRule;
    private applyHashAction;
    private applyMaskAction;
    private applyDateShiftAction;
    private ensureUidsAnonymized;
    private hashString;
    private shiftDate;
    private generateDerivedUid;
    private calculateDateShiftDays;
    private getRulePriority;
}
