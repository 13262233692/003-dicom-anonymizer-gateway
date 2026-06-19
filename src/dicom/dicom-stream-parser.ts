import { Transform, TransformCallback } from 'stream';
import { DicomTag, DicomTagVR, formatTagKey } from '@common/types/dicom.types';
import { lookupTagDictionary } from './dicom-tag-dictionary';

export enum DicomStreamState {
  WAITING_PREAMBLE = 'waiting_preamble',
  PARSING_FILE_META = 'parsing_file_meta',
  PARSING_DATASET = 'parsing_dataset',
  PARSING_TAG_HEADER = 'parsing_tag_header',
  READING_TAG_VALUE = 'reading_tag_value',
  STREAMING_PIXEL_DATA = 'streaming_pixel_data',
  COMPLETE = 'complete',
}

export interface StreamTagEvent {
  tagKey: string;
  group: number;
  element: number;
  vr: DicomTagVR;
  value: any;
  length: number;
  keyword?: string;
}

export interface StreamPixelDataEvent {
  chunk: Buffer;
  isEnd: boolean;
  totalBytesStreamed: number;
}

export class DicomStreamParser extends Transform {
  private state: DicomStreamState = DicomStreamState.WAITING_PREAMBLE;
  private internalBuffer: Buffer = Buffer.alloc(0);
  private littleEndian: boolean = true;
  private explicitVR: boolean = true;

  private readonly PREAMBLE_LENGTH = 128;
  private readonly DICOM_MAGIC = 'DICM';

  private tags: Map<string, DicomTag> = new Map();
  private currentTag: {
    group: number;
    element: number;
    vr: DicomTagVR;
    length: number;
    bytesRead: number;
  } | null = null;

  private pixelDataTotalLength: number = 0;
  private pixelDataBytesStreamed: number = 0;
  private pixelDataUndefinedLength: boolean = false;

  private transferSyntaxUid: string = '1.2.840.10008.1.2.1';
  private sopClassUid: string = '';
  private sopInstanceUid: string = '';
  private studyInstanceUid: string = '';
  private seriesInstanceUid: string = '';
  private patientId: string = '';
  private patientName: string = '';
  private modality: string = '';

  private tagHeadersAccumulated: number = 0;
  private readonly MAX_TAG_VALUE_IN_MEMORY = 64 * 1024 * 1024;

