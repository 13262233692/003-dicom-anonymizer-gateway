import { Injectable, Logger } from '@nestjs/common';
import { DicomTag, DicomTagVR, ParsedDicomObject, formatTagKey } from '@common/types/dicom.types';
import { DicomParseException } from '@common/exceptions/custom.exceptions';

@Injectable()
export class DicomBinaryReconstructor {
  private readonly logger = new Logger(DicomBinaryReconstructor.name);

  public reconstruct(parsed: ParsedDicomObject): Buffer {
    const chunks: Buffer[] = [];
    const preamble = Buffer.alloc(128);
    chunks.push(preamble);
    chunks.push(Buffer.from('DICM', 'ascii'));

    const metaTags: [string, DicomTag][] = [];
    const dataTags: [string, DicomTag][] = [];

    for (const [key, tag] of parsed.tags.entries()) {
      if (tag.group === 0x0002) {
        metaTags.push([key, tag]);
      } else {
        dataTags.push([key, tag]);
      }
    }

    metaTags.sort((a, b) => {
      const ta = a[1];
      const tb = b[1];
      if (ta.group !== tb.group) return ta.group - tb.group;
      return ta.element - tb.element;
    });

    dataTags.sort((a, b) => {
      const ta = a[1];
      const tb = b[1];
      if (ta.group !== tb.group) return ta.group - tb.group;
      return ta.element - tb.element;
    });

    const metaGroupContent = this.serializeTags(metaTags, true, true);
    const metaGroupLengthTag: DicomTag = {
      group: 0x0002,
      element: 0x0000,
      vr: DicomTagVR.UL,
      value: metaGroupContent.length,
      length: 4,
      keyword: 'FileMetaInformationGroupLength',
    };
    chunks.push(this.serializeTag(metaGroupLengthTag, true, true));
    chunks.push(metaGroupContent);
    chunks.push(this.serializeTags(dataTags, true, true));

    return Buffer.concat(chunks);
  }

  private serializeTags(
    tags: [string, DicomTag][],
    littleEndian: boolean,
    explicitVR: boolean,
  ): Buffer {
    const chunks: Buffer[] = [];
    for (const [, tag] of tags) {
      chunks.push(this.serializeTag(tag, littleEndian, explicitVR));
    }
    return Buffer.concat(chunks);
  }

  private serializeTag(
    tag: DicomTag,
    littleEndian: boolean,
    explicitVR: boolean,
  ): Buffer {
    if (tag.group === 0x0002 && tag.element === 0x0000) {
      const header = Buffer.alloc(12);
      header.writeUInt16LE(tag.group, 0);
      header.writeUInt16LE(tag.element, 2);
      header.write('UL', 4, 'ascii');
      header.writeUInt16LE(4, 6);
      header.writeUInt32LE(Number(tag.value), 8);
      return header;
    }

    const valueBuffer = this.encodeValue(tag.vr, tag.value, littleEndian);
    let valueLength = valueBuffer.length;

    if (tag.vr === DicomTagVR.SQ || tag.vr === DicomTagVR.OB ||
        tag.vr === DicomTagVR.OW || tag.vr === DicomTagVR.OF ||
        tag.vr === DicomTagVR.OD || tag.vr === DicomTagVR.OL ||
        tag.vr === DicomTagVR.OV || tag.vr === DicomTagVR.UN) {
      const isLongVR = true;
      const headerSize = explicitVR ? (isLongVR ? 12 : 8) : 8;
      const header = Buffer.alloc(headerSize);

      if (littleEndian) {
        header.writeUInt16LE(tag.group, 0);
        header.writeUInt16LE(tag.element, 2);
      } else {
        header.writeUInt16BE(tag.group, 0);
        header.writeUInt16BE(tag.element, 2);
      }

      if (explicitVR) {
        header.write(tag.vr, 4, 'ascii');
        if (isLongVR) {
          if (littleEndian) {
            header.writeUInt32LE(valueLength, 8);
          } else {
            header.writeUInt32BE(valueLength, 8);
          }
        } else {
          if (littleEndian) {
            header.writeUInt16LE(valueLength, 6);
          } else {
            header.writeUInt16BE(valueLength, 6);
          }
        }
      } else {
        if (littleEndian) {
          header.writeUInt32LE(valueLength, 4);
        } else {
          header.writeUInt32BE(valueLength, 4);
        }
      }

      return Buffer.concat([header, valueBuffer]);
    }

    const vr = tag.vr;
    const isLongVR = this.isLongVr(vr);

    if (explicitVR) {
      if (isLongVR) {
        const header = Buffer.alloc(12);
        if (littleEndian) {
          header.writeUInt16LE(tag.group, 0);
          header.writeUInt16LE(tag.element, 2);
        } else {
          header.writeUInt16BE(tag.group, 0);
          header.writeUInt16BE(tag.element, 2);
        }
        header.write(vr, 4, 'ascii');
        if (littleEndian) {
          header.writeUInt32LE(valueLength, 8);
        } else {
          header.writeUInt32BE(valueLength, 8);
        }
        return Buffer.concat([header, valueBuffer]);
      } else {
        const header = Buffer.alloc(8);
        if (littleEndian) {
          header.writeUInt16LE(tag.group, 0);
          header.writeUInt16LE(tag.element, 2);
        } else {
          header.writeUInt16BE(tag.group, 0);
          header.writeUInt16BE(tag.element, 2);
        }
        header.write(vr, 4, 'ascii');
        if (littleEndian) {
          header.writeUInt16LE(valueLength, 6);
        } else {
          header.writeUInt16BE(valueLength, 6);
        }
        return Buffer.concat([header, valueBuffer]);
      }
    } else {
      const header = Buffer.alloc(8);
      if (littleEndian) {
        header.writeUInt16LE(tag.group, 0);
        header.writeUInt16LE(tag.element, 2);
        header.writeUInt32LE(valueLength, 4);
      } else {
        header.writeUInt16BE(tag.group, 0);
        header.writeUInt16BE(tag.element, 2);
        header.writeUInt32BE(valueLength, 4);
      }
      return Buffer.concat([header, valueBuffer]);
    }
  }

