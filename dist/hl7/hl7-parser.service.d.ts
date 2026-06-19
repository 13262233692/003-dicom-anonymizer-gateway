import { Hl7Message, PatientAccountStatus } from '@common/types/hl7.types';
export declare class Hl7ParserService {
    private readonly logger;
    parse(rawMessage: string): Hl7Message;
    private parseSegment;
    private parseMshSegment;
    private parsePidSegment;
    private parsePv1Segment;
    private splitFirstComponent;
    private splitSecondComponent;
    determinePatientAccountStatus(message: Hl7Message): PatientAccountStatus;
    extractPatientId(message: Hl7Message): string;
    extractHospitalId(message: Hl7Message): string;
    isValidAck(message: Hl7Message): boolean;
}
