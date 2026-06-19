import { Transform, TransformCallback } from 'stream';
import { createHash } from 'crypto';
import { DicomTagVR, formatTagKey, parseTagKey } from '@common/types/dicom.types';
import { TagRule, AnonymizationActionType } from '@common/types/anonymization.types';
import { lookupTagDictionary } from './dicom-tag-dictionary';

enum AnonymizationStreamState {
  WAITING_PREAMBLE = 'waiting_preamble',
  PARSING_TAG_HEADER = 'parsing_tag_header',
  READING_TAG_VALUE = 'reading_tag_value',
  STREAMING_PIXEL_DATA = 'streaming_pixel_data',
  COMPLETE = 'complete',
}

export interface AnonymizationStreamResult {
  originalSopInstanceUid: string;
  anonymizedSopInstanceUid: string;
  originalPatientId: string;
  anonymizedPatientId: string;
  originalPatientName: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopClassUid: string;
  modality: string;
  modifiedTags: string[];
  removedTags: string[];
  pixelDataBytesProcessed: number;
  totalTagsProcessed: number;
}

export class DicomAnonymizationStream extends Transform {
  private state: AnonymizationStreamState = AnonymizationStreamState.WAITING_PREAMBLE;
  private internalBuffer: Buffer = Buffer.alloc(0);
  private littleEndian: boolean = true;
  private explicitVR: boolean = true;

  private readonly PREAMBLE_LENGTH = 128;
  private readonly DICOM_MAGIC = 'DICM';

  private tagRules: Map<string, TagRule> = new Map();
  private traceId: string;
  private hospitalId: string;

  private currentTag: {
    group: number;
    element: number;
    vr: DicomTagVR;
    length: number;
    bytesRead: number;
    skipValue: boolean;
  } | null = null;

  private pixelDataBytesProcessed: number = 0;
  private pixelDataUndefinedLength: boolean = false;

  private modifiedTags: string[] = [];
  private removedTags: string[] = [];
  private totalTagsProcessed: number = 0;

  private originalSopInstanceUid: string = '';
  private anonymizedSopInstanceUid: string = '';
  private originalPatientId: string = '';
  private anonymizedPatientId: string = '';
  private originalPatientName: string = '';
  private studyInstanceUid: string = '';
  private seriesInstanceUid: string = '';
  private sopClassUid: string = '';
  private modality: string = '';

  private dateShiftDays: number;
  private patientHashSalt: string;
  private uidSalt: string;

  private resultEmitted: boolean = false;

  constructor(
    rules: TagRule[],
    options: {
      traceId: string;
      hospitalId: string;
    },
  ) {
    super({
      readableObjectMode: false,
      writableObjectMode: false,
      highWaterMark: 256 * 1024,
    });

    for (const rule of rules) {
      this.tagRules.set(rule.tagKey, rule);
    }

    this.traceId = options.traceId;
    this.hospitalId = options.hospitalId;

    const dateHash = createHash('md5')
      .update(this.traceId + this.hospitalId + 'date_shift_salt')
      .digest('hex');
    this.dateShiftDays = -365 - (parseInt(dateHash.slice(0, 8), 16) % 365);

    this.patientHashSalt = 'dicom-anon-' + this.hospitalId;
    this.uidSalt = this.traceId + this.hospitalId;
  }

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    try {
      this.internalBuffer = Buffer.concat([this.internalBuffer, chunk]);
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      if (!this.resultEmitted) {
        this.emitResult();
      }
      this.state = AnonymizationStreamState.COMPLETE;
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  private processBuffer(): void {
    let continueProcessing = true;

    while (continueProcessing) {
      switch (this.state) {
        case AnonymizationStreamState.WAITING_PREAMBLE:
          continueProcessing = this.tryProcessPreamble();
          break;

        case AnonymizationStreamState.PARSING_TAG_HEADER:
          continueProcessing = this.tryParseTagHeader();
          break;

        case AnonymizationStreamState.READING_TAG_VALUE:
          continueProcessing = this.tryReadAndProcessTagValue();
          break;

        case AnonymizationStreamState.STREAMING_PIXEL_DATA:
          continueProcessing = this.tryStreamPixelData();
          break;

        case AnonymizationStreamState.COMPLETE:
          continueProcessing = false;
          break;

        default:
          continueProcessing = false;
      }
    }
  }

  private tryProcessPreamble(): boolean {
    if (this.internalBuffer.length < this.PREAMBLE_LENGTH + 4) {
      return false;
    }

    this.push(this.internalBuffer.subarray(0, this.PREAMBLE_LENGTH + 4));
    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(this.PREAMBLE_LENGTH + 4));

    this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
    return this.internalBuffer.length > 0;
  }

