import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DicomScpServer } from '@protocol/dicom-scp-server.service';
import { CStoreStreamRequest, DimseStatus } from '@protocol/dicom-pdu.types';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { AnonymizationEngine } from '@anonymization/anonymization-engine.service';
import { StreamingAnonymizationEngine } from '@dicom/streaming-anonymization-engine.service';
import { DicomStreamParser } from '@dicom/dicom-stream-parser';
import { RedisRuleService } from '@redis/redis-rule.service';
import { RoutingEngine } from '@routing/routing-engine.service';
import { AuditLoggerService } from '@audit/audit-logger.service';
import { PatientStateService } from '@hl7/patient-state.service';
import { MllpServerService } from '@hl7/mllp-server.service';
import { AuditEventType, AnonymizationRule, TagRule } from '@common/types/anonymization.types';
import { v4 as uuidv4 } from 'uuid';
import { PatientState, Hl7Message } from '@common/types/hl7.types';
import { Readable, PassThrough, Transform } from 'stream';

class BufferedReplayStream extends Readable {
  private bufferIndex = 0;
  private sourceEnded = false;
  private sourceFlowing = false;

  constructor(
    private readonly preBuffer: Buffer[],
    private readonly source: Readable,
  ) {
    super();
  }

  _read(): void {
    if (this.bufferIndex < this.preBuffer.length) {
      const chunk = this.preBuffer[this.bufferIndex++];
      this.push(chunk);
      return;
    }

    if (this.sourceEnded) {
      this.push(null);
      return;
    }

    if (!this.sourceFlowing) {
      this.sourceFlowing = true;
      this.setupSourceListeners();
    }

    let chunk;
    while ((chunk = this.source.read()) !== null) {
      if (!this.push(chunk)) {
        return;
      }
    }
  }

  private setupSourceListeners(): void {
    this.source.on('end', () => {
      this.sourceEnded = true;
      if (this.bufferIndex >= this.preBuffer.length) {
        this.push(null);
      }
    });

    this.source.on('error', (error) => {
      this.destroy(error);
    });

    this.source.on('readable', () => {
      this._read();
    });
  }
}

@Injectable()
export class GatewayCoordinator implements OnModuleInit {
  private readonly logger = new Logger(GatewayCoordinator.name);
  private readonly MAX_PREBUFFER_SIZE = 64 * 1024 * 1024;

  constructor(
    private readonly dicomScpServer: DicomScpServer,
    private readonly dicomParser: DicomBinaryParser,
    private readonly anonymizationEngine: AnonymizationEngine,
    private readonly streamingAnonymizationEngine: StreamingAnonymizationEngine,
    private readonly redisRuleService: RedisRuleService,
    private readonly routingEngine: RoutingEngine,
    private readonly auditLogger: AuditLoggerService,
    private readonly patientStateService: PatientStateService,
    private readonly mllpServer: MllpServerService,
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

    this.logger.log('Gateway Coordinator initializing HL7 message subscription');
    this.mllpServer.messages$.subscribe({
      next: (message) => {
        this.handleHl7Message(message).catch((error) => {
          this.logger.error(`Unhandled error in HL7 message processing: ${error.message}`);
        });
      },
      error: (error) => {
        this.logger.error(`HL7 message stream error: ${error.message}`);
      },
    });

    const memInfo = this.streamingAnonymizationEngine.getMemoryUsageInfo();
    this.logger.log(
      `Streaming pipeline configured: maxTagValueInMemory=${memInfo.maxTagValueInMemory}, ` +
        `expectedMemoryPerStream=${memInfo.expectedMemoryPerStream}`,
    );

    this.logger.log(
      `MLLP server status: listening=${this.mllpServer.isListening()}, ` +
        `connections=${this.mllpServer.getConnectionCount()}`,
    );
  }

  private async handleHl7Message(message: Hl7Message): Promise<void> {
    const traceId = uuidv4();

    try {
      const patientState = await this.patientStateService.processHl7Message(message);

      this.logger.log(
        `[${traceId}] HL7 message processed: type=${message.messageTypeFull}, ` +
          `patientId=${message.pid.patientId}, ` +
          `status=${patientState.patientAccountStatus}, ` +
          `sensitivity=${patientState.sensitivityLevel}`,
      );

      await this.auditLogger.log({
        eventType: AuditEventType.ANONYMIZATION_STARTED,
        traceId,
        hospitalId: (message as any).hospitalId,
        patientId: message.pid.patientId,
        status: 'success',
        additionalData: {
          hl7MessageType: message.messageTypeFull,
          messageControlId: message.messageControlId,
          patientAccountStatus: patientState.patientAccountStatus,
          sensitivityLevel: patientState.sensitivityLevel,
          source: 'hl7_mllp',
        },
      });
    } catch (error) {
      this.logger.error(
        `[${traceId}] Failed to process HL7 message: ${error.message}`,
      );

      await this.auditLogger.log({
        eventType: AuditEventType.ERROR_OCCURRED,
        traceId,
        patientId: message.pid?.patientId,
        status: 'failed',
        errorMessage: error.message,
        errorStack: error.stack,
        additionalData: {
          hl7MessageType: message.messageTypeFull,
          source: 'hl7_mllp',
        },
      });
    }
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

      const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);

      const { outputStream, streamResultPromise, patientState, sensitivityLevel } =
        await this.createSmartAnonymizationStream(
          request.dataSetStream,
          anonymizationRule,
          hospitalId,
          request.association.callingAeTitle,
          traceId,
        );

      const streamResult = await streamResultPromise;

