import { registerAs } from '@nestjs/config';

export interface DicomScpConfig {
  port: number;
  aeTitle: string;
  maxConnections: number;
  connectionTimeout: number;
  requestTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  auditTopic: string;
  sslEnabled: boolean;
  saslEnabled: boolean;
  saslMechanism?: string;
  saslUsername?: string;
  saslPassword?: string;
}

export interface PacsTargetConfig {
  host: string;
  port: number;
  aeTitle: string;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  dicomScp: DicomScpConfig;
  redis: RedisConfig;
  kafka: KafkaConfig;
  defaultPacs: PacsTargetConfig;
}

export default registerAs(
  'app',
  (): AppConfig => ({
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
  }),
);
