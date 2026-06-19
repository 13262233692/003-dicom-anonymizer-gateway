import { OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { PatientState, PatientAccountStatus, PatientSensitivityLevel, Hl7Message, Hl7Event } from '@common/types/hl7.types';
import { Hl7ParserService } from './hl7-parser.service';
export declare class PatientStateService implements OnModuleInit {
    private readonly redis;
    private readonly hl7Parser;
    private readonly logger;
    private readonly PATIENT_STATE_KEY_PREFIX;
    private readonly PATIENT_STATE_TTL_SECONDS;
    private readonly patientUpdatedSubject;
    private readonly patientDischargedSubject;
    private readonly patientAdmittedSubject;
    constructor(redis: Redis, hl7Parser: Hl7ParserService);
    onModuleInit(): void;
    get patientUpdated$(): Observable<{
        patientId: string;
        patientState: PatientState;
        hospitalId?: string;
    }>;
    get patientDischarged$(): Observable<{
        patientId: string;
        patientState: PatientState;
        hospitalId?: string;
    }>;
    get patientAdmitted$(): Observable<{
        patientId: string;
        patientState: PatientState;
        hospitalId?: string;
    }>;
    processHl7Message(message: Hl7Message): Promise<PatientState>;
    private mergeHl7MessageToState;
    private determineSensitivityLevel;
    getPatientState(patientId: string, hospitalId?: string): Promise<PatientState | null>;
    savePatientState(patientId: string, state: PatientState, hospitalId?: string): Promise<void>;
    getSensitivityLevel(patientId: string, hospitalId?: string): Promise<PatientSensitivityLevel>;
    isPatientDischarged(patientId: string, hospitalId?: string): Promise<boolean>;
    getPatientAccountStatus(patientId: string, hospitalId?: string): Promise<PatientAccountStatus>;
    processHl7Event(event: Hl7Event): Promise<PatientState | null>;
    private buildPatientStateKey;
    deletePatientState(patientId: string, hospitalId?: string): Promise<boolean>;
}