  constructor() {
    super({
      readableObjectMode: false,
      writableObjectMode: false,
      highWaterMark: 64 * 1024,
    });
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
      if (this.state === DicomStreamState.STREAMING_PIXEL_DATA && this.pixelDataUndefinedLength) {
        this.emit('pixelDataEnd', {
          totalBytesStreamed: this.pixelDataBytesStreamed,
        });
      }
      this.state = DicomStreamState.COMPLETE;
      this.emit('parseComplete', {
        tagsCount: this.tags.size,
        sopClassUid: this.sopClassUid,
        sopInstanceUid: this.sopInstanceUid,
        transferSyntaxUid: this.transferSyntaxUid,
        pixelDataBytesStreamed: this.pixelDataBytesStreamed,
      });
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  private processBuffer(): void {
    let continueProcessing = true;

    while (continueProcessing) {
      switch (this.state) {
        case DicomStreamState.WAITING_PREAMBLE:
          continueProcessing = this.tryParsePreamble();
          break;

        case DicomStreamState.PARSING_FILE_META:
        case DicomStreamState.PARSING_DATASET:
        case DicomStreamState.PARSING_TAG_HEADER:
          continueProcessing = this.tryParseTagHeader();
          break;

        case DicomStreamState.READING_TAG_VALUE:
          continueProcessing = this.tryReadTagValue();
          break;

        case DicomStreamState.STREAMING_PIXEL_DATA:
          continueProcessing = this.tryStreamPixelData();
          break;

        case DicomStreamState.COMPLETE:
          continueProcessing = false;
          break;

        default:
          continueProcessing = false;
      }
    }
  }

  private tryParsePreamble(): boolean {
    if (this.internalBuffer.length < this.PREAMBLE_LENGTH + 4) {
      return false;
    }

    const magic = this.internalBuffer.toString(
      'ascii',
      this.PREAMBLE_LENGTH,
      this.PREAMBLE_LENGTH + 4,
    );

    this.push(this.internalBuffer.subarray(0, this.PREAMBLE_LENGTH + 4));

    this.internalBuffer = Buffer.from(
      this.internalBuffer.subarray(this.PREAMBLE_LENGTH + 4),
    );

    if (magic === this.DICOM_MAGIC) {
      this.state = DicomStreamState.PARSING_FILE_META;
    } else {
      this.state = DicomStreamState.PARSING_DATASET;
    }

    return this.internalBuffer.length > 0;
  }

  private tryParseTagHeader(): boolean {
    const headerSize = this.explicitVR ? 8 : 8;

    if (this.internalBuffer.length < headerSize) {
      this.state = this.currentStateToHeaderState();
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
          this.state = this.currentStateToHeaderState();
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
    const isPixelData = group === 0x7fe0 && element === 0x0010;
    const isLargeValue = length > this.MAX_TAG_VALUE_IN_MEMORY;
    const isUndefinedLength = length === 0xFFFFFFFF;

    if (isPixelData || (isLargeValue && this.isPixelLikeVR(vr))) {
      this.currentTag = { group, element, vr, length, bytesRead: 0 };
      this.pixelDataTotalLength = isUndefinedLength ? 0 : length;
      this.pixelDataBytesStreamed = 0;
      this.pixelDataUndefinedLength = isUndefinedLength;

      const headerChunk = Buffer.from(this.internalBuffer.subarray(0, headerBytes));
      this.push(headerChunk);
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));

      const dictEntry = lookupTagDictionary(group, element);
      const tag: DicomTag = {
        group,
        element,
        vr,
        value: null,
        length,
        keyword: dictEntry?.keyword,
      };
      this.tags.set(tagKey, tag);

      this.emit('tag', {
        tagKey,
        group,
        element,
        vr,
        value: null,
        length,
        keyword: dictEntry?.keyword,
      } as StreamTagEvent);

      this.emit('pixelDataStart', {
        tagKey,
        vr,
        totalLength: isUndefinedLength ? undefined : length,
        undefinedLength: isUndefinedLength,
      });

      this.state = DicomStreamState.STREAMING_PIXEL_DATA;
      return this.internalBuffer.length > 0;
    }

    this.currentTag = { group, element, vr, length, bytesRead: 0 };
    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
    this.state = DicomStreamState.READING_TAG_VALUE;

    return true;
  }

