import { ConfigType } from '@nestjs/config';
import { Readable } from 'stream';
import configuration from '@common/config/configuration';
import { RedisRuleService } from '@redis/redis-rule.service';
import { DicomScuClient } from '@protocol/dicom-scu-client.service';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { RoutingTarget, ProcessingResult, PacsTransferContext } from '@common/types/anonymization.types';
import { DimseStatus } from '@protocol/dicom-pdu.types';
import { AnonymizationStreamResult } from '@dicom/dicom-anonymization-stream';
export declare class RoutingEngine {
    private readonly config;
    private readonly redisRuleService;
    private readonly dicomScuClient;
    private readonly dicomParser;
    private readonly logger;
    constructor(config: ConfigType<typeof configuration>, redisRuleService: RedisRuleService, dicomScuClient: DicomScuClient, dicomParser: DicomBinaryParser);
    resolveTarget(hospitalId: string, modality?: string, sourceAeTitle?: string): Promise<RoutingTarget>;
    forwardToPacs(processingResult: ProcessingResult, target: RoutingTarget, sourceAeTitle: string): Promise<{
        success: boolean;
        status: DimseStatus;
        durationMs: number;
        transferContext: PacsTransferContext;
    }>;
    forwardStreamToPacs(dataSetStream: Readable, streamResult: AnonymizationStreamResult, target: RoutingTarget, sourceAeTitle: string, hospitalId: string, traceId: string): Promise<{
        success: boolean;
        status: DimseStatus;
        durationMs: number;
        transferContext: PacsTransferContext;
    }>;
    private extractTagValue;
}
