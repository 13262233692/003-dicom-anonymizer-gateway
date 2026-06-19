import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { CStoreStreamRequest, DimseStatus } from '@protocol/dicom-pdu.types';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { AnonymizationEngine } from '@anonymization/anonymization-engine.service';
import { StreamingAnonymizationEngine } from '@dicom/streaming-anonymization-engine.service';
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
    private readonly streamingAnonymizationEngine: StreamingAnonymizationEngine,
    private readonly redisRuleService: RedisRuleService,
    private readonly routingEngine: RoutingEngine,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Gateway Coordinator initializing DICOM C-STORE streaming subscription');
    this.dicomScpServer.cStoreStreamRequests$.subscribe({
      next: (request) => {
        this.handleCStoreStreamRequest(request).catch((error) => {
          this.logger.error(`Unhandled error in C-STORE streaming processing: ${error.message}`);
          try {
            request.respond(DimseStatus.PROCESSING_FAILURE);
          } catch (_e) {
            // ignore
          }
        });
      },
      error: (error) => {
        this.logger.error(`C-STORE stream error: ${error.message}`);
      },
    });

    const memInfo = this.streamingAnonymizationEngine.getMemoryUsageInfo();
    this.logger.log(
      `Streaming pipeline configured: maxTagValueInMemory=${memInfo.maxTagValueInMemory}, ` +
        `expectedMemoryPerStream=${memInfo.expectedMemoryPerStream}`,
    );
  }

  private async handleCStoreStreamRequest(request: CStoreStreamRequest): Promise<void> {
    const traceId = uuidv4();
    const startTime = Date.now();

    this.logger.log(
      `[${traceId}] C-STORE streaming request received: ` +
        `CallingAE=${request.association.callingAeTitle}, ` +
        `SOPClass=${request.command.sopClassUid}, ` +
        `SOPInstance=${request.command.sopInstanceUid}`,
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
        processingMode: 'streaming-end-to-end',
      },
    });

    const hospitalId = this.resolveHospitalId(request.association.callingAeTitle);
    let responded = false;

    const respondWithStatus = (status: DimseStatus) => {
      if (!responded) {
        responded = true;
        request.respond(status);
      }
    };

    try {
      this.logger.debug(`[${traceId}] Resolved hospital ID: ${hospitalId} (from AE Title)`);

      await this.auditLogger.log({
        eventType: AuditEventType.ANONYMIZATION_STARTED,
        traceId,
        hospitalId,
        sourceAeTitle: request.association.callingAeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: request.command.sopInstanceUid,
        status: 'processing',
        additionalData: {
          processingMode: 'streaming-end-to-end',
        },
      });

      const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);

      const {
        stream: anonymizationStream,
        resultPromise: streamResultPromise,
      } = this.streamingAnonymizationEngine.createAnonymizationStream(
        anonymizationRule,
        hospitalId,
        request.association.callingAeTitle,
      );

      request.dataSetStream.pipe(anonymizationStream);

      const streamResult = await streamResultPromise;

      this.logger.debug(
        `[${traceId}] Stream metadata ready: modified=${streamResult.modifiedTags.length}, ` +
          `removed=${streamResult.removedTags.length}, ` +
          `pixelData=${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB`,
      );

      await this.auditLogger.log({
        eventType: AuditEventType.ANONYMIZATION_COMPLETED,
        traceId,
        hospitalId,
        sourceAeTitle: request.association.callingAeTitle,
        sopClassUid: request.command.sopClassUid,
        sopInstanceUid: streamResult.anonymizedSopInstanceUid,
        patientId: streamResult.originalPatientId,
        anonymizedPatientId: streamResult.anonymizedPatientId,
        studyInstanceUid: streamResult.studyInstanceUid,
        seriesInstanceUid: streamResult.seriesInstanceUid,
        ruleId: anonymizationRule.id,
        ruleApplied: anonymizationRule.ruleName,
        tagsModified: streamResult.modifiedTags,
        tagsRemoved: streamResult.removedTags,
        durationMs: Date.now() - startTime,
        status: 'success',
        additionalData: {
          processingMode: 'streaming-end-to-end',
          pixelDataBytesProcessed: streamResult.pixelDataBytesProcessed,
          totalTagsProcessed: streamResult.totalTagsProcessed,
        },
      });

      const routingTarget = await this.routingEngine.resolveTarget(
        hospitalId,
        streamResult.modality || undefined,
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
        sopInstanceUid: streamResult.anonymizedSopInstanceUid,
        routingTargetId: routingTarget.id,
        status: 'processing',
      });

      const transferResult = await this.routingEngine.forwardStreamToPacs(
        anonymizationStream,
        streamResult,
        routingTarget,
        request.association.calledAeTitle,
        hospitalId,
        traceId,
      );

      const totalDuration = Date.now() - startTime;

      if (transferResult.success) {
        respondWithStatus(DimseStatus.SUCCESS);

        await this.auditLogger.log({
          eventType: AuditEventType.PACS_TRANSFER_COMPLETED,
          traceId,
          hospitalId,
          destinationAeTitle: routingTarget.aeTitle,
          sopClassUid: request.command.sopClassUid,
          sopInstanceUid: streamResult.anonymizedSopInstanceUid,
          anonymizedPatientId: streamResult.anonymizedPatientId,
          studyInstanceUid: streamResult.studyInstanceUid,
          seriesInstanceUid: streamResult.seriesInstanceUid,
          routingTargetId: routingTarget.id,
          durationMs: transferResult.durationMs,
          status: 'success',
          additionalData: {
            totalDurationMs: totalDuration,
            dicomStatus: transferResult.status,
            processingMode: 'streaming-end-to-end',
            pixelDataBytes: streamResult.pixelDataBytesProcessed,
          },
        });

        this.logger.log(
          `[${traceId}] End-to-end streaming pipeline completed successfully. ` +
            `Total duration: ${totalDuration}ms, ` +
            `Pixel data: ${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
            `Tags modified: ${streamResult.modifiedTags.length}, ` +
            `Tags removed: ${streamResult.removedTags.length}`,
        );
      } else {
        respondWithStatus(transferResult.status);

        await this.auditLogger.log({
          eventType: AuditEventType.PACS_TRANSFER_FAILED,
          traceId,
          hospitalId,
          destinationAeTitle: routingTarget.aeTitle,
          sopClassUid: request.command.sopClassUid,
          sopInstanceUid: streamResult.anonymizedSopInstanceUid,
          routingTargetId: routingTarget.id,
          durationMs: transferResult.durationMs,
          status: 'failed',
          errorMessage: `PACS C-STORE failed with status: 0x${transferResult.status.toString(16)}`,
          additionalData: {
            totalDurationMs: totalDuration,
            processingMode: 'streaming-end-to-end',
          },
        });

        this.logger.error(
          `[${traceId}] PACS transfer failed after ${totalDuration}ms. ` +
            `Status: 0x${transferResult.status.toString(16)}`,
        );
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      respondWithStatus(DimseStatus.PROCESSING_FAILURE);

      this.logger.error(
        `[${traceId}] Streaming processing pipeline failed after ${totalDuration}ms: ${error.message}`,
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
          processingMode: 'streaming-end-to-end',
        },
      });
    }
  }

  private resolveHospitalId(callingAeTitle: string): string {
    if (callingAeTitle) {
      return callingAeTitle.trim().toLowerCase();
    }
    return 'default';
  }
}