  private tryParseTagHeader(): boolean {
    if (this.internalBuffer.length < 8) {
      return false;
    }

    let group: number;
    let element: number;

    if (this.littleEndian) {
      group = this.internalBuffer.readUInt16LE(0);
      element = this.internalBuffer.readUInt16LE(2);
    } else {
      group = this.internalBuffer.readUInt16BE(0);
      element = this.internalBuffer.readUInt16BE(2);
    }

    if (group === 0xFFFE) {
      return this.handleDelimiter(group, element);
    }

    let vr: DicomTagVR;
    let length: number;
    let headerBytes: number;

    if (this.explicitVR) {
      const vrStr = this.internalBuffer.toString('ascii', 4, 6);
      vr = this.validateVR(vrStr);

      if (this.isLongVr(vr)) {
        if (this.internalBuffer.length < 12) {
          return false;
        }
        length = this.littleEndian
          ? this.internalBuffer.readUInt32LE(8)
          : this.internalBuffer.readUInt32BE(8);
        headerBytes = 12;
      } else {
        length = this.littleEndian
          ? this.internalBuffer.readUInt16LE(6)
          : this.internalBuffer.readUInt16BE(6);
        headerBytes = 8;
      }
    } else {
      const dictEntry = lookupTagDictionary(group, element);
      vr = dictEntry ? dictEntry.vr : DicomTagVR.UN;
      length = this.littleEndian
        ? this.internalBuffer.readUInt32LE(4)
        : this.internalBuffer.readUInt32BE(4);
      headerBytes = 8;
    }

    const tagKey = formatTagKey(group, element);
    const rule = this.tagRules.get(tagKey);
    const isPixelData = group === 0x7fe0 && element === 0x0010;

    if (group === 0x0002 && element === 0x0010) {
      if (length > 0 && this.internalBuffer.length >= headerBytes + length) {
        const tsValue = this.internalBuffer
          .subarray(headerBytes, headerBytes + length)
          .toString('ascii')
          .trim()
          .replace(/\0/g, '');
        this.updateTransferSyntax(tsValue);
      }
    }

    if (rule?.action === AnonymizationActionType.REMOVE && !isPixelData) {
      this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: true };
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
      this.removedTags.push(tagKey);
      this.totalTagsProcessed++;
      this.state = AnonymizationStreamState.READING_TAG_VALUE;
      return true;
    }

