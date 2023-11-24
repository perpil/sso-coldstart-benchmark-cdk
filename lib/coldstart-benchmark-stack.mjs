import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Stack, RemovalPolicy } from 'aws-cdk-lib';
const NAME = 'ColdstartBenchmark';
import { readFileSync } from 'fs';

export class ColdstartBenchmarkStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, 'logs', {
      retention: logs.RetentionDays.ONE_DAY,
      logGroupName: `/aws/lambda/${NAME}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // create a new Node.js Lambda function using NodeJsFunction
    const func = new NodejsFunction(this, NAME, {
      entry: 'src/index.js',
      functionName: NAME,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      bundling: {
        metafile: true, //uncomment to create the necessary metafile for https://esbuild.github.io/analyze/ to analyze the bundle
        minify: true,
        treeshake: true,
        target: 'esnext',
        format: 'esm',
        platform: 'node',
        mainFields: ['module', 'main'],
        outputFileExtension: '.mjs',
        externalModules: [],
        banner:
          "const require = (await import('node:module')).createRequire(import.meta.url);const __filename = (await import('node:url')).fileURLToPath(import.meta.url);const __dirname = (await import('node:path')).dirname(__filename);",
      },
      environment: {
        HAS_SSO:
          readFileSync(
            'node_modules/@aws-sdk/credential-provider-node/dist-es/defaultProvider.js'
          ).includes('SSO') + '',
      },
    });

    // add an alias to the lambda function
    const alias = new lambda.Alias(this, 'alias', {
      aliasName: 'prod',
      version: func.currentVersion,
    });

    // create an api gateway with a GET method that proxies requests to the lambda function
    const api = new apigateway.LambdaRestApi(this, 'api', {
      handler: alias,
      restApiName: 'Benchmark API',
      description: 'This Benchmark API is used to test cold start times.',
      deployOptions: {
        stageName: 'prod',
      },
      proxy: true,
    });
  }
}
