import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Stack, RemovalPolicy } from 'aws-cdk-lib';
const NAME = 'ColdstartBenchmark';

export class ColdstartBenchmarkStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const includeSSO = this.node.tryGetContext(
      'coldstart-benchmark:includeSSO'
    );
    const usePowerTools = this.node.tryGetContext(
      'coldstart-benchmark:usePowerTools'
    );
    const externalModules = includeSSO
      ? []
      : [
          '@aws-sdk/token-providers',
          '@aws-sdk/client-sso',
          '@aws-sdk/credential-provider-sso',
        ];

    const logGroup = new logs.LogGroup(this, 'logs', {
      retention: logs.RetentionDays.ONE_DAY,
      logGroupName: `/aws/lambda/${NAME}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // create a new Node.js Lambda function using NodeJsFunction
    const func = new NodejsFunction(this, NAME, {
      entry: usePowerTools ? 'src/index.js' : 'src/indexNoPowerTools.js',
      functionName: NAME,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      tracing: usePowerTools ? lambda.Tracing.ACTIVE : lambda.Tracing.DISABLED,
      bundling: {
        //metafile: true,  //uncomment to create the necessary metafile for https://esbuild.github.io/analyze/ to analyze the bundle
        minify: true,
        treeshake: true,
        target: 'esnext',
        format: 'esm',
        platform: 'node',
        mainFields: ['module', 'main'],
        outputFileExtension: '.mjs',
        externalModules: externalModules,
        banner:
          "const require = (await import('node:module')).createRequire(import.meta.url);const __filename = (await import('node:url')).fileURLToPath(import.meta.url);const __dirname = (await import('node:path')).dirname(__filename);",
      },
      environment: {
        POWERTOOLS_SERVICE_NAME: NAME,
        HAS_SSO: includeSSO + '',
        HAS_POWER_TOOLS: usePowerTools + '',
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
        tracingEnabled: usePowerTools,
        stageName: 'prod',
      },
      proxy: true,
    });
  }
}
