import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import configuration from '@common/config/configuration';
import { RedisRuleService } from '@redis/redis-rule.service';
import { DicomScuClient } from '@protocol/dicom-scu-client.service';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import {
  RoutingTarget,
  ProcessingResult,
  PacsTransferContext,
} from '@common/types/anonymization.types';
import { RoutingTargetNotFoundException } from '@common/exceptions/custom.exceptions';
import { DimseStatus } from '@protocol/dicom-pdu.types';

@Injectable()
export class RoutingEngine {
  private readonly logger = new Logger(RoutingEngine.name);

  constructor(
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
    private readonly redisRuleService: RedisRuleService,
    private readonly dicomScuClient: DicomScuClient,
    private readonly dicomParser: DicomBinaryParser,
  ) {}

  public async resolveTarget(
    hospitalId: string,
    modality?: string,
    sourceAeTitle?: string,
  ): Promise<RoutingTarget> {
    this.logger.debug(
      `Resolving routing target for hospital=${hospitalId}, modality=${modality}, sourceAE=${sourceAeTitle}`,
    );

    const target = await this.redisRuleService.getRoutingTarget(
      hospitalId,
      modality,
      sourceAeTitle,
    );

    if (target) {
      return target;
    }

    this.logger.warn(
      `No custom routing target found for hospital ${hospitalId}, using default PACS`,
    );

    const defaultTarget: RoutingTarget = {
      id: 'default-pacs',
      hospitalId,
      targetName: 'Default PACS',
      host: this.config.defaultPacs.host,
      port: this.config.defaultPacs.port,
      aeTitle: this.config.defaultPacs.aeTitle,
      priority: 0,
      enabled: true,
      description: 'Default fallback PACS server from configuration',
    };

    return defaultTarget;
  }

  public async forwardToPacs(
    processingResult: ProcessingResult,
    target: RoutingTarget,
    sourceAeTitle: string,
  ): Promise<{
    success: boolean;
    status: DimseStatus;
    durationMs: number;
    transferContext: PacsTransferContext;
  }> {
    const traceId = processingResult.traceId;
    const startTime = Date.now();

    this.logger.log(
      `[${traceId}] Forwarding to PACS ${target.aeTitle}@${target.host}:${target.port}`,
    );

    const parsed = this.dicomParser.parse(processingResult.anonymizedBuffer);

    const transferContext: PacsTransferContext = {
      sourceAeTitle,
      sourceHost: '0.0.0.0',
      sourcePort: this.config.dicomScp.port,
      destinationAeTitle: target.aeTitle,
      destinationHost: target.host,
      destinationPort: target.port,
      sopClassUid: parsed.sopClassUid,
      sopInstanceUid: processingResult.anonymizedSopInstanceUid,
      patientId: this.extractTagValue(parsed, 0x0010, 0x0020),
      studyInstanceUid: this.extractTagValue(parsed, 0x0020, 0x000d),
      seriesInstanceUid: this.extractTagValue(parsed, 0x0020, 0x000e),
      hospitalId: processingResult.hospitalId,
      modality: this.extractTagValue(parsed, 0x0008, 0x0060),
    };

    try {
      const status = await this.dicomScuClient.cStore(
        target.host,
        target.port,
        target.aeTitle,
        sourceAeTitle,
        parsed.sopClassUid,
        processingResult.anonymizedSopInstanceUid,
        processingResult.anonymizedBuffer,
        transferContext,
      );

      const durationMs = Date.now() - startTime;
      const success = status === DimseStatus.SUCCESS || status === DimseStatus.WARNING;

      this.logger.log(
        `[${traceId}] C-STORE to PACS completed: status=0x${status.toString(16)}, duration=${durationMs}ms, success=${success}`,
      );

      return {
        success,
        status,
        durationMs,
        transferContext,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `[${traceId}] C-STORE to PACS failed after ${durationMs}ms: ${error.message}`,
      );

      return {
        success: false,
        status: DimseStatus.PROCESSING_FAILURE,
        durationMs,
        transferContext,
      };
    }
  }

  private extractTagValue(parsed: any, group: number, element: number): string {
    const key = `(${group.toString(16).padStart(4, '0').toUpperCase()},${element.toString(16).padStart(4, '0').toUpperCase()})`;
    const tag = parsed.tags.get(key);
    if (!tag) return '';

    if (typeof tag.value === 'string') {
      return tag.value.trim().replace(/\0/g, '');
    }
    if (Buffer.isBuffer(tag.value)) {
      return tag.value.toString('utf8').trim().replace(/\0/g, '');
    }
    return String(tag.value || '');
  }
}
