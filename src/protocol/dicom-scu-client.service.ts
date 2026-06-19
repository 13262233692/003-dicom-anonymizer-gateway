import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as net from 'net';
import configuration from '@common/config/configuration';
import { DicomPduCodec } from './dicom-pdu-codec.service';
import { DimseCodec } from './dimse-codec.service';
import {
  PduType,
  PresentationContext,
  DimseStatus,
  CommandField,
} from './dicom-pdu.types';
import { DicomTagVR } from '@common/types/dicom.types';
import { DicomNetworkException } from '@common/exceptions/custom.exceptions';
import { PacsTransferContext } from '@common/types/anonymization.types';

@Injectable()
export class DicomScuClient {
  private readonly logger = new Logger(DicomScuClient.name);

  constructor(
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
    private readonly pduCodec: DicomPduCodec,
    private readonly dimseCodec: DimseCodec,
  ) {}

  public async cStore(
    targetHost: string,
    targetPort: number,
    targetAeTitle: string,
    sourceAeTitle: string,
    sopClassUid: string,
    sopInstanceUid: string,
    dicomData: Buffer,
    context?: PacsTransferContext,
  ): Promise<DimseStatus> {
    const traceId = context?.studyInstanceUid || sopInstanceUid;
    this.logger.log(
      `[${traceId}] Initiating C-STORE to ${targetAeTitle}@${targetHost}:${targetPort} for SOP=${sopInstanceUid}`,
    );

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = this.config.dicomScp.requestTimeout;

      const cleanup = () => {
        try {
          socket.destroy();
        } catch (_e) {
          // ignore
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new DicomNetworkException('C-STORE timeout', targetAeTitle));
      }, timeout);

      let associationEstablished = false;
      let receiveBuffer = Buffer.alloc(0);
      let storeCompleted = false;
      let currentContextId = 0;

      socket.on('connect', () => {
        this.logger.debug(`[${traceId}] TCP connected to ${targetHost}:${targetPort}`);
        this.sendAssociateRq(socket, sourceAeTitle, targetAeTitle, sopClassUid);
      });

      socket.on('data', (data) => {
        receiveBuffer = Buffer.concat([receiveBuffer, data]);

        while (receiveBuffer.length >= 6) {
          const pduType = receiveBuffer.readUInt8(0);
          const pduLength = receiveBuffer.readUInt32BE(2);
          const totalSize = 6 + pduLength;

          if (receiveBuffer.length < totalSize) break;

          const pduData = Buffer.from(receiveBuffer.subarray(0, totalSize));
          receiveBuffer = Buffer.from(receiveBuffer.subarray(totalSize));

          try {
            const pdu = this.pduCodec.decode(pduData);

            switch (pdu.type) {
              case PduType.A_ASSOCIATE_AC:
                this.logger.debug(`[${traceId}] Association accepted`);
                associationEstablished = true;
                const acPdu = pdu as any;
                const acceptedCtx = (acPdu.presentationContexts || []).find(
                  (c: PresentationContext) => c.result === 0,
                );
                if (acceptedCtx) {
                  currentContextId = acceptedCtx.id;
                } else {
                  currentContextId = 1;
                }
                this.sendCStore(
                  socket,
                  currentContextId,
                  sopClassUid,
                  sopInstanceUid,
                  dicomData,
                  acPdu.maxLength || 16384,
                );
                break;

              case PduType.A_ASSOCIATE_RJ:
                clearTimeout(timer);
                cleanup();
                reject(new DicomNetworkException('Association rejected', targetAeTitle));
                return;

              case PduType.P_DATA_TF: {
                const pdvItems = (pdu as any).pdvItems || [];
                for (const pdv of pdvItems) {
                  if (pdv.command && pdv.last && !storeCompleted) {
                    try {
                      const response = this.dimseCodec.decodeCommand(pdv.data);
                      if (response.commandField === CommandField.C_STORE_RSP) {
                        storeCompleted = true;
                        this.logger.log(
                          `[${traceId}] C-STORE completed with status: 0x${response.status.toString(16)}`,
                        );
                        this.sendReleaseRq(socket);
                        clearTimeout(timer);
                        resolve(response.status);
                      }
                    } catch (e) {
                      this.logger.error(`[${traceId}] Error parsing response: ${e.message}`);
                    }
                  }
                }
                break;
              }

              case PduType.A_RELEASE_RP:
                this.logger.debug(`[${traceId}] Release confirmed`);
                clearTimeout(timer);
                cleanup();
                if (!storeCompleted) {
                  resolve(DimseStatus.SUCCESS);
                }
                return;

              case PduType.A_ABORT:
                clearTimeout(timer);
                cleanup();
                reject(new DicomNetworkException('Association aborted', targetAeTitle));
                return;

              default:
                break;
            }
          } catch (error) {
            this.logger.error(`[${traceId}] PDU decode error: ${error.message}`);
          }
        }
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        cleanup();
        reject(new DicomNetworkException(`Socket error: ${error.message}`, targetAeTitle, error));
      });