      this.logger.debug(
        `[${traceId}] Stream metadata ready: modified=${streamResult.modifiedTags.length}, ` +
          `removed=${streamResult.removedTags.length}, ` +
          `pixelData=${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
          `sensitivity=${sensitivityLevel}`,
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
          patientSensitivityLevel: sensitivityLevel,
          patientAccountStatus: patientState?.patientAccountStatus,
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
        outputStream,
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
            patientSensitivityLevel: sensitivityLevel,
          },
        });

        this.logger.log(
          `[${traceId}] End-to-end streaming pipeline completed successfully. ` +
            `Total duration: ${totalDuration}ms, ` +
            `Pixel data: ${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
            `Tags modified: ${streamResult.modifiedTags.length}, ` +
            `Tags removed: ${streamResult.removedTags.length}, ` +
            `Sensitivity: ${sensitivityLevel}`,
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
            patientSensitivityLevel: sensitivityLevel,
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

  private createSmartAnonymizationStream(
    sourceStream: Readable,
    baseRule: AnonymizationRule,
    hospitalId: string,
    sourceAeTitle: string,
    traceId: string,
  ): Promise<{
    outputStream: Readable;
    streamResultPromise: Promise<any>;
    patientState: PatientState | null;
    sensitivityLevel: string;
  }> {
    return new Promise((resolve, reject) => {
      const preBuffer: Buffer[] = [];
      let preBufferSize = 0;
      let patientId: string | null = null;
      let metadataReady = false;
      let errorOccurred = false;

      const preParser = new DicomStreamParser();

      preParser.on('tag', (event) => {
        if (event.group === 0x0010 && event.element === 0x0020 && event.value) {
          patientId = String(event.value).trim().replace(/\0/g, '');
          this.logger.debug(`[${traceId}] Found patient ID in stream: ${patientId}`);
        }
      });

      const finalize = async () => {
        if (metadataReady || errorOccurred) return;
        metadataReady = true;

        try {
          const result = await this.setupEnhancedStream(
            preBuffer,
            sourceStream,
            baseRule,
            hospitalId,
            sourceAeTitle,
            traceId,
            patientId,
          );
          resolve(result);
        } catch (error) {
          errorOccurred = true;
          reject(error);
        }
      };

      preParser.on('pixelDataStart', () => {
        this.logger.debug(`[${traceId}] Pixel data start detected, switching to enhanced stream`);
        finalize();
      });

      preParser.on('parseComplete', () => {
        this.logger.debug(`[${traceId}] Parse complete (no pixel data), finalizing stream`);
        finalize();
      });

      preParser.on('error', (error) => {
        if (!errorOccurred) {
          errorOccurred = true;
          this.logger.error(`[${traceId}] Pre-parser error: ${error.message}`);
          reject(error);
        }
      });

      sourceStream.on('readable', () => {
        if (metadataReady || errorOccurred) return;

        let chunk;
        while ((chunk = sourceStream.read()) !== null) {
          if (metadataReady || errorOccurred) {
            sourceStream.unshift(chunk);
            break;
          }

          preBuffer.push(chunk);
          preBufferSize += chunk.length;

          try {
            preParser.write(chunk);
          } catch (error) {
            if (!errorOccurred) {
              errorOccurred = true;
              reject(error);
            }
            return;
          }

          if (preBufferSize > this.MAX_PREBUFFER_SIZE) {
            this.logger.warn(
              `[${traceId}] Pre-buffer exceeded max size (${this.MAX_PREBUFFER_SIZE} bytes), ` +
                `falling back to base rules`,
            );
            finalize();
            break;
          }
        }
      });

      sourceStream.on('end', () => {
        if (!metadataReady && !errorOccurred) {
          preParser.end();
          finalize();
        }
      });

      sourceStream.on('error', (error) => {
        if (!errorOccurred) {
          errorOccurred = true;
          reject(error);
        }
      });
    });
  }

  private async setupEnhancedStream(
    preBuffer: Buffer[],
    sourceStream: Readable,
    baseRule: AnonymizationRule,
    hospitalId: string,
    sourceAeTitle: string,
    traceId: string,
    patientId: string | null,
  ): Promise<{
    outputStream: Readable;
    streamResultPromise: Promise<any>;
    patientState: PatientState | null;
    sensitivityLevel: string;
  }> {
    let patientState: PatientState | null = null;
    let sensitivityLevel = 'normal';

    if (patientId) {
      patientState = await this.patientStateService.getPatientState(patientId, hospitalId);
      if (patientState) {
        sensitivityLevel = patientState.sensitivityLevel || 'normal';
        this.logger.debug(
          `[${traceId}] Patient state loaded: sensitivity=${sensitivityLevel}, ` +
            `status=${patientState.patientAccountStatus}`,
        );
      } else {
        this.logger.debug(
          `[${traceId}] No patient state found for ${patientId}, using base rules`,
        );
      }
    }

    const {
      stream: anonymizationStream,
      resultPromise: streamResultPromise,
    } = this.streamingAnonymizationEngine.createAnonymizationStream(
      baseRule,
      hospitalId,
      sourceAeTitle,
      patientState,
    );

    const replayStream = new BufferedReplayStream(preBuffer, sourceStream);
    replayStream.pipe(anonymizationStream);

    return {
      outputStream: anonymizationStream,
      streamResultPromise,
      patientState,
      sensitivityLevel,
    };
  }

  private resolveHospitalId(callingAeTitle: string): string {
    if (callingAeTitle) {
      return callingAeTitle.trim().toLowerCase();
    }
    return 'default';
  }
}
