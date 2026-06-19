import { Injectable, Logger } from '@nestjs/common';
import { DicomTag, DicomTagVR, ParsedDicomObject, formatTagKey } from '@common/types/dicom.types';
import { DicomParseException } from '@common/exceptions/custom.exceptions';
import { lookupTagDictionary } from './dicom-tag-dictionary';

interface ParseState {
  offset: number;
  buffer: Buffer;
  littleEndian: boolean;
  explicitVR: boolean;
}

@Injectable()
export class DicomBinaryParser {
  private readonly logger = new Logger(DicomBinaryParser.name);
  private readonly DICOM_MAGIC = 'DICM';
  private readonly PREAMBLE_LENGTH = 128;

  public parse(buffer: Buffer): ParsedDicomObject {
    if (!buffer || buffer.length < this.PREAMBLE_LENGTH + 4) {
      throw new DicomParseException('Buffer too small to contain valid DICOM data');
    }

    this.validateDicomPreamble(buffer);

    const state: ParseState = {
      offset: this.PREAMBLE_LENGTH + 4,
      buffer,
      littleEndian: true,
      explicitVR: true,
    };

    const tags = new Map<string, DicomTag>();
    let transferSyntaxUid = '1.2.840.10008.1.2.1';
    let sopClassUid = '';
    let sopInstanceUid = '';
    let pixelData: Buffer | undefined;

    try {
      while (state.offset < buffer.length) {
        const tag = this.parseNextTag(state);
        if (!tag) break;

        const tagKey = formatTagKey(tag.group, tag.element);
        tags.set(tagKey, tag);

        if (tag.group === 0x0002 && tag.element === 0x0010) {
          transferSyntaxUid = this.extractTransferSyntax(tag.value);
          this.updateTransferSyntax(state, transferSyntaxUid);
        }

        if (tag.group === 0x0008 && tag.element === 0x0016) {
          sopClassUid = this.cleanStringValue(tag.value);
        }

        if (tag.group === 0x0008 && tag.element === 0x0018) {
          sopInstanceUid = this.cleanStringValue(tag.value);
        }

        if (tag.group === 0x7fe0 && tag.element === 0x0010) {
          pixelData = tag.value;
        }
      }
    } catch (error) {
      this.logger.warn(`Partial parse completed at offset ${state.offset}/${buffer.length}: ${error.message}`);
    }

    if (!sopClassUid || !sopInstanceUid) {
      throw new DicomParseException('Missing required DICOM identifiers (SOPClassUID or SOPInstanceUID)');
    }

    this.logger.debug(`Parsed DICOM object: ${tags.size} tags, SOP=${sopInstanceUid}`);

    return {
      tags,
      pixelData,
      transferSyntaxUid,
      sopClassUid,
      sopInstanceUid,
      rawBuffer: buffer,
    };
  }

  private validateDicomPreamble(buffer: Buffer): void {
    const magicOffset = this.PREAMBLE_LENGTH;
    const magic = buffer.toString('ascii', magicOffset, magicOffset + 4);
    if (magic !== this.DICOM_MAGIC) {
      this.logger.warn('DICOM preamble magic not found, attempting raw parse');
    }
  }

  private parseNextTag(state: ParseState): DicomTag | null {
    if (state.offset + 8 > state.buffer.length) {
      return null;
    }

    let group: number;
    let element: number;

    if (state.littleEndian) {
      group = state.buffer.readUInt16LE(state.offset);
      element = state.buffer.readUInt16LE(state.offset + 2);
    } else {
      group = state.buffer.readUInt16BE(state.offset);
      element = state.buffer.readUInt16BE(state.offset + 2);
    }

    state.offset += 4;

    if (group === 0xFFFE && (element === 0xE000 || element === 0xE00D || element === 0xE0DD)) {
      const length = state.littleEndian
        ? state.buffer.readUInt32LE(state.offset)
        : state.buffer.readUInt32BE(state.offset);
      state.offset += 4;
      if (length === 0xFFFFFFFF) {
        return null;
      }
      state.offset += length;
      return null;
    }

    let vr: DicomTagVR;
    let length: number;

    if (state.explicitVR) {
      const vrStr = state.buffer.toString('ascii', state.offset, state.offset + 2);
      vr = this.validateVR(vrStr);
      state.offset += 2;

      if (this.isLongVr(vr)) {
        state.offset += 2;
        length = state.littleEndian
          ? state.buffer.readUInt32LE(state.offset)
          : state.buffer.readUInt32BE(state.offset);
        state.offset += 4;
      } else {
        length = state.littleEndian
          ? state.buffer.readUInt16LE(state.offset)
          : state.buffer.readUInt16BE(state.offset);
        state.offset += 2;
      }
    } else {
      const dictEntry = lookupTagDictionary(group, element);
      vr = dictEntry ? dictEntry.vr : DicomTagVR.UN;
      length = state.littleEndian
        ? state.buffer.readUInt32LE(state.offset)
        : state.buffer.readUInt32BE(state.offset);
      state.offset += 4;
    }

    const isUndefinedLength = length === 0xFFFFFFFF;
    let valueData: Buffer;

    if (isUndefinedLength) {
      const endOffset = this.findSequenceDelimiter(state, group, element);
      valueData = state.buffer.subarray(state.offset, endOffset);
      state.offset = endOffset + 8;
    } else {
      if (state.offset + length > state.buffer.length) {
        length = state.buffer.length - state.offset;
      }
      valueData = state.buffer.subarray(state.offset, state.offset + length);
      state.offset += length;
      if (length % 2 !== 0 && state.offset < state.buffer.length) {
        state.offset += 1;
      }
    }

    const dictEntry = lookupTagDictionary(group, element);
    const value = this.decodeValue(vr, valueData, state.littleEndian);

    return {
      group,
      element,
      vr,
      value,
      length,
      keyword: dictEntry?.keyword,
    };
  }

