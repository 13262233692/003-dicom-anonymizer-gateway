import { Injectable, Logger } from '@nestjs/common';
import { CommandField, DimseCommand, DimseStatus } from './dicom-pdu.types';
import { DicomTagVR } from '@common/types/dicom.types';
import { DicomParseException } from '@common/exceptions/custom.exceptions';

@Injectable()
export class DimseCodec {
  private readonly logger = new Logger(DimseCodec.name);

  public decodeCommand(buffer: Buffer): DimseCommand {
    if (buffer.length < 8) {
      throw new DicomParseException('Command buffer too small');
    }

    let offset = 0;
    const littleEndian = true;
    const command: Partial<DimseCommand> = {
      status: DimseStatus.SUCCESS,
      dataSetType: 0x0101,
    };

    while (offset + 8 <= buffer.length) {
      const group = buffer.readUInt16LE(offset);
      const element = buffer.readUInt16LE(offset + 2);
      offset += 4;

      if (group === 0xFFFE && (element === 0xE000 || element === 0xE00D || element === 0xE0DD)) {
        const length = buffer.readUInt32LE(offset);
        offset += 4;
        if (length === 0xFFFFFFFF) break;
        offset += length;
        continue;
      }

      const vrStr = buffer.toString('ascii', offset, offset + 2);
      offset += 2;

      let length: number;
      const longVRs = ['OB', 'OW', 'OF', 'SQ', 'UC', 'UR', 'UT', 'UN', 'OD', 'OL', 'OV'];
      if (longVRs.includes(vrStr)) {
        offset += 2;
        length = buffer.readUInt32LE(offset);
        offset += 4;
      } else {
        length = buffer.readUInt16LE(offset);
        offset += 2;
      }

      if (length === 0xFFFFFFFF) {
        break;
      }

      const data = buffer.subarray(offset, offset + length);
      const value = this.decodeValue(vrStr, data, littleEndian);

      if (group === 0x0000) {
        switch (element) {
          case 0x0000:
            break;
          case 0x0100:
            command.commandField = value as number;
            break;
          case 0x0110:
            command.messageId = value as number;
            break;
          case 0x0120:
            if (typeof value === 'number') {
              command.messageIdBeingRespondedTo = value;
            }
            break;
          case 0x0200:
            if (typeof value === 'number') {
              command.status = value as DimseStatus;
            }
            break;
          case 0x0800:
            if (typeof value === 'number') {
              command.dataSetType = value;
            }
            break;
          case 0x0900:
            if (typeof value === 'number') {
              command.status = value as DimseStatus;
            }
            break;
          case 0x1000:
            if (typeof value === 'string') {
              command.affectedSopInstanceUid = value.trim();
            }
            break;
          case 0x1001:
            if (typeof value === 'string') {
              command.sopInstanceUid = value.trim();
            }
            break;
          default:
            break;
        }
      } else if (group === 0x0002) {
        switch (element) {
          case 0x0002:
            if (typeof value === 'string') {
              command.sopClassUid = value.trim();
            }
            break;
          case 0x0003:
            if (typeof value === 'string') {
              command.sopInstanceUid = value.trim();
              command.affectedSopInstanceUid = value.trim();
            }
            break;
          case 0x0010:
            if (typeof value === 'number') {
              command.priority = value;
            }
            break;
          case 0x0030:
            if (typeof value === 'number') {
              command.moveOriginatorMessageId = value;
            }
            break;
          case 0x0031:
            if (typeof value === 'string') {
              command.moveOriginatorApplicationEntityTitle = value.trim();
            }
            break;
          default:
            break;
        }
      } else {
        if (element === 0x0010 && typeof value === 'string') {
          command.sopClassUid = value.trim();
        }
      }

      offset += length;
      if (length % 2 !== 0) offset += 1;
    }

    if (command.commandField === undefined) {
      throw new DicomParseException('Missing Command Field in DIMSE command');
    }

    return command as DimseCommand;
  }

  private decodeValue(vr: string, data: Buffer, littleEndian: boolean): any {
    if (data.length === 0) return '';

    switch (vr) {
      case 'US':
      case 'SS': {
        if (data.length < 2) return 0;
        return littleEndian
          ? (vr === 'US' ? data.readUInt16LE(0) : data.readInt16LE(0))
          : (vr === 'US' ? data.readUInt16BE(0) : data.readInt16BE(0));
      }
      case 'UL':
      case 'SL': {
        if (data.length < 4) return 0;
        return littleEndian
          ? (vr === 'UL' ? data.readUInt32LE(0) : data.readInt32LE(0))
          : (vr === 'UL' ? data.readUInt32BE(0) : data.readInt32BE(0));
      }
      case 'AE':
      case 'AS':
      case 'CS':
      case 'DA':
      case 'DS':
      case 'DT':
      case 'IS':
      case 'LO':
      case 'LT':
      case 'PN':
      case 'SH':
      case 'ST':
      case 'TM':
      case 'UI':
      case 'UR':
      case 'UT':
      case 'LO ':
        return data.toString('ascii').replace(/\0/g, '').trim();
      default:
        return data;
    }
  }

