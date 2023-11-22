# Overview

This benchmarks the impact of removing the SSO packages (which shouldn't be used) from a Lambda function minified and tree-shaken with esbuild. Surprisingly, removing the SSO packages increases the coldstart by ~270 ms! [The CDK package](coldstart-benchmark-stack.mjs) creates an API Gateway that invokes a lambda that instantiates a STS client and calls `getCallerIdentity`.

Here were the results of the benchmark with SSO omitted and included and with and without powertools:

| initDuration | SSO      | powerTools | minifiedSize (KB) |
| ------------ | -------- | ---------- | ----------------- |
| 510.8        | omitted  | off        | 141.1035          |
| 239.68       | included | off        | 175.1885          |
| 578.52       | omitted  | on         | 307.3438          |
| 288          | included | on         | 341.46            |

These are the packages that it removes when you turn off SSO:

```
@aws-sdk/token-providers
@aws-sdk/client-sso
@aws-sdk/credential-provider-sso
```

# Setup

```
npm install
```

# Code

There are 2 files, one is deployed when you have powertools and tracing turned on: [src/index.js](src/index.js) and one when you turn powertools and tracing off: [src/indexNoPowerTools/index.js](src/indexNoPowerTools/index.js)

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

# Toggling SSO and PowerTools

[Modify cdk.json](cdk.json)

i.e. To leave SSO in and turn off powertools:

```
    "coldstart-benchmark:includeSSO": true,
    "coldstart-benchmark:usePowerTools": false,
```

Then follow the instructions for [Running a coldstart](#running-a-coldstart) above

# Seeing the results

To see the results, run the following CloudWatch Insights query.

```
filter ispresent(requestId) or ispresent(@requestId) |
parse @logStream '[*]' as @lambdaVersion |
stats max(@initDuration) as initDuration, max(hasSSO) as SSO, max(hasPowerTools) as powerTools,max(fileSize) as minifiedSize by @lambdaVersion
```

Or if you're logged in to the console use this link, change your region in the dropdown and click `Run query`:
[CloudWatch](<https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'filter*20ispresent*28requestId*29*20or*20ispresent*28*40requestId*29*20*7c*0aparse*20*40logStream*20*27*5b*2a*5d*27*20as*20*40lambdaVersion*20*7c*0astats*20max*28*40initDuration*29*20as*20initDuration*2c*20max*28hasSSO*29*20as*20SSO*2c*20max*28hasPowerTools*29*20as*20powerTools*2cmax*28fileSize*29*20as*20minifiedSize*20by*20*40lambdaVersion*0a~queryId~'43f1c5cc18887b6-6071fc12-4d41bc0-ca53b84c-e1d8da8888803a8d831f19b~source~(~'*2faws*2flambda*2fColdstartBenchmark))>)

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
