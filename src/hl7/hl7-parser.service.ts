import { Injectable, Logger } from '@nestjs/common';
import {
  Hl7Message,
  Hl7MshSegment,
  Hl7PidSegment,
  Hl7Pv1Segment,
  PatientAccountStatus,
  PatientClass,
} from '@common/types/hl7.types';

@Injectable()
export class Hl7ParserService {
  private readonly logger = new Logger(Hl7ParserService.name);

  public parse(rawMessage: string): Hl7Message {
    const cleanMessage = rawMessage.replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
    const lines = cleanMessage.split('\n').filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new Error('Empty HL7 message');
    }

    const segments: Array<{ name: string; fields: string[] }> = [];
    let mshSegment: Hl7MshSegment | null = null;
    let pidSegment: Hl7PidSegment | null = null;
    let pv1Segment: Hl7Pv1Segment | null = null;

    for (const line of lines) {
      const fields = this.parseSegment(line);
      const segmentName = fields[0];

      segments.push({ name: segmentName, fields });

      switch (segmentName) {
        case 'MSH':
          mshSegment = this.parseMshSegment(fields);
          break;
        case 'PID':
          pidSegment = this.parsePidSegment(fields);
          break;
        case 'PV1':
          pv1Segment = this.parsePv1Segment(fields);
          break;
      }
    }

    if (!mshSegment) {
      throw new Error('MSH segment not found');
    }

    if (!pidSegment) {
      throw new Error('PID segment not found');
    }

    const messageType = mshSegment.messageType || '';
    const triggerEvent = mshSegment.messageTriggerEvent || '';

    const message: Hl7Message = {
      rawMessage,
      messageType,
      triggerEvent,
      messageTypeFull: messageType && triggerEvent ? `${messageType}^${triggerEvent}` : messageType,
      messageControlId: mshSegment.messageControlId,
      msh: mshSegment,
      pid: pidSegment,
      pv1: pv1Segment || undefined,
      segments,
      receivedAt: new Date().toISOString(),
    };

