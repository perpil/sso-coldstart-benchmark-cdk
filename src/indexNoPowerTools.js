const startImport = Date.now();
let coldStart = true;
const fs = require('fs');
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

const stsClient = new STSClient({
  region: process.env.AWS_REGION,
});

const importDuration = Date.now() - startImport;
const HAS_SSO = process.env.HAS_SSO === 'true';
const HAS_POWER_TOOLS = process.env.HAS_POWER_TOOLS === 'true';

export async function handler(event, context) {
  let success = true;
  let coldStartImportInit = coldStart
    ? { coldStartImportInit: importDuration }
    : {};
  let fileSize = fs.statSync(__filename).size / 1024;
  let log = {};
  log.fileSize = fileSize;
  log.hasSSO = HAS_SSO;
  log.hasPowerTools = HAS_POWER_TOOLS;
  log.requestId = context.awsRequestId;
  const message =
    'Hello. My name is Inigo Montoya. You killed my father. Prepare to die.';
  let stsCallDuration = Date.now();
  try {
    const result = await stsClient.send(new GetCallerIdentityCommand({}));
    stsCallDuration = Date.now() - stsCallDuration;
    return {
      statusCode: 200,
      body: JSON.stringify({
        message,
        callerIdentity: result,
        requestId: context.awsRequestId,
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
        requestId: context.awsRequestId,
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
    log.callDuration = stsCallDuration;
    log.success = success ? 1 : 0;
    console.info(JSON.stringify(log));
  }
}
