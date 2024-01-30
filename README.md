# Overview

This benchmarks the impact of removing the unnecessary credential providers (like SSO) from `credential-provider-node` in a Lambda function minified and tree-shaken with esbuild. Removing SSO reduces coldstarts by 39 ms and filesize by 43.7 KB. Compared to using the on disk versions removing SSO reduces coldstarts by 335 ms.

## With 3.454 / Node 18.x

---

| @initDuration | hasSSO        | minifiedSize (KB) |
| ------------- | ------------- | ----------------- |
| 242.89        | yes           | 174.8164          |
| 203.32        | no            | 131.1631          |
| 538.29        | yes from disk | 140.7314          |

---

## With 3.499 / Node 20.x (1/25/2024)

Removing SSO reduces coldstarts by 27 ms and filesize by 61 KB. Compared to using the on disk versions removing SSO reduces coldstarts by 312 ms.
What's strange about this is I would expect the yes from disk to have the same coldstart as the yes case. If lazy loading is working correctly, it shouldn't be loading any of the SSO packages from disk, but it is still taking longer.

---

| @initDuration | hasSSO        | minifiedSize (KB) |
| ------------- | ------------- | ----------------- |
| 204.67        | yes           | 196.5332          |
| 177.73        | no            | 135.3945          |
| 489.65        | yes from disk | 148.5938          |

---

---

## With 3.502 / Node 20.x (1/29/2024)

The default provider bundled with the SSO packages marked as external cold start time is now on par with the patched provider with only fromEnv.
More packages can probably be marked as external with the default provider because the patched package results in a 43KB smaller bundle. That likely means in the patched package things like IMDS are omitted via tree shaking. The default provider bundled with SSO and no packages marked as external results in a 28 ms increase in cold start time and a 92KB increase in bundle size.

---

| @initDuration | hasSSO        | minifiedSize (KB) |
| ------------- | ------------- | ----------------- |
| 226.35        | yes           | 215.5693          |
| 192.63        | no            | 123.7324          |
| 190.95        | yes from disk | 166.6426          |

---

# Setup

```
npm install
```

# Code

All the code does is instantiate an STS client and call `getCallerIdentity`. Using any AWS client pulls in the SSO packages unless you patch the `credentials-provider-node` package. When you patch the package, it replaces the defaultProvider with the following code.

```javascript
import {
  chain,
  CredentialsProviderError,
  memoize,
} from '@smithy/property-provider';
export const defaultProvider = (init = {}) =>
  memoize(
    chain(
      async () => {
        init.logger?.debug(
          '@aws-sdk/credential-provider-node',
          'defaultProvider::fromEnv'
        );
        const { fromEnv } = await import('@aws-sdk/credential-provider-env');
        return fromEnv(init)();
      },
      async () => {
        throw new CredentialsProviderError(
          'Could not load credentials from any providers',
          false
        );
      }
    ),
    credentialsTreatedAsExpired,
    credentialsWillNeedRefresh
  );
export const credentialsWillNeedRefresh = (credentials) =>
  credentials?.expiration !== undefined;
export const credentialsTreatedAsExpired = (credentials) =>
  credentials?.expiration !== undefined &&
  credentials.expiration.getTime() - Date.now() < 300000;
```

This removes the unnecessary SSO provider and others from the credentials provider chain so these packages aren't included in the bundle and can be tree-shaken out.

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

If you've never done anything, SSO will be enabled.

## Removing SSO

To remove SSO, run the following command.

```
npm run removeSSO
```

Then follow the instructions for [Running a coldstart](#running-a-coldstart) above

## Reenabling SSO

To re-enable SSO, run the following command.

```
npm run addSSO
```

Then follow the instructions for [Running a coldstart](#running-a-coldstart) above

## Loading SSO from disk

With SSO enabled, modify `externalModules` in the [cdk stack](lib/coldstart-benchmark-stack.mjs) to:

```javascript
externalModules: [
  '@aws-sdk/client-sso',
  '@aws-sdk/token-providers',
  '@aws-sdk/credential-provider-sso',
];
```

This will exclude those packages from the bundle and load them from disk.

Then follow the instructions for [Running a coldstart](#running-a-coldstart) above

# Seeing the results

To see the results, run the following CloudWatch Insights query on the LogGroup: `/aws/lambda/ColdstartBenchmark`.

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
