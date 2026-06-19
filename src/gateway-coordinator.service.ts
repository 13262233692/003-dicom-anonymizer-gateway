import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { CStoreRequest } from '@protocol/dicom-pdu.types';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { AnonymizationEngine } from '@anonymization/anonymization-engine.service';
import { RedisRuleService } from '@redis/redis-rule.service';
import { RoutingEngine } from '@routing/routing-engine.service';
import { AuditLoggerService } from '@audit/audit-logger.service';
import { AuditEventType } from '@common/types/anonymization.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GatewayCoordinator implements OnModuleInit {
  private readonly logger = new Logger(GatewayCoordinator.name);

  constructor(
    private readonly dicomScpServer: DicomScpServer,
    private readonly dicomParser: DicomBinaryParser,
    private readonly anonymizationEngine: AnonymizationEngine,
    private readonly redisRuleService: RedisRuleService,
    private readonly routingEngine: RoutingEngine,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Gateway Coordinator initializing DICOM C-STORE subscription');
    this.dicomScpServer.cStoreRequests$.subscribe({
      next: (request) => {
        this.handleCStoreRequest(request).catch((error) => {
          this.logger.error(`Unhandled error in C-STORE processing: ${error.message}`);
        });
      },
      error: (error) => {
        this.logger.error(`C-STORE stream error: ${error.message}`);
      },
    });
  }

  private async handleCStoreRequest(request: CStoreRequest): Promise<void> {
    const traceId = uuidv4();
    const startTime = Date.now();

    this.logger.log(
      `[${traceId}] C-STORE received: CallingAE=${request.association.callingAeTitle}, ` +
        `SOPClass=${request.command.sopClassUid}, SOPInstance=${request.command.sopInstanceUid}`,
    );

    await this.auditLogger.log({
      eventType: AuditEventType.DICOM_RECEIVED,
      traceId,
      sourceAeTitle: request.association.callingAeTitle,
      sopClassUid: request.command.sopClassUid,
      sopInstanceUid: request.command.sopInstanceUid,
      status: 'success',
      additionalData: {
        callingHost: request.association.callingHost,
        callingPort: request.association.callingPort,
      },
    });

    let hospitalId: string = 'default';
    let parsedDicom: any = null;

    try {
      parsedDicom = this.dicomParser.parse(request.dataSet);

      const institutionName = this.getTagString(parsedDicom, 0x0008, 0x0080);
      hospitalId = this.resolveHospitalId(
        institutionName,
        request.association.callingAeTitle,
      );

      this.logger.debug(`[${traceId}] Resolved hospital ID: ${hospitalId}`);

      const originalPatientId = this.getTagString(parsedDicom, 0x0010, 0x0020);
      const studyInstanceUid = this.getTagString(parsedDicom, 0x0020, 0x000d);
      const seriesInstanceUid = this.getTagString(parsedDicom, 0x0020, 0x000e);

      await this.auditLogger.log({
        eventType: AuditEventType.ANONYMIZATION_STARTED,
        traceId,
        hospitalId,
        sourceAeTitle: request.association.callingAeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: request.command.sopInstanceUid,
        patientId: originalPatientId,
        studyInstanceUid,
        seriesInstanceUid,
        status: 'processing',
      });

      const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);

      const processingResult = await this.anonymizationEngine.process(
        request.dataSet,
        anonymizationRule,
        hospitalId,
        request.association.callingAeTitle,
      );

      const anonymizedPatientId = this.getTagString(
        this.dicomParser.parse(processingResult.anonymizedBuffer),
        0x0010,
        0x0020,
      );

      await this.auditLogger.log({
        eventType: AuditEventType.ANONYMIZATION_COMPLETED,
        traceId,
        hospitalId,
        sourceAeTitle: request.association.callingAeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: processingResult.anonymizedSopInstanceUid,
        patientId: originalPatientId,
        anonymizedPatientId,
        studyInstanceUid,
        seriesInstanceUid,
        ruleId: anonymizationRule.id,
        ruleApplied: anonymizationRule.ruleName,
        tagsModified: processingResult.modifiedTags,
        tagsRemoved: processingResult.removedTags,
        durationMs: processingResult.processingDurationMs,
        status: 'success',
      });

      const modality = this.getTagString(parsedDicom, 0x0008, 0x0060);
      const routingTarget = await this.routingEngine.resolveTarget(
        hospitalId,
        modality || undefined,
        request.association.callingAeTitle,
      );

      await this.auditLogger.log({
        eventType: AuditEventType.ROUTING_DECIDED,
        traceId,
        hospitalId,
        destinationAeTitle: routingTarget.aeTitle,
        routingTargetId: routingTarget.id,
        status: 'success',
        additionalData: {
          targetHost: routingTarget.host,
          targetPort: routingTarget.port,
          targetName: routingTarget.targetName,
        },
      });

      await this.auditLogger.log({
        eventType: AuditEventType.PACS_TRANSFER_STARTED,
        traceId,
        hospitalId,
        destinationAeTitle: routingTarget.aeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: processingResult.anonymizedSopInstanceUid,
        routingTargetId: routingTarget.id,
        status: 'processing',
      });

      processingResult.routingTarget = routingTarget;

      const transferResult = await this.routingEngine.forwardToPacs(
        processingResult,
        routingTarget,
        request.association.calledAeTitle,
      );

      const totalDuration = Date.now() - startTime;

      if (transferResult.success) {
        await this.auditLogger.log({
          eventType: AuditEventType.PACS_TRANSFER_COMPLETED,
          traceId,
          hospitalId,
          destinationAeTitle: routingTarget.aeTitle,
          sopClassUid: request.command.sopClassUid,
          sopInstanceUid: processingResult.anonymizedSopInstanceUid,
          anonymizedPatientId,
          studyInstanceUid,
          seriesInstanceUid,
          routingTargetId: routingTarget.id,
          durationMs: transferResult.durationMs,
          status: 'success',
          additionalData: {
            totalDurationMs: totalDuration,
            dicomStatus: transferResult.status,
          },
        });

        this.logger.log(
          `[${traceId}] Processing pipeline completed successfully. ` +
            `Total duration: ${totalDuration}ms, Anonymization: ${processingResult.processingDurationMs}ms, ` +
            `Transfer: ${transferResult.durationMs}ms`,
        );
      } else {
        await this.auditLogger.log({
          eventType: AuditEventType.PACS_TRANSFER_FAILED,
          traceId,
          hospitalId,
          destinationAeTitle: routingTarget.aeTitle,
          sopClassUid: request.command.sopClassUid,
          sopInstanceUid: processingResult.anonymizedSopInstanceUid,
          routingTargetId: routingTarget.id,
          durationMs: transferResult.durationMs,
          status: 'failed',
          errorMessage: `PACS C-STORE failed with status: 0x${transferResult.status.toString(16)}`,
          additionalData: {
            totalDurationMs: totalDuration,
          },
        });

        this.logger.error(
          `[${traceId}] PACS transfer failed after ${totalDuration}ms. ` +
            `Status: 0x${transferResult.status.toString(16)}`,
        );
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      this.logger.error(
        `[${traceId}] Processing pipeline failed after ${totalDuration}ms: ${error.message}`,
      );
      this.logger.debug(`[${traceId}] Error stack: ${error.stack}`);

      await this.auditLogger.log({
        eventType: AuditEventType.ERROR_OCCURRED,
        traceId,
        hospitalId,
        sourceAeTitle: request.association.callingAeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: request.command.sopInstanceUid,
        status: 'failed',
        durationMs: totalDuration,
        errorMessage: error.message,
        errorStack: error.stack,
        additionalData: {
          errorType: error.constructor.name,
        },
      });
    }
  }

  private resolveHospitalId(institutionName: string, callingAeTitle: string): string {
    if (institutionName && institutionName.trim()) {
      const normalized = institutionName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (normalized.length > 0) {
        return normalized;
      }
    }

    if (callingAeTitle) {
      return callingAeTitle.trim().toLowerCase();
    }

    return 'default';
  }

  private getTagString(parsed: any, group: number, element: number): string {
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
