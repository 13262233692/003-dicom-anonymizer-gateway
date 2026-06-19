import { AnonymizationRule, TagRule } from '@common/types/anonymization.types';
import { PatientState } from '@common/types/hl7.types';
export declare class AnonymizationRuleEnhancer {
    private readonly logger;
    enhanceRuleForPatient(baseRule: AnonymizationRule, patientState: PatientState | null): TagRule[];
    private applyHighSensitivityEnhancements;
    private applyVeryHighSensitivityEnhancements;
    private applyMaximumSensitivityEnhancements;
    private ensureTagAction;
    private isStrongerAction;
    private convertPatientSensitivityLevel;
    private sensitivityLevelCompare;
}
