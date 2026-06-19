import { Injectable, Logger, Inject } from '@nestjs/common';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { AnonymizationRule, ProcessingResult, TagRule } from '@common/types/anonymization.types';
import { DicomAnonymizationStream, AnonymizationStreamResult } from './dicom-anonymization-stream';
import { DicomStreamParser } from './dicom-stream-parser';
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

@Injectable()
export class StreamingAnonymizationEngine {
  private readonly logger = new Logger(StreamingAnonymizationEngine.name);

  constructor(
    private readonly ruleEnhancer: AnonymizationRuleEnhancer,
  ) {}

  public createAnonymizationStream(
    rule: AnonymizationRule,
    hospitalId: string,
    sourceAeTitle: string,
    patientState?: PatientState | null,
  ): {
    stream: DicomAnonymizationStream;
    resultPromise: Promise<AnonymizationStreamResult>;
    traceId: string;
    effectiveTagRules: TagRule[];
  } {
    const traceId = uuidv4();

    const effectiveTagRules = patientState
      ? this.ruleEnhancer.enhanceRuleForPatient(rule, patientState)
      : rule.tagRules;

    this.logger.log(
      `[${traceId}] Creating streaming anonymization pipeline for hospital ${hospitalId}, source AE: ${sourceAeTitle}, ` +
        `patient sensitivity: ${patientState?.sensitivityLevel || 'normal'}, ` +
        `effective rules: ${effectiveTagRules.length}`,
    );

    const stream = new DicomAnonymizationStream(effectiveTagRules, {
      traceId,
      hospitalId,
    });

    const resultPromise = new Promise<AnonymizationStreamResult>((resolve, reject) => {
      let resolved = false;

      stream.on('result', (result: AnonymizationStreamResult) => {
        if (!resolved) {
          resolved = true;
          this.logger.debug(
            `[${traceId}] Anonymization metadata ready: ` +
              `modified=${result.modifiedTags.length}, ` +
              `removed=${result.removedTags.length}, ` +
              `pixelData=${(result.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB`,
          );
          resolve(result);
        }
      });

      stream.on('end', () => {
        if (!resolved) {
          this.logger.warn(`[${traceId}] Stream ended without result event`);
          resolve({
            originalSopInstanceUid: '',
            anonymizedSopInstanceUid: '',
            originalPatientId: '',
            anonymizedPatientId: '',
            originalPatientName: '',
            studyInstanceUid: '',
            seriesInstanceUid: '',
            sopClassUid: '',
            modality: '',
            modifiedTags: [],
            removedTags: [],
            pixelDataBytesProcessed: 0,
            totalTagsProcessed: 0,
          });
        }
      });

      stream.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          this.logger.error(`[${traceId}] Anonymization stream error: ${error.message}`);
          reject(error);
        }
      });
    });

    return {
      stream,
      resultPromise,
      traceId,
      effectiveTagRules,
    };
  }

  public async processBuffer(
    buffer: Buffer,
    rule: AnonymizationRule,
    hospitalId: string,
    sourceAeTitle: string,
    patientState?: PatientState | null,
  ): Promise<ProcessingResult> {
    const { stream, resultPromise, traceId } = this.createAnonymizationStream(
      rule,
      hospitalId,
      sourceAeTitle,
      patientState,
    );

    const startTime = Date.now();

    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    return new Promise<ProcessingResult>((resolve, reject) => {
      stream.on('end', async () => {
        try {
          const metadata = await resultPromise;
          const durationMs = Date.now() - startTime;
          const anonymizedBuffer = Buffer.concat(chunks);

          this.logger.log(
            `[${traceId}] Buffer anonymization completed: ` +
              `${(anonymizedBuffer.length / 1024 / 1024).toFixed(2)}MB, ` +
              `duration=${durationMs}ms`,
          );

          resolve({
            traceId,
            hospitalId,
            originalSopInstanceUid: metadata.originalSopInstanceUid,
            anonymizedSopInstanceUid: metadata.anonymizedSopInstanceUid,
            anonymizedBuffer,
            routingTarget: null as any,
            modifiedTags: metadata.modifiedTags,
            removedTags: metadata.removedTags,
            processingDurationMs: durationMs,
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', (error) => {
        reject(error);
      });

      stream.write(buffer);
      stream.end();
    });
  }

  public parseMetadataOnly(buffer: Buffer): Promise<Map<string, DicomTag>> {
    return new Promise((resolve, reject) => {
      const parser = new DicomStreamParser();
      const tags = new Map<string, DicomTag>();

      parser.on('tag', (event) => {
        if (event.value !== null) {
          tags.set(event.tagKey, {
            group: event.group,
            element: event.element,
            vr: event.vr,
            value: event.value,
            length: event.length,
            keyword: event.keyword,
          });
        }
      });

      parser.on('pixelDataStart', () => {
        parser.end();
      });

      parser.on('parseComplete', () => {
        resolve(tags);
      });

      parser.on('error', (error) => {
        reject(error);
      });

      parser.end(buffer);
    });
  }

  public getMemoryUsageInfo(): {
    maxTagValueInMemory: string;
    streamHighWaterMark: string;
    expectedMemoryPerStream: string;
  } {
    return {
      maxTagValueInMemory: '64 MB',
      streamHighWaterMark: '256 KB',
      expectedMemoryPerStream: '< 10 MB (metadata only, PixelData passthrough)',
    };
  }
}