  private encodeValue(vr: DicomTagVR, value: any, littleEndian: boolean): Buffer {
    if (value === null || value === undefined) {
      return Buffer.alloc(0);
    }

    if (Buffer.isBuffer(value)) {
      let buf = value;
      if (buf.length % 2 !== 0) {
        const padded = Buffer.alloc(buf.length + 1);
        buf.copy(padded);
        padded.writeUInt8(0, buf.length);
        buf = padded;
      }
      return buf;
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
      case DicomTagVR.UT: {
        let str = String(value);
        if (str.length % 2 !== 0) {
          str += ' ';
        }
        return Buffer.from(str, 'utf8');
      }

      case DicomTagVR.OB:
      case DicomTagVR.OF:
      case DicomTagVR.OW:
      case DicomTagVR.OD:
      case DicomTagVR.OL:
      case DicomTagVR.OV:
      case DicomTagVR.UN:
      case DicomTagVR.SQ: {
        let buf = Buffer.from(value);
        if (buf.length % 2 !== 0) {
          const padded = Buffer.alloc(buf.length + 1);
          buf.copy(padded);
          buf = padded;
        }
        return buf;
      }

      case DicomTagVR.AT: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 4);
        for (let i = 0; i < values.length; i++) {
          const v = values[i] as number[];
          if (Array.isArray(v) && v.length >= 2) {
            if (littleEndian) {
              buf.writeUInt16LE(v[0], i * 4);
              buf.writeUInt16LE(v[1], i * 4 + 2);
            } else {
              buf.writeUInt16BE(v[0], i * 4);
              buf.writeUInt16BE(v[1], i * 4 + 2);
            }
          }
        }
        return buf;
      }

      case DicomTagVR.SL:
      case DicomTagVR.UL: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 4);
        for (let i = 0; i < values.length; i++) {
          if (littleEndian) {
            buf.writeUInt32LE(Number(values[i]), i * 4);
          } else {
            buf.writeUInt32BE(Number(values[i]), i * 4);
          }
        }
        return buf;
      }

      case DicomTagVR.SV:
      case DicomTagVR.UV: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 8);
        for (let i = 0; i < values.length; i++) {
          const v = BigInt(values[i]);
          if (littleEndian) {
            buf.writeBigUInt64LE(v, i * 8);
          } else {
            buf.writeBigUInt64BE(v, i * 8);
          }
        }
        return buf;
      }

      case DicomTagVR.SS:
      case DicomTagVR.US: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 2);
        for (let i = 0; i < values.length; i++) {
          if (vr === DicomTagVR.SS) {
            if (littleEndian) {
              buf.writeInt16LE(Number(values[i]), i * 2);
            } else {
              buf.writeInt16BE(Number(values[i]), i * 2);
            }
          } else {
            if (littleEndian) {
              buf.writeUInt16LE(Number(values[i]), i * 2);
            } else {
              buf.writeUInt16BE(Number(values[i]), i * 2);
            }
          }
        }
        return buf;
      }

      case DicomTagVR.FL: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 4);
        for (let i = 0; i < values.length; i++) {
          if (littleEndian) {
            buf.writeFloatLE(Number(values[i]), i * 4);
          } else {
            buf.writeFloatBE(Number(values[i]), i * 4);
          }
        }
        return buf;
      }

      case DicomTagVR.FD: {
        const values = Array.isArray(value) ? value : [value];
        const buf = Buffer.alloc(values.length * 8);
        for (let i = 0; i < values.length; i++) {
          if (littleEndian) {
            buf.writeDoubleLE(Number(values[i]), i * 8);
          } else {
            buf.writeDoubleBE(Number(values[i]), i * 8);
          }
        }
        return buf;
      }

      default:
        return Buffer.from(String(value), 'utf8');
    }
  }

  private isLongVr(vr: DicomTagVR): boolean {
    const longVRs = [
      DicomTagVR.OB, DicomTagVR.OD, DicomTagVR.OF, DicomTagVR.OL,
      DicomTagVR.OV, DicomTagVR.OW, DicomTagVR.SQ, DicomTagVR.UC,
      DicomTagVR.UR, DicomTagVR.UT, DicomTagVR.UN,
    ];
    return longVRs.includes(vr);
  }

  public updateTag(
    parsed: ParsedDicomObject,
    group: number,
    element: number,
    value: any,
  ): void {
    const key = formatTagKey(group, element);
    const existing = parsed.tags.get(key);

    if (existing) {
      existing.value = value;
    } else {
      const newTag: DicomTag = {
        group,
        element,
        vr: DicomTagVR.LO,
        value,
        length: Buffer.byteLength(String(value), 'utf8'),
      };
      parsed.tags.set(key, newTag);
    }
  }

  public removeTag(
    parsed: ParsedDicomObject,
    group: number,
    element: number,
  ): boolean {
    const key = formatTagKey(group, element);
    return parsed.tags.delete(key);
  }

  public getTagValue(parsed: ParsedDicomObject, group: number, element: number): any {
    const key = formatTagKey(group, element);
    const tag = parsed.tags.get(key);
    if (!tag) return null;
    return tag.value;
  }

  public getTagValueString(parsed: ParsedDicomObject, group: number, element: number): string {
    const value = this.getTagValue(parsed, group, element);
    if (value === null || value === undefined) return '';
    if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
    return String(value).trim();
  }
}