  private handleDelimiter(group: number, element: number): boolean {
    const length = this.littleEndian
      ? this.internalBuffer.readUInt32LE(4)
      : this.internalBuffer.readUInt32BE(4);

    if (group === 0xFFFE && element === 0xE0DD) {
      if (this.state === DicomStreamState.STREAMING_PIXEL_DATA) {
        this.emit('pixelDataEnd', {
          totalBytesStreamed: this.pixelDataBytesStreamed,
        });
        this.state = DicomStreamState.PARSING_DATASET;
        this.currentTag = null;
      }
      this.push(this.internalBuffer.subarray(0, 8));
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
      return this.internalBuffer.length > 0;
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

  private tryReadTagValue(): boolean {
    if (!this.currentTag) {
      this.state = DicomStreamState.PARSING_DATASET;
      return true;
    }

    const { length, group, element, vr } = this.currentTag;

    if (length === 0) {
      this.finalizeTag(group, element, vr, Buffer.alloc(0));
      this.currentTag = null;
      this.state = DicomStreamState.PARSING_DATASET;
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

    this.finalizeTag(group, element, vr, valueBuffer);
    this.currentTag = null;
    this.state = DicomStreamState.PARSING_DATASET;

    return this.internalBuffer.length > 0;
  }

  private finalizeTag(group: number, element: number, vr: DicomTagVR, valueBuffer: Buffer): void {
    const tagKey = formatTagKey(group, element);
    const value = this.decodeValue(vr, valueBuffer, this.littleEndian);
    const dictEntry = lookupTagDictionary(group, element);

    const tag: DicomTag = {
      group,
      element,
      vr,
      value,
      length: valueBuffer.length,
      keyword: dictEntry?.keyword,
    };

    this.tags.set(tagKey, tag);

    if (group === 0x0002 && element === 0x0010) {
      this.transferSyntaxUid = this.extractTransferSyntax(value);
      this.updateTransferSyntax(this.transferSyntaxUid);
    }

    if (group === 0x0008 && element === 0x0016) {
      this.sopClassUid = this.cleanStringValue(value);
    }
    if (group === 0x0008 && element === 0x0018) {
      this.sopInstanceUid = this.cleanStringValue(value);
    }
    if (group === 0x0020 && element === 0x000d) {
      this.studyInstanceUid = this.cleanStringValue(value);
    }
    if (group === 0x0020 && element === 0x000e) {
      this.seriesInstanceUid = this.cleanStringValue(value);
    }
    if (group === 0x0010 && element === 0x0020) {
      this.patientId = this.cleanStringValue(value);
    }
    if (group === 0x0010 && element === 0x0010) {
      this.patientName = this.cleanStringValue(value);
    }
    if (group === 0x0008 && element === 0x0060) {
      this.modality = this.cleanStringValue(value);
    }

    this.emit('tag', {
      tagKey,
      group,
      element,
      vr,
      value,
      length: valueBuffer.length,
      keyword: dictEntry?.keyword,
    } as StreamTagEvent);
  }

  private tryStreamPixelData(): boolean {
    if (this.internalBuffer.length === 0) {
      return false;
    }

    let chunkToStream: Buffer;

    if (this.pixelDataUndefinedLength) {
      chunkToStream = Buffer.from(this.internalBuffer);
      this.internalBuffer = Buffer.alloc(0);
    } else {
      const remaining = this.pixelDataTotalLength - this.pixelDataBytesStreamed;
      const toRead = Math.min(remaining, this.internalBuffer.length);
      chunkToStream = Buffer.from(this.internalBuffer.subarray(0, toRead));
      this.internalBuffer = Buffer.from(this.internalBuffer.subarray(toRead));
    }

    this.pixelDataBytesStreamed += chunkToStream.length;
    this.push(chunkToStream);

    this.emit('pixelDataChunk', {
      chunk: chunkToStream,
      isEnd: false,
      totalBytesStreamed: this.pixelDataBytesStreamed,
    } as StreamPixelDataEvent);

    if (!this.pixelDataUndefinedLength && this.pixelDataBytesStreamed >= this.pixelDataTotalLength) {
      this.emit('pixelDataEnd', {
        totalBytesStreamed: this.pixelDataBytesStreamed,
      });

      const paddedLength =
        this.pixelDataTotalLength % 2 !== 0 ? this.pixelDataTotalLength + 1 : this.pixelDataTotalLength;
      if (paddedLength > this.pixelDataTotalLength && this.internalBuffer.length > 0) {
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
      }

      this.currentTag = null;
      this.state = DicomStreamState.PARSING_DATASET;
    }

    return this.internalBuffer.length > 0;
  }

  private currentStateToHeaderState(): DicomStreamState {
    if (this.state === DicomStreamState.PARSING_FILE_META) {
      return DicomStreamState.PARSING_FILE_META;
    }
    return DicomStreamState.PARSING_TAG_HEADER;
  }

  private decodeValue(vr: DicomTagVR, data: Buffer, littleEndian: boolean): any {
    if (data.length === 0) {
      return vr === DicomTagVR.OB || vr === DicomTagVR.OW ? Buffer.alloc(0) : '';
    }

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
        return data.toString('utf8').trim();

      case DicomTagVR.OB:
      case DicomTagVR.OF:
      case DicomTagVR.OW:
      case DicomTagVR.OD:
      case DicomTagVR.OL:
      case DicomTagVR.OV:
      case DicomTagVR.UN:
      case DicomTagVR.SQ:
        return Buffer.from(data);

      case DicomTagVR.US: {
        const result: number[] = [];
        for (let i = 0; i + 2 <= data.length; i += 2) {
          result.push(littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      case DicomTagVR.SS: {
        const result: number[] = [];
        for (let i = 0; i + 2 <= data.length; i += 2) {
          result.push(littleEndian ? data.readInt16LE(i) : data.readInt16BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      case DicomTagVR.UL: {
        const result: number[] = [];
        for (let i = 0; i + 4 <= data.length; i += 4) {
          result.push(littleEndian ? data.readUInt32LE(i) : data.readUInt32BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      case DicomTagVR.SL: {
        const result: number[] = [];
        for (let i = 0; i + 4 <= data.length; i += 4) {
          result.push(littleEndian ? data.readInt32LE(i) : data.readInt32BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      case DicomTagVR.FL: {
        const result: number[] = [];
        for (let i = 0; i + 4 <= data.length; i += 4) {
          result.push(littleEndian ? data.readFloatLE(i) : data.readFloatBE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      case DicomTagVR.FD: {
        const result: number[] = [];
        for (let i = 0; i + 8 <= data.length; i += 8) {
          result.push(littleEndian ? data.readDoubleLE(i) : data.readDoubleBE(i));
        }
        return result.length === 1 ? result[0] : result;
      }
      default:
        return data;
    }
  }

  private validateVR(vrStr: string): DicomTagVR {
    if (Object.values(DicomTagVR).includes(vrStr as DicomTagVR)) {
      return vrStr as DicomTagVR;
    }
    return DicomTagVR.UN;
  }

  private isLongVr(vr: DicomTagVR): boolean {
    const longVRs = [
      DicomTagVR.OB, DicomTagVR.OD, DicomTagVR.OF, DicomTagVR.OL,
      DicomTagVR.OV, DicomTagVR.OW, DicomTagVR.SQ, DicomTagVR.UC,
      DicomTagVR.UR, DicomTagVR.UT, DicomTagVR.UN,
    ];
    return longVRs.includes(vr);
  }

  private isPixelLikeVR(vr: DicomTagVR): boolean {
    return [
      DicomTagVR.OB, DicomTagVR.OW, DicomTagVR.OF,
      DicomTagVR.OD, DicomTagVR.OL, DicomTagVR.OV,
      DicomTagVR.SQ, DicomTagVR.UN,
    ].includes(vr);
  }

  private extractTransferSyntax(value: any): string {
    if (typeof value === 'string') {
      return value.trim().replace(/\0/g, '');
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('ascii').trim().replace(/\0/g, '');
    }
    return '1.2.840.10008.1.2.1';
  }

  private cleanStringValue(value: any): string {
    if (typeof value === 'string') {
      return value.trim().replace(/\0/g, '');
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('utf8').trim().replace(/\0/g, '');
    }
    return String(value || '');
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

  public getTags(): Map<string, DicomTag> {
    return this.tags;
  }

  public getTransferSyntaxUid(): string {
    return this.transferSyntaxUid;
  }

  public getSopClassUid(): string {
    return this.sopClassUid;
  }

  public getSopInstanceUid(): string {
    return this.sopInstanceUid;
  }

  public getStudyInstanceUid(): string {
    return this.studyInstanceUid;
  }

  public getSeriesInstanceUid(): string {
    return this.seriesInstanceUid;
  }

  public getPatientId(): string {
    return this.patientId;
  }

  public getPatientName(): string {
    return this.patientName;
  }

  public getModality(): string {
    return this.modality;
  }

  public getPixelDataBytesStreamed(): number {
    return this.pixelDataBytesStreamed;
  }

  public getState(): DicomStreamState {
    return this.state;
  }
}
