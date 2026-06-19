"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('app', () => ({
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    dicomScp: {
        port: parseInt(process.env.DICOM_SCP_PORT || '11112', 10),
        aeTitle: process.env.DICOM_SCP_AET || 'ANONYMIZER_GATEWAY',
        maxConnections: parseInt(process.env.DICOM_MAX_CONNECTIONS || '100', 10),
        connectionTimeout: parseInt(process.env.DICOM_CONNECTION_TIMEOUT || '30000', 10),
        requestTimeout: parseInt(process.env.DICOM_REQUEST_TIMEOUT || '60000', 10),
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'dicom:anonymizer:',
    },
    kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        clientId: process.env.KAFKA_CLIENT_ID || 'dicom-anonymizer-gateway',
        groupId: process.env.KAFKA_GROUP_ID || 'dicom-anonymizer-group',
        auditTopic: process.env.KAFKA_AUDIT_TOPIC || 'dicom-audit-log',
        sslEnabled: process.env.KAFKA_SSL_ENABLED === 'true',
        saslEnabled: process.env.KAFKA_SASL_ENABLED === 'true',
        saslMechanism: process.env.KAFKA_SASL_MECHANISM,
        saslUsername: process.env.KAFKA_SASL_USERNAME,
        saslPassword: process.env.KAFKA_SASL_PASSWORD,
    },
    defaultPacs: {
        host: process.env.PACS_DEFAULT_HOST || 'localhost',
        port: parseInt(process.env.PACS_DEFAULT_PORT || '11113', 10),
        aeTitle: process.env.PACS_DEFAULT_AET || 'PACS_SERVER',
    },
    hl7: {
        port: parseInt(process.env.HL7_MLLP_PORT || '2575', 10),
        host: process.env.HL7_MLLP_HOST || '0.0.0.0',
        maxConnections: parseInt(process.env.HL7_MAX_CONNECTIONS || '50', 10),
        connectionTimeout: parseInt(process.env.HL7_CONNECTION_TIMEOUT || '30000', 10),
        autoAcknowledge: process.env.HL7_AUTO_ACK !== 'false',
        defaultHospitalId: process.env.HL7_DEFAULT_HOSPITAL_ID || 'default',
    },
}));
//# sourceMappingURL=configuration.js.map