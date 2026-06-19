import { ConfigType } from '@nestjs/config';
import configuration from '@common/config/configuration';
import { DicomPduCodec } from './dicom-pdu-codec.service';
import { DimseCodec } from './dimse-codec.service';
import { DimseStatus } from './dicom-pdu.types';
import { PacsTransferContext } from '@common/types/anonymization.types';
export declare class DicomScuClient {
    private readonly config;
    private readonly pduCodec;
    private readonly dimseCodec;
    private readonly logger;
    constructor(config: ConfigType<typeof configuration>, pduCodec: DicomPduCodec, dimseCodec: DimseCodec);
    cStore(targetHost: string, targetPort: number, targetAeTitle: string, sourceAeTitle: string, sopClassUid: string, sopInstanceUid: string, dicomData: Buffer, context?: PacsTransferContext): Promise<DimseStatus>;
    private sendAssociateRq;
    private sendCStore;
    private sendReleaseRq;
    private encodeTag;
    private encodeValue;
}
