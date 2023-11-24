# Overview

This benchmarks the impact of removing the SSO packages from a Lambda function minified and tree-shaken with esbuild. Removing SSO reduces coldstarts by 39 ms and filesize by 43.7 KB.

---

| @initDuration | hasSSO | minifiedSize (KB) |
| ------------- | ------ | ----------------- |
| 242.89        | 1      | 174.8164          |
| 203.32        | 0      | 131.1631          |

---

# Setup

```
npm install
```

# Code

All the code does is instantiate an STS client and call `getCallerIdentity`. Using any AWS client pulls in the SSO packages unless you patch the `credentials-provider-node` package. When you patch the package, it replaces the defaultProvider with the following code.

```javascript
import { fromEnv } from '@aws-sdk/credential-provider-env';
import {
  chain,
  CredentialsProviderError,
  memoize,
} from '@smithy/property-provider';
export const defaultProvider = (init = {}) =>
  memoize(
    chain(...[fromEnv()], async () => {
      throw new CredentialsProviderError(
        'Could not load credentials from any providers',
        false
      );
    }),
    (credentials) =>
      credentials.expiration !== undefined &&
      credentials.expiration.getTime() - Date.now() < 300000,
    (credentials) => credentials.expiration !== undefined
  );
```

This removes the unnecessary SSO provider and others from the credentials provider chain so these packages aren't loaded.

# Running a coldstart

If you've never run cdk before, run cdk bootstrap first. This is only necessary to run once.

```
cdk bootstrap
```

Then run the following to deploy the stack.

```
cdk synth
cdk deploy
```

To invoke, hit the url in the output.

# Toggling SSO

If you've never done anything, SSO will be enabled. To remove SSO, run the following command.

```
npm run removeSSO
```

To re-enable SSO, run the following command.

```
npm run addSSO
```

Then follow the instructions for [Running a coldstart](#running-a-coldstart) above

# Seeing the results

To see the results, run the following CloudWatch Insights query.

```

filter ispresent(requestId) or ispresent(@requestId) |
parse @logStream '[*]' as @lambdaVersion |
stats max(@initDuration), max(hasSSO) as SSO, max(fileSize) as minifiedSize by @lambdaVersion

```

Or if you're logged in to the console use this link, change your region in the dropdown and click `Run query`:
[CloudWatch](<https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'filter*20ispresent*28requestId*29*20or*20ispresent*28*40requestId*29*20*7c*0aparse*20*40logStream*20*27*5b*2a*5d*27*20as*20*40lambdaVersion*20*7c*0astats*20max*28*40initDuration*29*2c*20max*28hasSSO*29*20as*20SSO*2c*20max*28fileSize*29*20as*20minifiedSize*20by*20*40lambdaVersion~queryId~'66fa9fd4337abeb9-f7f9c8fe-4cf97e9-1d22777f-5bdbe896787d5d8ff1e2076~source~(~'arn*3aaws*3alogs*3aus-west-2*3a320877393516*3alog-group*3a*2faws*2flambda*2fColdstartBenchmark))>)

# Running locally

This requires the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) and [Docker](https://docs.docker.com/get-docker/).

There isn't much reason to run locally unless you are modifying the benchmark code.

```

sam local invoke -t ./cdk.out/ColdstartBenchmarkStack.template.json ColdstartBenchmark

```

# Tearing down the stack

```

cdk destroy

```
