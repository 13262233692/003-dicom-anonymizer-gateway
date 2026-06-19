"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PatientStateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientStateService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const rxjs_1 = require("rxjs");
const redis_module_1 = require("../redis/redis.module");
const hl7_types_1 = require("../common/types/hl7.types");
const hl7_parser_service_1 = require("./hl7-parser.service");
let PatientStateService = PatientStateService_1 = class PatientStateService {
    constructor(redis, hl7Parser) {
        this.redis = redis;
        this.hl7Parser = hl7Parser;
        this.logger = new common_1.Logger(PatientStateService_1.name);
        this.PATIENT_STATE_KEY_PREFIX = 'patient:state';
        this.PATIENT_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
        this.patientUpdatedSubject = new rxjs_1.Subject();
        this.patientDischargedSubject = new rxjs_1.Subject();
        this.patientAdmittedSubject = new rxjs_1.Subject();
    }
    onModuleInit() {
        this.logger.log('Patient state service initialized');
    }
    get patientUpdated$() {
        return this.patientUpdatedSubject.asObservable();
    }
    get patientDischarged$() {
        return this.patientDischargedSubject.asObservable();
    }
    get patientAdmitted$() {
        return this.patientAdmittedSubject.asObservable();
    }
    async processHl7Message(message) {
        const hospitalId = this.hl7Parser.extractHospitalId(message);
        const patientId = message.pid.patientId;
        if (!patientId) {
            throw new Error('Patient ID not found in HL7 message');
        }
        this.logger.debug(`Processing HL7 message for patient ${patientId}: ${message.messageTypeFull}`);
        const existingState = await this.getPatientState(patientId, hospitalId);
        const newState = this.mergeHl7MessageToState(existingState, message, hospitalId);
        await this.savePatientState(patientId, newState, hospitalId);
        const eventPayload = { patientId, patientState: newState, hospitalId };
        this.patientUpdatedSubject.next(eventPayload);
        const accountStatus = newState.patientAccountStatus;
        if (accountStatus === hl7_types_1.PatientAccountStatus.DISCHARGED ||
            accountStatus === hl7_types_1.PatientAccountStatus.DECEASED) {
            this.patientDischargedSubject.next(eventPayload);
        }
        else if (accountStatus === hl7_types_1.PatientAccountStatus.ACTIVE) {
            this.patientAdmittedSubject.next(eventPayload);
        }
        this.logger.log(`Patient state updated: ${patientId}, status=${accountStatus}, sensitivity=${newState.sensitivityLevel}`);
        return newState;
    }
    mergeHl7MessageToState(existingState, message, hospitalId) {
        const accountStatus = this.hl7Parser.determinePatientAccountStatus(message);
        const sensitivityLevel = this.determineSensitivityLevel(message, accountStatus);
        const pid = message.pid;
        const pv1 = message.pv1;
        const baseState = existingState || {
            patientId: pid.patientId || '',
            patientAccountStatus: hl7_types_1.PatientAccountStatus.REGISTERED,
            lastUpdatedAt: new Date().toISOString(),
            sensitivityLevel: hl7_types_1.PatientSensitivityLevel.NORMAL,
        };
        const merged = {
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
    determineSensitivityLevel(message, accountStatus) {
        if (message.pid.patientDeathIndicator === 'Y' || accountStatus === hl7_types_1.PatientAccountStatus.DECEASED) {
            return hl7_types_1.PatientSensitivityLevel.MAXIMUM;
        }
        if (accountStatus === hl7_types_1.PatientAccountStatus.DISCHARGED) {
            return hl7_types_1.PatientSensitivityLevel.VERY_HIGH;
        }
        if (message.pv1?.vipIndicator === 'Y' || message.pv1?.vipIndicator === '1') {
            return hl7_types_1.PatientSensitivityLevel.HIGH;
        }
        const messageType = message.messageTypeFull;
        const highSensitivityTypes = ['ADT^A28', 'ADT^A31', 'ADT^A40'];
        if (highSensitivityTypes.includes(messageType)) {
            return hl7_types_1.PatientSensitivityLevel.HIGH;
        }
        return hl7_types_1.PatientSensitivityLevel.NORMAL;
    }
    async getPatientState(patientId, hospitalId) {
        const key = this.buildPatientStateKey(patientId, hospitalId);
        try {
            const data = await this.redis.get(key);
            if (!data)
                return null;
            return JSON.parse(data);
        }
        catch (error) {
            this.logger.error(`Failed to get patient state for ${patientId}: ${error.message}`);
            return null;
        }
    }
    async savePatientState(patientId, state, hospitalId) {
        const key = this.buildPatientStateKey(patientId, hospitalId);
        try {
            await this.redis.set(key, JSON.stringify(state), 'EX', this.PATIENT_STATE_TTL_SECONDS);
            this.logger.debug(`Patient state saved for ${patientId}`);
        }
        catch (error) {
            this.logger.error(`Failed to save patient state for ${patientId}: ${error.message}`);
        }
    }
    async getSensitivityLevel(patientId, hospitalId) {
        const state = await this.getPatientState(patientId, hospitalId);
        return state?.sensitivityLevel || hl7_types_1.PatientSensitivityLevel.NORMAL;
    }
    async isPatientDischarged(patientId, hospitalId) {
        const state = await this.getPatientState(patientId, hospitalId);
        if (!state)
            return false;
        return (state.patientAccountStatus === hl7_types_1.PatientAccountStatus.DISCHARGED ||
            state.patientAccountStatus === hl7_types_1.PatientAccountStatus.DECEASED);
    }
    async getPatientAccountStatus(patientId, hospitalId) {
        const state = await this.getPatientState(patientId, hospitalId);
        return state?.patientAccountStatus || hl7_types_1.PatientAccountStatus.REGISTERED;
    }
    async processHl7Event(event) {
        if (event.type === hl7_types_1.Hl7EventType.MESSAGE_RECEIVED && event.message) {
            return this.processHl7Message(event.message);
        }
        return null;
    }
    buildPatientStateKey(patientId, hospitalId) {
        if (hospitalId) {
            return `${this.PATIENT_STATE_KEY_PREFIX}:${hospitalId}:${patientId}`;
        }
        return `${this.PATIENT_STATE_KEY_PREFIX}:default:${patientId}`;
    }
    async deletePatientState(patientId, hospitalId) {
        const key = this.buildPatientStateKey(patientId, hospitalId);
        const deleted = await this.redis.del(key);
        return deleted > 0;
    }
};
exports.PatientStateService = PatientStateService;
exports.PatientStateService = PatientStateService = PatientStateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default,
        hl7_parser_service_1.Hl7ParserService])
], PatientStateService);
//# sourceMappingURL=patient-state.service.js.map