    return message;
  }

  private parseSegment(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let i = 0;

    while (i < line.length) {
      if (line[i] === '|') {
        fields.push(currentField);
        currentField = '';
        i++;
      } else {
        currentField += line[i];
        i++;
      }
    }
    fields.push(currentField);

    return fields;
  }

  private parseMshSegment(fields: string[]): Hl7MshSegment {
    return {
      sendingApplication: fields[2] || undefined,
      sendingFacility: fields[3] || undefined,
      receivingApplication: fields[4] || undefined,
      receivingFacility: fields[5] || undefined,
      messageDateTime: fields[6] || undefined,
      security: fields[7] || undefined,
      messageType: this.splitFirstComponent(fields[8]),
      messageTriggerEvent: this.splitSecondComponent(fields[8]),
      messageControlId: fields[9] || undefined,
      processingId: fields[10] || undefined,
      versionId: fields[11] || undefined,
      sequenceNumber: fields[12] || undefined,
      continuationPointer: fields[13] || undefined,
      acceptAcknowledgmentType: fields[14] || undefined,
      applicationAcknowledgmentType: fields[15] || undefined,
      countryCode: fields[16] || undefined,
      characterSet: fields[17] || undefined,
      principalLanguageOfMessage: fields[18] || undefined,
    };
  }

  private parsePidSegment(fields: string[]): Hl7PidSegment {
    return {
      setId: fields[1] || undefined,
      patientId: this.splitFirstComponent(fields[2]) || undefined,
      patientIdentifierList: fields[3] ? fields[3].split('~').filter(Boolean) : [],
      alternatePatientId: fields[4] || undefined,
      patientName: fields[5] || undefined,
      patientNameAlias: fields[6] || undefined,
      dateTimeOfBirth: fields[7] || undefined,
      administrativeSex: fields[8] || undefined,
      patientAlias: fields[9] || undefined,
      race: fields[10] || undefined,
      patientAddress: fields[11] || undefined,
      countyCode: fields[12] || undefined,
      phoneNumberHome: fields[13] || undefined,
      phoneNumberBusiness: fields[14] || undefined,
      primaryLanguage: fields[15] || undefined,
      maritalStatus: fields[16] || undefined,
      religion: fields[17] || undefined,
      patientAccountNumber: fields[18] || undefined,
      ssnNumberPatient: fields[19] || undefined,
      driversLicenseNumberPatient: fields[20] || undefined,
      mothersMaidenName: fields[21] || undefined,
      ethnicGroup: fields[22] || undefined,
      birthPlace: fields[23] || undefined,
      multipleBirthIndicator: fields[24] || undefined,
      birthOrder: fields[25] || undefined,
      citizenship: fields[26] || undefined,
      veteransMilitaryStatus: fields[27] || undefined,
      nationality: fields[28] || undefined,
      patientDeathDateAndTime: fields[29] || undefined,
      patientDeathIndicator: fields[30] || undefined,
      identityUnknownIndicator: fields[31] || undefined,
      identityReliabilityCode: fields[32] || undefined,
      lastUpdateDateTime: fields[33] || undefined,
    };
  }

  private parsePv1Segment(fields: string[]): Hl7Pv1Segment {
    return {
      setId: fields[1] || undefined,
      patientClass: fields[2] || undefined,
      assignedPatientLocation: fields[3] || undefined,
      admissionType: fields[4] || undefined,
      preAdmitNumber: fields[5] || undefined,
      priorPatientLocation: fields[6] || undefined,
      attendingDoctor: fields[7] || undefined,
      referringDoctor: fields[8] || undefined,
      consultingDoctor: fields[9] || undefined,
      hospitalService: fields[10] || undefined,
      temporaryLocation: fields[11] || undefined,
      preAdmitTestIndicator: fields[12] || undefined,
      readmissionIndicator: fields[13] || undefined,
      admitSource: fields[14] || undefined,
      ambulatoryStatus: fields[15] || undefined,
      vipIndicator: fields[16] || undefined,
      admittingDoctor: fields[17] || undefined,
      patientType: fields[18] || undefined,
      visitNumber: fields[19] || undefined,
      financialClass: fields[20] || undefined,
      chargePriceIndicator: fields[21] || undefined,
      courtesyCode: fields[22] || undefined,
      creditRating: fields[23] || undefined,
      contractCode: fields[24] || undefined,
      contractEffectiveDate: fields[25] || undefined,
      contractAmount: fields[26] || undefined,
      contractPeriod: fields[27] || undefined,
      interestCode: fields[28] || undefined,
      transferToBadDebtCode: fields[29] || undefined,
      transferToBadDebtDate: fields[30] || undefined,
      badDebtAgencyCode: fields[31] || undefined,
      badDebtTransferAmount: fields[32] || undefined,
      badDebtRecoveryAmount: fields[33] || undefined,
      deleteAccountIndicator: fields[34] || undefined,
      deleteAccountDate: fields[35] || undefined,
      dischargeDisposition: fields[36] || undefined,
      dischargedToLocation: fields[37] || undefined,
      dietType: fields[38] || undefined,
      servicingFacility: fields[39] || undefined,
      bedStatus: fields[40] || undefined,
      accountStatus: fields[41] || undefined,
      admissionDateTime: fields[44] || undefined,
      dischargeDateTime: fields[45] || undefined,
      currentPatientBalance: fields[46] || undefined,
      totalCharges: fields[47] || undefined,
      totalAdjustments: fields[48] || undefined,
      totalPayments: fields[49] || undefined,
      alternateVisitId: fields[50] || undefined,
      visitIndicator: fields[51] || undefined,
      otherHealthcareProvider: fields[52] || undefined,
    };
  }

  private splitFirstComponent(fieldValue: string): string {
    if (!fieldValue) return '';
    const parts = fieldValue.split('^');
    return parts[0] || '';
  }

  private splitSecondComponent(fieldValue: string): string {
    if (!fieldValue) return '';
    const parts = fieldValue.split('^');
    return parts[1] || '';
  }

  public determinePatientAccountStatus(message: Hl7Message): PatientAccountStatus {
    const messageTypeFull = message.messageTypeFull;
    const pv1 = message.pv1;

    if (!messageTypeFull && !pv1) {
      return PatientAccountStatus.REGISTERED;
    }

    switch (messageTypeFull) {
      case 'ADT^A01':
      case 'ADT^A04':
        return PatientAccountStatus.ACTIVE;

      case 'ADT^A02':
        return PatientAccountStatus.TRANSFERRED;

      case 'ADT^A03':
      case 'ADT^A13':
        return PatientAccountStatus.DISCHARGED;

      case 'ADT^A05':
        return PatientAccountStatus.PRE_ADMIT;

      case 'ADT^A08':
      case 'ADT^A28':
      case 'ADT^A31':
      case 'ADT^A40':
        if (pv1?.dischargeDateTime || pv1?.dischargeDisposition) {
          return PatientAccountStatus.DISCHARGED;
        }
        if (message.pid.patientDeathIndicator === 'Y') {
          return PatientAccountStatus.DECEASED;
        }
        if (pv1?.patientClass === PatientClass.INPATIENT) {
          return PatientAccountStatus.ACTIVE;
        }
        if (pv1?.patientClass === PatientClass.OUTPATIENT) {
          return PatientAccountStatus.REGISTERED;
        }
        return PatientAccountStatus.REGISTERED;

      case 'ADT^A11':
        return PatientAccountStatus.DISCHARGED;

      default:
        if (pv1?.dischargeDateTime) {
          return PatientAccountStatus.DISCHARGED;
        }
        if (message.pid.patientDeathIndicator === 'Y') {
          return PatientAccountStatus.DECEASED;
        }
        if (pv1?.patientClass === PatientClass.INPATIENT) {
          return PatientAccountStatus.ACTIVE;
        }
        return PatientAccountStatus.REGISTERED;
    }
  }

  public extractPatientId(message: Hl7Message): string {
    return message.pid.patientId || '';
  }

  public extractHospitalId(message: Hl7Message): string {
    const facility = message.msh.sendingFacility;
    if (facility) {
      return facility.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    return 'default';
  }

  public isValidAck(message: Hl7Message): boolean {
    return message.messageType === 'ACK';
  }
}