  private findSequenceDelimiter(state: ParseState, _group: number, _element: number): number {
    let searchOffset = state.offset;
    const delimiterGroup = 0xFFFE;
    const delimiterElement = 0xE0DD;

    while (searchOffset + 8 <= state.buffer.length) {
      const g = state.littleEndian
        ? state.buffer.readUInt16LE(searchOffset)
        : state.buffer.readUInt16BE(searchOffset);
      const e = state.littleEndian
        ? state.buffer.readUInt16LE(searchOffset + 2)
        : state.buffer.readUInt16BE(searchOffset + 2);

      if (g === delimiterGroup && e === delimiterElement) {
        return searchOffset;
      }
      searchOffset += 2;
    }

    return state.buffer.length;
  }

  private decodeValue(vr: DicomTagVR, data: Buffer, littleEndian: boolean): any {
    if (data.length === 0) {
      return vr === DicomTagVR.OB || vr === DicomTagVR.OW || vr === DicomTagVR.SQ ? Buffer.alloc(0) : '';
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
        return data.toString('utf8');

      case DicomTagVR.OB:
      case DicomTagVR.OF:
      case DicomTagVR.OW:
      case DicomTagVR.OD:
      case DicomTagVR.OL:
      case DicomTagVR.OV:
      case DicomTagVR.UN:
      case DicomTagVR.SQ:
        return Buffer.from(data);

      case DicomTagVR.AT: {
        const result: number[] = [];
        for (let i = 0; i + 4 <= data.length; i += 4) {
          const g = littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i);
          const e = littleEndian ? data.readUInt16LE(i + 2) : data.readUInt16BE(i + 2);
          result.push(g, e);
        }
        return result;
      }

      case DicomTagVR.SL:
      case DicomTagVR.UL: {
        const result: number[] = [];
        for (let i = 0; i + 4 <= data.length; i += 4) {
          result.push(littleEndian ? data.readUInt32LE(i) : data.readUInt32BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }

      case DicomTagVR.SV:
      case DicomTagVR.UV: {
        const result: bigint[] = [];
        for (let i = 0; i + 8 <= data.length; i += 8) {
          result.push(littleEndian ? data.readBigUInt64LE(i) : data.readBigUInt64BE(i));
        }
        return result.length === 1 ? result[0] : result;
      }

      case DicomTagVR.SS:
      case DicomTagVR.US: {
        const result: number[] = [];
        for (let i = 0; i + 2 <= data.length; i += 2) {
          if (vr === DicomTagVR.SS) {
            result.push(littleEndian ? data.readInt16LE(i) : data.readInt16BE(i));
          } else {
            result.push(littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i));
          }
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

  private updateTransferSyntax(state: ParseState, transferSyntaxUid: string): void {
    if (transferSyntaxUid === '1.2.840.10008.1.2' ||
        transferSyntaxUid === '1.2.840.10008.1.2.1' ||
        transferSyntaxUid.startsWith('1.2.840.10008.1.2.5') ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.50' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.51' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.57' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.70' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.80' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.81' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.90' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.91' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.92' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.93' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.94' ||
        transferSyntaxUid === '1.2.840.10008.1.2.4.95') {
      state.littleEndian = true;
      state.explicitVR = true;
    } else if (transferSyntaxUid === '1.2.840.10008.1.2.2') {
      state.littleEndian = false;
      state.explicitVR = true;
    } else if (transferSyntaxUid === '1.2.840.10008.1.2.99') {
      state.littleEndian = true;
      state.explicitVR = false;
    }
  }
}