  public encodeCStoreResponse(messageId: number, status: DimseStatus, sopClassUid: string, sopInstanceUid: string): Buffer {
    const chunks: Buffer[] = [];

    chunks.push(this.encodeTag(0x0000, 0x0000, DicomTagVR.UL, 0));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, '1.2.840.10008.1.2'));
    chunks.push(this.encodeTag(0x0000, 0x0100, DicomTagVR.US, CommandField.C_STORE_RSP));
    chunks.push(this.encodeTag(0x0000, 0x0120, DicomTagVR.US, messageId));
    chunks.push(this.encodeTag(0x0000, 0x0800, DicomTagVR.US, 0x0101));
    chunks.push(this.encodeTag(0x0000, 0x0900, DicomTagVR.US, status));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, sopClassUid));
    chunks.push(this.encodeTag(0x0000, 0x1000, DicomTagVR.UI, sopInstanceUid));

    const combined = Buffer.concat(chunks);
    const totalLength = combined.length - 8;
    combined.writeUInt32LE(totalLength, 4);

    return combined;
  }

  public encodeCEchoResponse(messageId: number, status: DimseStatus): Buffer {
    const chunks: Buffer[] = [];

    chunks.push(this.encodeTag(0x0000, 0x0000, DicomTagVR.UL, 0));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, '1.2.840.10008.1.2'));
    chunks.push(this.encodeTag(0x0000, 0x0100, DicomTagVR.US, CommandField.C_ECHO_RSP));
    chunks.push(this.encodeTag(0x0000, 0x0120, DicomTagVR.US, messageId));
    chunks.push(this.encodeTag(0x0000, 0x0800, DicomTagVR.US, 0x0101));
    chunks.push(this.encodeTag(0x0000, 0x0900, DicomTagVR.US, status));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, '1.2.840.10008.1.1'));

    const combined = Buffer.concat(chunks);
    const totalLength = combined.length - 8;
    combined.writeUInt32LE(totalLength, 4);

    return combined;
  }

  private encodeTag(group: number, element: number, vr: DicomTagVR, value: any): Buffer {
    const valueBuf = this.encodeValue(vr, value);
    const isLongVR = ['OB', 'OW', 'OF', 'SQ', 'UC', 'UR', 'UT', 'UN', 'OD', 'OL', 'OV'].includes(vr);

    let header: Buffer;
    if (isLongVR) {
      header = Buffer.alloc(12);
      header.writeUInt16LE(group, 0);
      header.writeUInt16LE(element, 2);
      header.write(vr, 4, 'ascii');
      header.writeUInt32LE(valueBuf.length, 8);
    } else {
      header = Buffer.alloc(8);
      header.writeUInt16LE(group, 0);
      header.writeUInt16LE(element, 2);
      header.write(vr, 4, 'ascii');
      header.writeUInt16LE(valueBuf.length, 6);
    }

    return Buffer.concat([header, valueBuf]);
  }

  private encodeValue(vr: DicomTagVR, value: any): Buffer {
    switch (vr) {
      case DicomTagVR.US: {
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(Number(value) || 0, 0);
        return buf;
      }
      case DicomTagVR.SS: {
        const buf = Buffer.alloc(2);
        buf.writeInt16LE(Number(value) || 0, 0);
        return buf;
      }
      case DicomTagVR.UL: {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(Number(value) || 0, 0);
        return buf;
      }
      case DicomTagVR.SL: {
        const buf = Buffer.alloc(4);
        buf.writeInt32LE(Number(value) || 0, 0);
        return buf;
      }
      case DicomTagVR.UI:
      case DicomTagVR.AE:
      case DicomTagVR.AS:
      case DicomTagVR.CS:
      case DicomTagVR.DA:
      case DicomTagVR.DS:
      case DicomTagVR.DT:
      case DicomTagVR.IS:
      case DicomTagVR.LO:
      case DicomTagVR.PN:
      case DicomTagVR.SH:
      case DicomTagVR.ST:
      case DicomTagVR.TM:
      case DicomTagVR.UR: {
        let str = String(value || '');
        if (str.length % 2 !== 0) str += ' ';
        return Buffer.from(str, 'ascii');
      }
      default:
        return Buffer.alloc(0);
    }
  }
}
