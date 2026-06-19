export declare enum Hl7MessageType {
    ADT_A01 = "ADT^A01",
    ADT_A02 = "ADT^A02",
    ADT_A03 = "ADT^A03",
    ADT_A04 = "ADT^A04",
    ADT_A05 = "ADT^A05",
    ADT_A08 = "ADT^A08",
    ADT_A11 = "ADT^A11",
    ADT_A13 = "ADT^A13",
    ADT_A28 = "ADT^A28",
    ADT_A31 = "ADT^A31",
    ADT_A40 = "ADT^A40",
    ORM_O01 = "ORM^O01",
    ORU_R01 = "ORU^R01",
    MDM_T01 = "MDM^T01"
}
export declare enum PatientClass {
    INPATIENT = "I",
    OUTPATIENT = "O",
    EMERGENCY = "E",
    DAY_CASE = "D",
    DISCHARGED = "D"
}
export declare enum PatientAccountStatus {
    ACTIVE = "active",
    DISCHARGED = "discharged",
    TRANSFERRED = "transferred",
    DECEASED = "deceased",
    PRE_ADMIT = "pre_admit",
    REGISTERED = "registered"
}
export interface Hl7MshSegment {
    sendingApplication?: string;
    sendingFacility?: string;
    receivingApplication?: string;
    receivingFacility?: string;
    messageDateTime?: string;
    security?: string;
    messageType?: string;
    messageTriggerEvent?: string;
    messageControlId?: string;
    processingId?: string;
    versionId?: string;
    sequenceNumber?: string;
    continuationPointer?: string;
    acceptAcknowledgmentType?: string;
    applicationAcknowledgmentType?: string;
    countryCode?: string;
    characterSet?: string;
    principalLanguageOfMessage?: string;
}
export interface Hl7PidSegment {
    setId?: string;
    patientId?: string;
    patientIdentifierList?: string[];
    alternatePatientId?: string;
    patientName?: string;
    patientNameAlias?: string;
    dateTimeOfBirth?: string;
    administrativeSex?: string;
    patientAlias?: string;
    race?: string;
    patientAddress?: string;
    countyCode?: string;
    phoneNumberHome?: string;
    phoneNumberBusiness?: string;
    primaryLanguage?: string;
    maritalStatus?: string;
    religion?: string;
    patientAccountNumber?: string;
    ssnNumberPatient?: string;
    driversLicenseNumberPatient?: string;
    mothersMaidenName?: string;
    ethnicGroup?: string;
    birthPlace?: string;
    multipleBirthIndicator?: string;
    birthOrder?: string;
    citizenship?: string;
    veteransMilitaryStatus?: string;
    nationality?: string;
    patientDeathDateAndTime?: string;
    patientDeathIndicator?: string;
    identityUnknownIndicator?: string;
    identityReliabilityCode?: string;
    lastUpdateDateTime?: string;
}
export interface Hl7Pv1Segment {
    setId?: string;
    patientClass?: string;
    assignedPatientLocation?: string;
    admissionType?: string;
    preAdmitNumber?: string;
    priorPatientLocation?: string;
    attendingDoctor?: string;
    referringDoctor?: string;
    consultingDoctor?: string;
    hospitalService?: string;
    temporaryLocation?: string;
    preAdmitTestIndicator?: string;
    readmissionIndicator?: string;
    admitSource?: string;
    ambulatoryStatus?: string;
    vipIndicator?: string;
    admittingDoctor?: string;
    patientType?: string;
    visitNumber?: string;
    financialClass?: string;
    chargePriceIndicator?: string;
    courtesyCode?: string;
    creditRating?: string;
    contractCode?: string;
    contractEffectiveDate?: string;
    contractAmount?: string;
    contractPeriod?: string;
    interestCode?: string;
    transferToBadDebtCode?: string;
    transferToBadDebtDate?: string;
    badDebtAgencyCode?: string;
    badDebtTransferAmount?: string;
    badDebtRecoveryAmount?: string;
    deleteAccountIndicator?: string;
    deleteAccountDate?: string;
    dischargeDisposition?: string;
    dischargedToLocation?: string;
    dietType?: string;
    servicingFacility?: string;
    bedStatus?: string;
    accountStatus?: string;
    admissionDateTime?: string;
    dischargeDateTime?: string;
    currentPatientBalance?: string;
    totalCharges?: string;
    totalAdjustments?: string;
    totalPayments?: string;
    alternateVisitId?: string;
    visitIndicator?: string;
    otherHealthcareProvider?: string;
}
export interface Hl7Message {
    rawMessage: string;
    messageType: string;
    triggerEvent: string;
    messageTypeFull: string;
    messageControlId?: string;
    msh: Hl7MshSegment;
    pid: Hl7PidSegment;
    pv1?: Hl7Pv1Segment;
    segments: Array<{
        name: string;
        fields: string[];
    }>;
    receivedAt: string;
    hospitalId?: string;
}
export interface PatientState {
    patientId: string;
    patientName?: string;
    alternatePatientId?: string;
    dateTimeOfBirth?: string;
    administrativeSex?: string;
    patientAddress?: string;
    phoneNumberHome?: string;
    phoneNumberBusiness?: string;
    maritalStatus?: string;
    religion?: string;
    patientAccountNumber?: string;
    ssnNumber?: string;
    ethnicGroup?: string;
    race?: string;
    citizenship?: string;
    nationality?: string;
    patientDeathIndicator?: string;
    patientDeathDateAndTime?: string;
    patientClass?: string;
    patientAccountStatus: PatientAccountStatus;
    admittingDoctor?: string;
    attendingDoctor?: string;
    referringDoctor?: string;
    hospitalService?: string;
    assignedPatientLocation?: string;
    visitNumber?: string;
    admissionDateTime?: string;
    dischargeDateTime?: string;
    dischargeDisposition?: string;
    lastUpdatedAt: string;
    lastMessageType?: string;
    lastMessageControlId?: string;
    hospitalId?: string;
    sensitivityLevel?: PatientSensitivityLevel;
}
export declare enum PatientSensitivityLevel {
    NORMAL = "normal",
    HIGH = "high",
    VERY_HIGH = "very_high",
    MAXIMUM = "maximum"
}
export declare enum Hl7EventType {
    MESSAGE_RECEIVED = "hl7_message_received",
    PATIENT_UPDATED = "patient_updated",
    PATIENT_DISCHARGED = "patient_discharged",
    PATIENT_ADMITTED = "patient_admitted",
    PATIENT_TRANSFERRED = "patient_transferred"
}
export interface Hl7Event {
    type: Hl7EventType;
    patientId?: string;
    message?: Hl7Message;
    patientState?: PatientState;
    timestamp: string;
    hospitalId?: string;
}
