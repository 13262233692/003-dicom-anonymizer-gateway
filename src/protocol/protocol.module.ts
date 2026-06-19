import { Module, Global } from '@nestjs/common';
import { DicomPduCodec } from './dicom-pdu-codec.service';
import { DimseCodec } from './dimse-codec.service';
import { DicomScpServer } from './dicom-scp-server.service';
import { DicomScuClient } from './dicom-scu-client.service';

@Global()
@Module({
  providers: [DicomPduCodec, DimseCodec, DicomScpServer, DicomScuClient],
  exports: [DicomScpServer, DicomScuClient],
})
export class ProtocolModule {}