      socket.on('close', () => {
        clearTimeout(timer);
        if (!storeCompleted) {
          reject(new DicomNetworkException('Connection closed before C-STORE completed', targetAeTitle));
        }
      });

      socket.connect(targetPort, targetHost);
    });
  }

  private sendAssociateRq(
    socket: net.Socket,
    sourceAeTitle: string,
    targetAeTitle: string,
    sopClassUid: string,
  ): void {
    const maxPdu = 16384;

    const variableItems: Buffer[] = [];

    const appCtx = '1.2.840.10008.3.1.1.1';
    const appCtxBuf = Buffer.alloc(4 + appCtx.length);
    appCtxBuf.writeUInt8(0x10, 0);
    appCtxBuf.writeUInt16BE(appCtx.length, 2);
    appCtxBuf.write(appCtx, 4, 'ascii');
    variableItems.push(appCtxBuf);

    const presentationContexts = [
      {
        id: 1,
        abstractSyntax: sopClassUid,
        transferSyntaxes: ['1.2.840.10008.1.2.1', '1.2.840.10008.1.2'],
      },
    ];

    for (const pc of presentationContexts) {
      const absSynBuf = Buffer.alloc(4 + pc.abstractSyntax.length);
      absSynBuf.writeUInt8(0x30, 0);
      absSynBuf.writeUInt16BE(pc.abstractSyntax.length, 2);
      absSynBuf.write(pc.abstractSyntax, 4, 'ascii');

      const tsBuffers: Buffer[] = [];
      for (const ts of pc.transferSyntaxes) {
        const tsBuf = Buffer.alloc(4 + ts.length);
        tsBuf.writeUInt8(0x40, 0);
        tsBuf.writeUInt16BE(ts.length, 2);
        tsBuf.write(ts, 4, 'ascii');
        tsBuffers.push(tsBuf);
      }

      const pcContentLen = 4 + absSynBuf.length + tsBuffers.reduce((s, b) => s + b.length, 0);
      const pcBuf = Buffer.alloc(4 + pcContentLen);
      pcBuf.writeUInt8(0x20, 0);
      pcBuf.writeUInt16BE(pcContentLen, 2);
      pcBuf.writeUInt8(pc.id, 4);

      let offset = 8;
      absSynBuf.copy(pcBuf, offset);
      offset += absSynBuf.length;
      for (const tsBuf of tsBuffers) {
        tsBuf.copy(pcBuf, offset);
        offset += tsBuf.length;
      }
      variableItems.push(pcBuf);
    }

    const maxPduBuf = Buffer.alloc(8);
    maxPduBuf.writeUInt8(0x51, 0);
    maxPduBuf.writeUInt16BE(4, 2);
    maxPduBuf.writeUInt32BE(maxPdu, 4);
    const userInfoMaxPdu = Buffer.alloc(4 + maxPduBuf.length);
    userInfoMaxPdu.writeUInt8(0x50, 0);
    userInfoMaxPdu.writeUInt16BE(maxPduBuf.length, 2);
    maxPduBuf.copy(userInfoMaxPdu, 4);
    variableItems.push(userInfoMaxPdu);

    const implClassUid = '1.2.276.0.7230010.3.0.3.6.2';
    const implClassBuf = Buffer.alloc(4 + implClassUid.length);
    implClassBuf.writeUInt8(0x52, 0);
    implClassBuf.writeUInt16BE(implClassUid.length, 2);
    implClassBuf.write(implClassUid, 4, 'ascii');
    const userInfoClass = Buffer.alloc(4 + implClassBuf.length);
    userInfoClass.writeUInt8(0x50, 0);
    userInfoClass.writeUInt16BE(implClassBuf.length, 2);
    implClassBuf.copy(userInfoClass, 4);
    variableItems.push(userInfoClass);

    const implVerName = 'ANON_GW_1_0';
    const implVerBuf = Buffer.alloc(4 + implVerName.length);
    implVerBuf.writeUInt8(0x55, 0);
    implVerBuf.writeUInt16BE(implVerName.length, 2);
    implVerBuf.write(implVerName, 4, 'ascii');
    const userInfoVer = Buffer.alloc(4 + implVerBuf.length);
    userInfoVer.writeUInt8(0x50, 0);
    userInfoVer.writeUInt16BE(implVerBuf.length, 2);
    implVerBuf.copy(userInfoVer, 4);
    variableItems.push(userInfoVer);

    const variableTotal = variableItems.reduce((s, b) => s + b.length, 0);
    const totalLength = 68 + variableTotal;

    const pdu = Buffer.alloc(6 + totalLength);
    pdu.writeUInt8(PduType.A_ASSOCIATE_RQ, 0);
    pdu.writeUInt32BE(totalLength, 2);
    pdu.writeUInt16BE(1, 6);
    pdu.write(targetAeTitle.padEnd(16, ' '), 10, 'ascii');
    pdu.write(sourceAeTitle.padEnd(16, ' '), 26, 'ascii');

    let offset = 74;
    for (const item of variableItems) {
      item.copy(pdu, offset);
      offset += item.length;
    }

    socket.write(pdu);
  }

  private sendCStore(
    socket: net.Socket,
    presentationContextId: number,
    sopClassUid: string,
    sopInstanceUid: string,
    dataSet: Buffer,
    maxPduLength: number,
  ): void {
    const messageId = 1;

    const chunks: Buffer[] = [];

    chunks.push(this.encodeTag(0x0000, 0x0000, DicomTagVR.UL, 0));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, '1.2.840.10008.1.2'));
    chunks.push(this.encodeTag(0x0000, 0x0100, DicomTagVR.US, CommandField.C_STORE_RQ));
    chunks.push(this.encodeTag(0x0000, 0x0110, DicomTagVR.US, messageId));
    chunks.push(this.encodeTag(0x0000, 0x0700, DicomTagVR.US, 0));
    chunks.push(this.encodeTag(0x0000, 0x0800, DicomTagVR.US, 0x0000));
    chunks.push(this.encodeTag(0x0000, 0x0002, DicomTagVR.UI, sopClassUid));
    chunks.push(this.encodeTag(0x0000, 0x1000, DicomTagVR.UI, sopInstanceUid));
    chunks.push(this.encodeTag(0x0000, 0x0010, DicomTagVR.US, 0));

    const commandBuf = Buffer.concat(chunks);
    const totalLength = commandBuf.length - 8;
    commandBuf.writeUInt32LE(totalLength, 4);

    const pduChunks = this.pduCodec.encodePDataChunks(
      presentationContextId,
      commandBuf,
      dataSet,
      Math.min(maxPduLength, 16384),
    );

    for (const chunk of pduChunks) {
      socket.write(chunk);
    }
  }

  private sendReleaseRq(socket: net.Socket): void {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(PduType.A_RELEASE_RQ, 0);
    buf.writeUInt32BE(4, 2);
    socket.write(buf);
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
      case DicomTagVR.UL: {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(Number(value) || 0, 0);
        return buf;
      }
      case DicomTagVR.UI:
      case DicomTagVR.AE:
      case DicomTagVR.CS: {
        let str = String(value || '');
        if (str.length % 2 !== 0) str += ' ';
        return Buffer.from(str, 'ascii');
      }
      default:
        return Buffer.alloc(0);
    }
  }
}
