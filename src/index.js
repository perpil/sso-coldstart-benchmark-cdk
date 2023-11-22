const startImport = Date.now();
const fs = require('fs');
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Logger } from '@aws-lambda-powertools/logger';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

const logger = new Logger();

const metrics = new Metrics({
  namespace: 'api',
});

const tracer = new Tracer();

const stsClient = tracer.captureAWSv3Client(
  new STSClient({ region: process.env.AWS_REGION })
);

const importDuration = Date.now() - startImport;

function getIds(context) {
  const traceId = tracer.getRootXrayTraceId()
    ? { traceId: tracer.getRootXrayTraceId() }
    : {};
  return { ...traceId, requestId: context.awsRequestId };
}
const HAS_SSO = process.env.HAS_SSO === 'true';
const HAS_POWER_TOOLS = process.env.HAS_POWER_TOOLS === 'true';

export async function handler(event, context) {
  const handlerSegment = tracer.getSegment()?.addNewSubsegment('### handler');
  handlerSegment && tracer.setSegment(handlerSegment);
  let success = true;
  let coldStartImportInit = tracer.isColdStart()
    ? { coldStartImportInit: importDuration }
    : {};
  let fileSize = fs.statSync(__filename).size / 1024;
  metrics.addMetadata('fileSize', fileSize);
  tracer.putMetadata('fileSize', fileSize);
  metrics.addMetadata('hasSSO', HAS_SSO);
  tracer.putMetadata('hasSSO', HAS_SSO);
  const message =
    'Hello. My name is Inigo Montoya. You killed my father. Prepare to die.';
  let stsCallDuration = Date.now();
  try {
    const result = await stsClient.send(new GetCallerIdentityCommand({}));
    stsCallDuration = Date.now() - stsCallDuration;
    logger.info(`Issuing the following statement: ${message}`, {
      stsCallDuration,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        message,
        callerIdentity: result,
        ...getIds(context),
        ...coldStartImportInit,
        stsCallDuration,
        hasSSO: HAS_SSO,
        hasPowerTools: HAS_POWER_TOOLS,
        fileSize,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (err) {
    logger.error('Inconceivable! I failed to issue my threat!', err);
    success = false;
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: err.message,
        ...getIds(context),
        ...coldStartImportInit,
        stsCallDuration,
        hasSSO: HAS_SSO,
        hasPowerTools: HAS_POWER_TOOLS,
        fileSize,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } finally {
    metrics.addMetadata('requestId', context.awsRequestId);
    metrics.addMetadata('callDuration', stsCallDuration);
    metrics.addMetadata('hasPowerTools', HAS_POWER_TOOLS);
    metrics.addMetadata('hasSSO', HAS_SSO);
    tracer.putMetadata('hasPowerTools', HAS_POWER_TOOLS);
    tracer.putMetadata('hasSSO', HAS_SSO);

    if (tracer.isColdStart()) {
      metrics.addMetadata('coldStartImportInit', importDuration);
      tracer.putMetadata('coldStartImportInit', importDuration);
    }
    metrics.addMetadata('xrayId', tracer.getRootXrayTraceId());
    metrics.addMetric('success', success ? 1 : 0, MetricUnits.Count);
    handlerSegment?.close();
    handlerSegment && tracer.setSegment(handlerSegment?.parent);
    metrics.publishStoredMetrics();
  }
}
