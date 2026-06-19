import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as net from 'net';
import { v4 as uuidv4 } from 'uuid';
import configuration from '@common/config/configuration';
import { DicomPduCodec } from './dicom-pdu-codec.service';
import { DimseCodec } from './dimse-codec.service';
import {
  AssociateRqPDU,
  AssociateAcPDU,
  AssociateRjPDU,
  PduType,
  PresentationContext,
  DicomAssociation,
  AssociationState,
  DimseStatus,
  CStoreRequest,
  CommandField,
  AbortPDU,
} from './dicom-pdu.types';
import { DicomNetworkException } from '@common/exceptions/custom.exceptions';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class DicomScpServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DicomScpServer.name);
  private server: net.Server | null = null;
  private readonly associations: Map<string, DicomAssociation> = new Map();
  private readonly cStoreRequestSubject = new Subject<CStoreRequest>();

  constructor(
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
    private readonly pduCodec: DicomPduCodec,
    private readonly dimseCodec: DimseCodec,
  ) {}

  get cStoreRequests$(): Observable<CStoreRequest> {
    return this.cStoreRequestSubject.asObservable();
  }

  public onModuleInit(): void {
    this.startServer();
  }

  public onModuleDestroy(): void {
    this.stopServer();
  }

  private startServer(): void {
    const port = this.config.dicomScp.port;
    const aeTitle = this.config.dicomScp.aeTitle;

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(port, () => {
      this.logger.log(`DICOM SCP Server listening on port ${port}, AE Title: ${aeTitle}`);
    });

    this.server.on('error', (error) => {
      this.logger.error(`DICOM SCP Server error: ${error.message}`);
    });
  }

  private stopServer(): void {
    if (this.server) {
      this.server.close(() => {
        this.logger.log('DICOM SCP Server stopped');
      });
      this.associations.forEach((assoc) => {
        assoc.state = AssociationState.ABORTED;
      });
      this.associations.clear();
    }
  }

  private handleConnection(socket: net.Socket): void {
    const connectionId = uuidv4();
    const callingHost = socket.remoteAddress || 'unknown';
    const callingPort = socket.remotePort || 0;

    this.logger.debug(`New connection from ${callingHost}:${callingPort} (ID: ${connectionId})`);

    socket.setTimeout(this.config.dicomScp.connectionTimeout);
    socket.setKeepAlive(true);

    let association: DicomAssociation | null = null;
    let receiveBuffer = Buffer.alloc(0);
    let commandBuffer: Buffer | null = null;
    let dataSetBuffer: Buffer | null = null;
    let currentPresentationContextId: number = 0;
    let isCollectingDataSet = false;

    socket.on('data', async (data) => {
      receiveBuffer = Buffer.concat([receiveBuffer, data]);

      while (receiveBuffer.length >= 6) {
        const pduType = receiveBuffer.readUInt8(0);
        const pduLength = receiveBuffer.readUInt32BE(2);
        const totalPduSize = 6 + pduLength;

        if (receiveBuffer.length < totalPduSize) {
          break;
        }

        const pduData = Buffer.from(receiveBuffer.subarray(0, totalPduSize));
        receiveBuffer = Buffer.from(receiveBuffer.subarray(totalPduSize));

        try {
          const pdu = this.pduCodec.decode(pduData);

          switch (pdu.type) {
            case PduType.A_ASSOCIATE_RQ:
              association = await this.handleAssociateRq(socket, pdu as AssociateRqPDU, connectionId, callingHost, callingPort);
              break;

            case PduType.P_DATA_TF:
              if (association) {
                for (const pdv of (pdu as any).pdvItems) {
                  if (pdv.command) {
                    if (pdv.last && !isCollectingDataSet) {
                      const cmdBuf = pdv.data;
                      await this.handleDimseCommand(socket, association, pdv.presentationContextId, cmdBuf, null);
                      commandBuffer = null;
                    } else {
                      commandBuffer = commandBuffer ? Buffer.concat([commandBuffer, pdv.data]) : pdv.data;
                      if (pdv.last) {
                        isCollectingDataSet = true;
                      }
                    }
                  } else {
                    dataSetBuffer = dataSetBuffer ? Buffer.concat([dataSetBuffer, pdv.data]) : pdv.data;
                    currentPresentationContextId = pdv.presentationContextId;

                    if (pdv.last) {
                      if (commandBuffer) {
                        await this.handleDimseCommand(socket, association, currentPresentationContextId, commandBuffer, dataSetBuffer);
                      }
                      commandBuffer = null;
                      dataSetBuffer = null;
                      isCollectingDataSet = false;
                    }
                  }
                }
              }
              break;

            case PduType.A_RELEASE_RQ:
              if (association) {
                this.handleReleaseRq(socket, association);
              }
              break;

            case PduType.A_ABORT:
              if (association) {
                this.handleAbort(association, pdu as AbortPDU);
                socket.end();
              }
              break;

            default:
              break;
          }
        } catch (error) {
          this.logger.error(`Error processing PDU: ${error.message}`);
          socket.end();
        }
      }
    });

    socket.on('timeout', () => {
      this.logger.warn(`Connection timeout for ${callingHost}:${callingPort}`);
      socket.end();
    });

    socket.on('error', (error) => {
      this.logger.error(`Socket error for ${callingHost}:${callingPort}: ${error.message}`);
      if (association) {
        association.state = AssociationState.ABORTED;
        this.associations.delete(association.id);
      }
    });

    socket.on('close', () => {
      this.logger.debug(`Connection closed from ${callingHost}:${callingPort}`);
      if (association) {
        this.associations.delete(association.id);
      }
    });
  }

  private async handleAssociateRq(
    socket: net.Socket,
    pdu: AssociateRqPDU,
    connectionId: string,
    callingHost: string,
    callingPort: number,
  ): Promise<DicomAssociation> {
    this.logger.log(`Association request: Calling=${pdu.callingAeTitle}, Called=${pdu.calledAeTitle}`);

    if (pdu.calledAeTitle !== this.config.dicomScp.aeTitle) {
      this.logger.warn(`Association rejected: Unknown Called AE Title '${pdu.calledAeTitle}'`);
      const rejectPdu: AssociateRjPDU = {
        type: PduType.A_ASSOCIATE_RJ,
        result: 1,
        source: 1,
        reason: 3,
      };
      socket.write(this.pduCodec.encode(rejectPdu));
      socket.end();
      throw new DicomNetworkException(
        `Unknown Called AE Title: ${pdu.calledAeTitle}`,
        pdu.calledAeTitle,
      );
    }

    const acceptedContexts: PresentationContext[] = [];
    const presentationContexts = new Map<number, PresentationContext>();

    for (const ctx of pdu.presentationContexts) {
      const acceptedTransferSyntax = this.selectTransferSyntax(ctx.transferSyntaxes);
      if (acceptedTransferSyntax) {
        acceptedContexts.push({
          id: ctx.id,
          abstractSyntax: ctx.abstractSyntax,
          transferSyntaxes: [],
          result: 0,
          acceptedTransferSyntax,
        });
        presentationContexts.set(ctx.id, {
          ...ctx,
          acceptedTransferSyntax,
          result: 0,
        });
        this.logger.debug(`Accepted presentation context ${ctx.id}: ${ctx.abstractSyntax} -> ${acceptedTransferSyntax}`);
      } else {
        acceptedContexts.push({
          id: ctx.id,
          abstractSyntax: ctx.abstractSyntax,
          transferSyntaxes: [],
          result: 1,
        });
        this.logger.debug(`Rejected presentation context ${ctx.id}: ${ctx.abstractSyntax}`);
      }
    }

    const association: DicomAssociation = {
      id: connectionId,
      callingAeTitle: pdu.callingAeTitle,
      calledAeTitle: pdu.calledAeTitle,
      callingHost,
      callingPort,
      presentationContexts,
      maxReceivePduLength: pdu.maxLength,
      maxSendPduLength: 65536,
      acceptedAt: new Date(),
      state: AssociationState.ASSOCIATION_ESTABLISHED,
    };

    this.associations.set(connectionId, association);

    const acceptPdu: AssociateAcPDU = {
      type: PduType.A_ASSOCIATE_AC,
      callingAeTitle: pdu.callingAeTitle,
      calledAeTitle: pdu.calledAeTitle,
      applicationContext: pdu.applicationContext,
      presentationContexts: acceptedContexts,
      maxLength: association.maxSendPduLength,
      implementationClassUid: '1.2.276.0.7230010.3.0.3.6.2',
      implementationVersionName: 'ANON_GW_1_0',
    };

    socket.write(this.pduCodec.encode(acceptPdu));
    this.logger.log(`Association established with ${pdu.callingAeTitle}@${callingHost}:${callingPort}`);

    return association;
  }

  private selectTransferSyntax(transferSyntaxes: string[]): string | null {
    const preferredOrder = [
      '1.2.840.10008.1.2.1',
      '1.2.840.10008.1.2',
      '1.2.840.10008.1.2.2',
      '1.2.840.10008.1.2.99',
    ];

    for (const ts of preferredOrder) {
      if (transferSyntaxes.includes(ts)) {
        return ts;
      }
    }

    if (transferSyntaxes.length > 0) {
      return transferSyntaxes[0];
    }

    return null;
  }

  private async handleDimseCommand(
    socket: net.Socket,
    association: DicomAssociation,
    presentationContextId: number,
    commandData: Buffer,
    dataSet: Buffer | null,
  ): Promise<void> {
    try {
      const command = this.dimseCodec.decodeCommand(commandData);

      switch (command.commandField) {
        case CommandField.C_ECHO_RQ:
          this.logger.debug(`C-ECHO request from ${association.callingAeTitle}`);
          this.sendCEchoResponse(socket, association, presentationContextId, command.messageId);
          break;

        case CommandField.C_STORE_RQ: {
          this.logger.debug(
            `C-STORE request: SOPClass=${command.sopClassUid}, SOPInstance=${command.sopInstanceUid}`,
          );

          if (!dataSet) {
            this.sendCStoreResponse(
              socket,
              association,
              presentationContextId,
              command.messageId,
              DimseStatus.C_STORE_UNABLE_TO_PROCESS,
              command.sopClassUid || '',
              command.sopInstanceUid || '',
            );
            return;
          }

          const request: CStoreRequest = {
            association,
            presentationContextId,
            command,
            dataSet,
          };

          this.cStoreRequestSubject.next(request);

          this.sendCStoreResponse(
            socket,
            association,
            presentationContextId,
            command.messageId,
            DimseStatus.SUCCESS,
            command.sopClassUid || '',
            command.sopInstanceUid || '',
          );
          break;
        }

        default:
          this.logger.warn(`Unsupported DIMSE command: 0x${command.commandField.toString(16)}`);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling DIMSE command: ${error.message}`);
    }
  }

  private sendCStoreResponse(
    socket: net.Socket,
    association: DicomAssociation,
    presentationContextId: number,
    messageId: number,
    status: DimseStatus,
    sopClassUid: string,
    sopInstanceUid: string,
  ): void {
    const responseCommand = this.dimseCodec.encodeCStoreResponse(
      messageId,
      status,
      sopClassUid,
      sopInstanceUid,
    );

    const chunks = this.pduCodec.encodePDataChunks(
      presentationContextId,
      responseCommand,
      null,
      Math.min(association.maxReceivePduLength, 16384),
    );

    for (const chunk of chunks) {
      socket.write(chunk);
    }
  }

  private sendCEchoResponse(
    socket: net.Socket,
    association: DicomAssociation,
    presentationContextId: number,
    messageId: number,
  ): void {
    const responseCommand = this.dimseCodec.encodeCEchoResponse(messageId, DimseStatus.SUCCESS);

    const chunks = this.pduCodec.encodePDataChunks(
      presentationContextId,
      responseCommand,
      null,
      Math.min(association.maxReceivePduLength, 16384),
    );

    for (const chunk of chunks) {
      socket.write(chunk);
    }
  }

  private handleReleaseRq(socket: net.Socket, association: DicomAssociation): void {
    this.logger.log(`Release request from ${association.callingAeTitle}`);
    association.state = AssociationState.AWAITING_RELEASE_RP;

    socket.write(
      this.pduCodec.encode({
        type: PduType.A_RELEASE_RP,
      }),
    );

    association.state = AssociationState.RELEASED;
    this.logger.log(`Association released with ${association.callingAeTitle}`);
  }

  private handleAbort(association: DicomAssociation, pdu: AbortPDU): void {
    this.logger.warn(
      `Association aborted by ${association.callingAeTitle}: source=${pdu.source}, reason=${pdu.reason}`,
    );
    association.state = AssociationState.ABORTED;
    this.associations.delete(association.id);
  }

  public getActiveAssociations(): DicomAssociation[] {
    return Array.from(this.associations.values()).filter(
      (a) => a.state === AssociationState.ASSOCIATION_ESTABLISHED,
    );
  }
}