    if (isPixelData) {
      const headerChunk = Buffer.from(this.internalBuffer.subarray(0, headerBytes));
      this.push(headerChunk);
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));

      this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: false };
      this.pixelDataUndefinedLength = length === 0xFFFFFFFF;
      this.state = AnonymizationStreamState.STREAMING_PIXEL_DATA;

      this.totalTagsProcessed++;
      return this.internalBuffer.length > 0;
    }

    this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: false };
    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
    this.state = AnonymizationStreamState.READING_TAG_VALUE;

    return true;
  }

  private handleDelimiter(group: number, element: number): boolean {
    const length = this.littleEndian
      ? this.internalBuffer.readUInt32LE(4)
      : this.internalBuffer.readUInt32BE(4);

    if (group === 0xFFFE && element === 0xE0DD) {
      if (this.state === AnonymizationStreamState.STREAMING_PIXEL_DATA) {
        this.push(this.internalBuffer.subarray(0, 8));
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
        this.currentTag = null;
        this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
        return this.internalBuffer.length > 0;
      }
    }

    if (length === 0xFFFFFFFF) {
      this.push(this.internalBuffer.subarray(0, 8));
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
      return this.internalBuffer.length > 0;
    }

    const totalSkip = 8 + length;
    if (this.internalBuffer.length < totalSkip) {
      return false;
    }

    this.push(this.internalBuffer.subarray(0, totalSkip));
    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(totalSkip));
    return this.internalBuffer.length > 0;
  }

  private tryReadAndProcessTagValue(): boolean {
    if (!this.currentTag) {
      this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
      return true;
    }

    const { group, element, vr, length, skipValue } = this.currentTag;

    if (length === 0xFFFFFFFF) {
      this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
      this.currentTag = null;
      return true;
    }

    if (length === 0) {
      if (!skipValue) {
        this.processAndEmitTag(group, element, vr, Buffer.alloc(0));
      }
      this.currentTag = null;
      this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
      return true;
    }

    if (this.internalBuffer.length < length) {
      return false;
    }

    const valueBuffer = Buffer.from(this.internalBuffer.subarray(0, length));
    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(length));

    const paddedLength = length % 2 !== 0 ? length + 1 : length;
    if (paddedLength > length && this.internalBuffer.length > 0) {
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
    }

    if (!skipValue) {
      this.processAndEmitTag(group, element, vr, valueBuffer);
    }

    this.currentTag = null;
    this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
    this.totalTagsProcessed++;

    return this.internalBuffer.length > 0;
  }

  private processAndEmitTag(group: number, element: number, vr: DicomTagVR, valueBuffer: Buffer): void {
    const tagKey = formatTagKey(group, element);
    const rule = this.tagRules.get(tagKey);

    let processedValueBuffer = valueBuffer;
    let valueChanged = false;

    if (group === 0x0008 && element === 0x0018) {
      this.originalSopInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
      this.anonymizedSopInstanceUid = this.generateDerivedUid(this.originalSopInstanceUid);
      processedValueBuffer = this.encodeStringValue(this.anonymizedSopInstanceUid);
      valueChanged = true;
      this.modifiedTags.push(tagKey);
    }

    if (group === 0x0002 && element === 0x0003) {
      const original = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
      const newUid = this.generateDerivedUid(original);
      processedValueBuffer = this.encodeStringValue(newUid);
      valueChanged = true;
      this.modifiedTags.push(tagKey);
    }

    if (group === 0x0020 && element === 0x000d) {
      this.studyInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
      const newUid = this.generateDerivedUid(this.studyInstanceUid);
      processedValueBuffer = this.encodeStringValue(newUid);
      valueChanged = true;
      this.modifiedTags.push(tagKey);
    }

    if (group === 0x0020 && element === 0x000e) {
      this.seriesInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
      const newUid = this.generateDerivedUid(this.seriesInstanceUid);
      processedValueBuffer = this.encodeStringValue(newUid);
      valueChanged = true;
      this.modifiedTags.push(tagKey);
    }

    if (group === 0x0008 && element === 0x0016) {
      this.sopClassUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
    }

    if (group === 0x0008 && element === 0x0060) {
      this.modality = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
    }

    if (group === 0x0010 && element === 0x0020) {
      this.originalPatientId = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
    }

    if (group === 0x0010 && element === 0x0010) {
      this.originalPatientName = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
    }

    if (rule && !valueChanged) {
      switch (rule.action) {
        case AnonymizationActionType.EMPTY:
          processedValueBuffer = Buffer.alloc(0);
          valueChanged = true;
          this.modifiedTags.push(tagKey);
          break;

        case AnonymizationActionType.REPLACE:
          if (rule.replacementValue !== undefined) {
            processedValueBuffer = this.encodeValueForVr(vr, String(rule.replacementValue));
            valueChanged = true;
            this.modifiedTags.push(tagKey);
          }
          break;

        case AnonymizationActionType.HASH: {
          const originalStr = valueBuffer.toString('utf8').trim().replace(/\0/g, '');
          if (originalStr) {
            const algorithm = rule.hashAlgorithm || 'sha256';
            const salt = rule.hashSalt || this.patientHashSalt;
            const hashed = this.hashString(originalStr, salt, algorithm);
            processedValueBuffer = this.encodeStringValue(hashed);
            valueChanged = true;
            this.modifiedTags.push(tagKey);

            if (group === 0x0010 && element === 0x0020) {
              this.anonymizedPatientId = hashed;
            }
          }
          break;
        }

        case AnonymizationActionType.MASK: {
          const originalStr = valueBuffer.toString('utf8').trim().replace(/\0/g, '');
          if (originalStr) {
            const masked = this.applyMask(originalStr, rule.maskPattern || '***');
            processedValueBuffer = this.encodeStringValue(masked);
            valueChanged = true;
            this.modifiedTags.push(tagKey);
          }
          break;
        }

        case AnonymizationActionType.SHIFT_DATE: {
          const originalStr = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
          if (/^\d{8}$/.test(originalStr)) {
            const shiftDays = rule.dateShiftDays ?? this.dateShiftDays;
            const shifted = this.shiftDate(originalStr, shiftDays);
            if (shifted) {
              processedValueBuffer = this.encodeStringValue(shifted);
              valueChanged = true;
              this.modifiedTags.push(tagKey);
            }
          }
          break;
        }

        case AnonymizationActionType.KEEP:
          break;

        default:
          break;
      }
    }

    this.emitTag(group, element, vr, processedValueBuffer, valueChanged);
  }

  private emitTag(group: number, element: number, vr: DicomTagVR, valueBuffer: Buffer, _valueChanged: boolean): void {
    const isLongVR = this.isLongVr(vr);

    let header: Buffer;
    if (this.explicitVR) {
      if (isLongVR) {
        header = Buffer.alloc(12);
        if (this.littleEndian) {
          header.writeUInt16LE(group, 0);
          header.writeUInt16LE(element, 2);
        } else {
          header.writeUInt16BE(group, 0);
          header.writeUInt16BE(element, 2);
        }
        header.write(vr, 4, 'ascii');
        if (this.littleEndian) {
          header.writeUInt32LE(valueBuffer.length, 8);
        } else {
          header.writeUInt32BE(valueBuffer.length, 8);
        }
      } else {
        header = Buffer.alloc(8);
        if (this.littleEndian) {
          header.writeUInt16LE(group, 0);
          header.writeUInt16LE(element, 2);
        } else {
          header.writeUInt16BE(group, 0);
          header.writeUInt16BE(element, 2);
        }
        header.write(vr, 4, 'ascii');
        if (this.littleEndian) {
          header.writeUInt16LE(valueBuffer.length, 6);
        } else {
          header.writeUInt16BE(valueBuffer.length, 6);
        }
      }
    } else {
      header = Buffer.alloc(8);
      if (this.littleEndian) {
        header.writeUInt16LE(group, 0);
        header.writeUInt16LE(element, 2);
        header.writeUInt32LE(valueBuffer.length, 4);
      } else {
        header.writeUInt16BE(group, 0);
        header.writeUInt16BE(element, 2);
        header.writeUInt32BE(valueBuffer.length, 4);
      }
    }

    this.push(header);
    this.push(valueBuffer);

    if (valueBuffer.length % 2 !== 0) {
      this.push(Buffer.from([0]));
    }
  }

  private tryStreamPixelData(): boolean {
    if (this.internalBuffer.length === 0) {
      return false;
    }

    if (!this.currentTag) {
      this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
      return true;
    }

    let chunkToStream: Buffer;

    if (this.pixelDataUndefinedLength) {
      chunkToStream = Buffer.from(this.internalBuffer);
      this.internalBuffer = Buffer.alloc(0);
      this.pixelDataBytesProcessed += chunkToStream.length;
      this.push(chunkToStream);
      return false;
    } else {
      const remaining = this.currentTag.length - this.pixelDataBytesProcessed;
      const toRead = Math.min(remaining, this.internalBuffer.length);
      chunkToStream = Buffer.from(this.internalBuffer.subarray(0, toRead));
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(toRead));
      this.pixelDataBytesProcessed += toRead;
      this.push(chunkToStream);

      if (this.pixelDataBytesProcessed >= this.currentTag.length) {
        if (this.currentTag.length % 2 !== 0 && this.internalBuffer.length > 0) {
          this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
        }
        this.currentTag = null;
        this.state = AnonymizationStreamState.PARSING_TAG_HEADER;

        if (!this.resultEmitted) {
          this.emitResult();
        }
      }
    }

    return this.internalBuffer.length > 0;
  }

  private emitResult(): void {
    this.resultEmitted = true;

    const result: AnonymizationStreamResult = {
      originalSopInstanceUid: this.originalSopInstanceUid,
      anonymizedSopInstanceUid: this.anonymizedSopInstanceUid,
      originalPatientId: this.originalPatientId,
      anonymizedPatientId: this.anonymizedPatientId,
      originalPatientName: this.originalPatientName,
      studyInstanceUid: this.generateDerivedUid(this.studyInstanceUid) || this.studyInstanceUid,
      seriesInstanceUid: this.generateDerivedUid(this.seriesInstanceUid) || this.seriesInstanceUid,
      sopClassUid: this.sopClassUid,
      modality: this.modality,
      modifiedTags: [...this.modifiedTags],
      removedTags: [...this.removedTags],
      pixelDataBytesProcessed: this.pixelDataBytesProcessed,
      totalTagsProcessed: this.totalTagsProcessed,
    };

    this.emit('result', result);
  }

  private validateVR(vrStr: string): DicomTagVR {
    if (Object.values(DicomTagVR).includes(vrStr as DicomTagVR)) {
      return vrStr as DicomTagVR;
    }
    return DicomTagVR.UN;
  }

  private isLongVr(vr: DicomTagVR): boolean {
    return [
      DicomTagVR.OB, DicomTagVR.OD, DicomTagVR.OF, DicomTagVR.OL,
      DicomTagVR.OV, DicomTagVR.OW, DicomTagVR.SQ, DicomTagVR.UC,
      DicomTagVR.UR, DicomTagVR.UT, DicomTagVR.UN,
    ].includes(vr);
  }

  private encodeStringValue(str: string): Buffer {
    let result = str;
    if (result.length % 2 !== 0) {
      result += ' ';
    }
    return Buffer.from(result, 'ascii');
  }

  private encodeValueForVr(vr: DicomTagVR, value: string): Buffer {
    switch (vr) {
      case DicomTagVR.AE:
      case DicomTagVR.AS:
      case DicomTagVR.CS:
      case DicomTagVR.DA:
      case DicomTagVR.DS:
      case DicomTagVR.DT:
      case DicomTagVR.IS:
      case DicomTagVR.LO:
      case DicomTagVR.LT:
      case DicomTagVR.PN:
      case DicomTagVR.SH:
      case DicomTagVR.ST:
      case DicomTagVR.TM:
      case DicomTagVR.UC:
      case DicomTagVR.UI:
      case DicomTagVR.UR:
      case DicomTagVR.UT:
        return this.encodeStringValue(value);
      default:
        return this.encodeStringValue(value);
    }
  }

  private hashString(input: string, salt: string, algorithm: string): string {
    const hash = createHash(algorithm);
    hash.update(salt + input);
    return hash.digest('hex').slice(0, 16).toUpperCase();
  }

  private applyMask(original: string, pattern: string): string {
    if (pattern === 'first_char') {
      return original.charAt(0) + '*'.repeat(Math.max(0, original.length - 1));
    } else if (pattern === 'last_four') {
      return '*'.repeat(Math.max(0, original.length - 4)) + original.slice(-4);
    } else if (pattern === 'id_card') {
      if (original.length >= 15) {
        return original.slice(0, 6) + '********' + original.slice(-4);
      }
      return '*'.repeat(original.length);
    }
    return pattern.repeat(Math.ceil(original.length / pattern.length))
      .slice(0, original.length);
  }

  private shiftDate(dateStr: string, days: number): string | null {
    try {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10);
      const day = parseInt(dateStr.slice(6, 8), 10);

      if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

      const timestamp = Date.UTC(year, month - 1, day);
      const shifted = new Date(timestamp + days * 86400000);

      const y = shifted.getUTCFullYear();
      const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const d = String(shifted.getUTCDate()).padStart(2, '0');

      return `${y}${m}${d}`;
    } catch {
      return null;
    }
  }

  private generateDerivedUid(originalUid: string): string {
    if (!originalUid) return '';

    const hash = createHash('md5');
    hash.update(originalUid + this.uidSalt);
    const hex = hash.digest('hex');

    let decimal = BigInt(0);
    for (let i = 0; i < hex.length; i++) {
      decimal = decimal * 16n + BigInt(parseInt(hex[i], 16));
    }

    return '2.25.' + decimal.toString().slice(0, 50);
  }

  private updateTransferSyntax(transferSyntaxUid: string): void {
    if (
      transferSyntaxUid === '1.2.840.10008.1.2' ||
      transferSyntaxUid === '1.2.840.10008.1.2.1'
    ) {
      this.littleEndian = true;
      this.explicitVR = true;
    } else if (transferSyntaxUid === '1.2.840.10008.1.2.2') {
      this.littleEndian = false;
      this.explicitVR = true;
    } else if (transferSyntaxUid === '1.2.840.10008.1.2.99') {
      this.littleEndian = true;
      this.explicitVR = false;
    }
  }

  public getPixelDataBytesProcessed(): number {
    return this.pixelDataBytesProcessed;
  }
}
