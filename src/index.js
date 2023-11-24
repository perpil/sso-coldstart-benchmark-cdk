import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

const stsClient = new STSClient({
  region: process.env.AWS_REGION,
});

const HAS_SSO = process.env.HAS_SSO === 'true';
const fileSize = require('fs').statSync(__filename).size / 1024;

export async function handler(event, context) {
  let success = true;
  let log = {};
  log.fileSize = fileSize;
  log.hasSSO = HAS_SSO;
  log.requestId = context.awsRequestId;

  try {
    const result = await stsClient.send(new GetCallerIdentityCommand({}));
    return getResponse(
      200,
      'My name is Inigo Montoyo, you killed my father, prepare to die.',
      context
    );
  } catch (err) {
    console.error('Inconceivable! I failed to issue my threat!', err);
    success = false;
    return getResponse(500, err.message, context);
  } finally {
    log.success = success ? 1 : 0;
    console.info(JSON.stringify(log));
  }
}

function getResponse(code, message, context) {
  return {
    statusCode: code,
    body: JSON.stringify({
      message,
      requestId: context.awsRequestId,
      hasSSO: HAS_SSO,
      fileSize,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
}
