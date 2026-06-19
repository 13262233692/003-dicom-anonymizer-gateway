import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Subject, Observable } from 'rxjs';
import { REDIS_CLIENT } from '@redis/redis.module';
import {
  PatientState,
  PatientAccountStatus,
  PatientSensitivityLevel,
  Hl7Message,
  Hl7Event,
  Hl7EventType,
} from '@common/types/hl7.types';
import { Hl7ParserService } from './hl7-parser.service';

@Injectable()
export class PatientStateService implements OnModuleInit {
  private readonly logger = new Logger(PatientStateService.name);
  private readonly PATIENT_STATE_KEY_PREFIX = 'patient:state';
  private readonly PATIENT_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

  private readonly patientUpdatedSubject = new Subject<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }>();

  private readonly patientDischargedSubject = new Subject<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }>();

  private readonly patientAdmittedSubject = new Subject<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly hl7Parser: Hl7ParserService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Patient state service initialized');
  }

  get patientUpdated$(): Observable<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }> {
    return this.patientUpdatedSubject.asObservable();
  }

  get patientDischarged$(): Observable<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }> {
    return this.patientDischargedSubject.asObservable();
  }

  get patientAdmitted$(): Observable<{
    patientId: string;
    patientState: PatientState;
    hospitalId?: string;
  }> {
    return this.patientAdmittedSubject.asObservable();
  }

  public async processHl7Message(message: Hl7Message): Promise<PatientState> {
    const hospitalId = this.hl7Parser.extractHospitalId(message);
    const patientId = message.pid.patientId;

    if (!patientId) {
      throw new Error('Patient ID not found in HL7 message');
    }

    this.logger.debug(
      `Processing HL7 message for patient ${patientId}: ${message.messageTypeFull}`,
    );

    const existingState = await this.getPatientState(patientId, hospitalId);
    const newState = this.mergeHl7MessageToState(existingState, message, hospitalId);

    await this.savePatientState(patientId, newState, hospitalId);

    const eventPayload = { patientId, patientState: newState, hospitalId };

    this.patientUpdatedSubject.next(eventPayload);

    const accountStatus = newState.patientAccountStatus;

    if (
      accountStatus === PatientAccountStatus.DISCHARGED ||
      accountStatus === PatientAccountStatus.DECEASED
    ) {
      this.patientDischargedSubject.next(eventPayload);
    } else if (accountStatus === PatientAccountStatus.ACTIVE) {
      this.patientAdmittedSubject.next(eventPayload);
    }

    this.logger.log(
      `Patient state updated: ${patientId}, status=${accountStatus}, sensitivity=${newState.sensitivityLevel}`,
    );

    return newState;
  }

  private mergeHl7MessageToState(
    existingState: PatientState | null,
    message: Hl7Message,
    hospitalId: string,
  ): PatientState {
    const accountStatus = this.hl7Parser.determinePatientAccountStatus(message);
    const sensitivityLevel = this.determineSensitivityLevel(message, accountStatus);

    const pid = message.pid;
    const pv1 = message.pv1;

    const baseState: PatientState = existingState || {
      patientId: pid.patientId || '',
      patientAccountStatus: PatientAccountStatus.REGISTERED,
      lastUpdatedAt: new Date().toISOString(),
      sensitivityLevel: PatientSensitivityLevel.NORMAL,
    };

    const merged: PatientState = {
      ...baseState,
      patientId: pid.patientId || baseState.patientId,
      patientName: pid.patientName || baseState.patientName,
      alternatePatientId: pid.alternatePatientId || baseState.alternatePatientId,
      dateTimeOfBirth: pid.dateTimeOfBirth || baseState.dateTimeOfBirth,
      administrativeSex: pid.administrativeSex || baseState.administrativeSex,
      patientAddress: pid.patientAddress || baseState.patientAddress,
      phoneNumberHome: pid.phoneNumberHome || baseState.phoneNumberHome,
      phoneNumberBusiness: pid.phoneNumberBusiness || baseState.phoneNumberBusiness,
      maritalStatus: pid.maritalStatus || baseState.maritalStatus,
      religion: pid.religion || baseState.religion,
      patientAccountNumber: pid.patientAccountNumber || baseState.patientAccountNumber,
      ssnNumber: pid.ssnNumberPatient || baseState.ssnNumber,
      ethnicGroup: pid.ethnicGroup || baseState.ethnicGroup,
      race: pid.race || baseState.race,
      citizenship: pid.citizenship || baseState.citizenship,
      nationality: pid.nationality || baseState.nationality,
      patientDeathIndicator: pid.patientDeathIndicator || baseState.patientDeathIndicator,
      patientDeathDateAndTime: pid.patientDeathDateAndTime || baseState.patientDeathDateAndTime,
      patientClass: pv1?.patientClass || baseState.patientClass,
      patientAccountStatus: accountStatus,
      admittingDoctor: pv1?.admittingDoctor || baseState.admittingDoctor,
      attendingDoctor: pv1?.attendingDoctor || baseState.attendingDoctor,
      referringDoctor: pv1?.referringDoctor || baseState.referringDoctor,
      hospitalService: pv1?.hospitalService || baseState.hospitalService,
      assignedPatientLocation: pv1?.assignedPatientLocation || baseState.assignedPatientLocation,
      visitNumber: pv1?.visitNumber || baseState.visitNumber,
      admissionDateTime: pv1?.admissionDateTime || baseState.admissionDateTime,
      dischargeDateTime: pv1?.dischargeDateTime || baseState.dischargeDateTime,
      dischargeDisposition: pv1?.dischargeDisposition || baseState.dischargeDisposition,
      lastUpdatedAt: new Date().toISOString(),
      lastMessageType: message.messageTypeFull,
      lastMessageControlId: message.messageControlId,
      hospitalId,
      sensitivityLevel,
    };

    return merged;
  }

  private determineSensitivityLevel(
    message: Hl7Message,
    accountStatus: PatientAccountStatus,
  ): PatientSensitivityLevel {
    if (message.pid.patientDeathIndicator === 'Y' || accountStatus === PatientAccountStatus.DECEASED) {
      return PatientSensitivityLevel.MAXIMUM;
    }

    if (accountStatus === PatientAccountStatus.DISCHARGED) {
      return PatientSensitivityLevel.VERY_HIGH;
    }

    if (message.pv1?.vipIndicator === 'Y' || message.pv1?.vipIndicator === '1') {
      return PatientSensitivityLevel.HIGH;
    }

    const messageType = message.messageTypeFull;
    const highSensitivityTypes = ['ADT^A28', 'ADT^A31', 'ADT^A40'];
    if (highSensitivityTypes.includes(messageType)) {
      return PatientSensitivityLevel.HIGH;
    }

    return PatientSensitivityLevel.NORMAL;
  }

  public async getPatientState(
    patientId: string,
    hospitalId?: string,
  ): Promise<PatientState | null> {
    const key = this.buildPatientStateKey(patientId, hospitalId);

    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as PatientState;
    } catch (error) {
      this.logger.error(`Failed to get patient state for ${patientId}: ${error.message}`);
      return null;
    }
  }

  public async savePatientState(
    patientId: string,
    state: PatientState,
    hospitalId?: string,
  ): Promise<void> {
    const key = this.buildPatientStateKey(patientId, hospitalId);

    try {
      await this.redis.set(key, JSON.stringify(state), 'EX', this.PATIENT_STATE_TTL_SECONDS);
      this.logger.debug(`Patient state saved for ${patientId}`);
    } catch (error) {
      this.logger.error(`Failed to save patient state for ${patientId}: ${error.message}`);
    }
  }

  public async getSensitivityLevel(
    patientId: string,
    hospitalId?: string,
  ): Promise<PatientSensitivityLevel> {
    const state = await this.getPatientState(patientId, hospitalId);
    return state?.sensitivityLevel || PatientSensitivityLevel.NORMAL;
  }

  public async isPatientDischarged(
    patientId: string,
    hospitalId?: string,
  ): Promise<boolean> {
    const state = await this.getPatientState(patientId, hospitalId);
    if (!state) return false;
    return (
      state.patientAccountStatus === PatientAccountStatus.DISCHARGED ||
      state.patientAccountStatus === PatientAccountStatus.DECEASED
    );
  }

  public async getPatientAccountStatus(
    patientId: string,
    hospitalId?: string,
  ): Promise<PatientAccountStatus> {
    const state = await this.getPatientState(patientId, hospitalId);
    return state?.patientAccountStatus || PatientAccountStatus.REGISTERED;
  }

  public async processHl7Event(event: Hl7Event): Promise<PatientState | null> {
    if (event.type === Hl7EventType.MESSAGE_RECEIVED && event.message) {
      return this.processHl7Message(event.message);
    }
    return null;
  }

  private buildPatientStateKey(patientId: string, hospitalId?: string): string {
    if (hospitalId) {
      return `${this.PATIENT_STATE_KEY_PREFIX}:${hospitalId}:${patientId}`;
    }
    return `${this.PATIENT_STATE_KEY_PREFIX}:default:${patientId}`;
  }

  public async deletePatientState(
    patientId: string,
    hospitalId?: string,
  ): Promise<boolean> {
    const key = this.buildPatientStateKey(patientId, hospitalId);
    const deleted = await this.redis.del(key);
    return deleted > 0;
  }
}
