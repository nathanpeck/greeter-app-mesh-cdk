import appmesh = require('@aws-cdk/aws-appmesh');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import servicediscovery = require('@aws-cdk/aws-servicediscovery');
import cdk = require('@aws-cdk/core');
import { Ec2AppMeshService } from './ec2-appmesh-service';

class GreetingStack extends cdk.Stack {
  private readonly cluster: ecs.Cluster;
  private readonly mesh: appmesh.Mesh;
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'GreetingVpc', { maxAzs: 2 });

    // Create an ECS cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
      defaultCloudMapNamespace: {
        name: 'internal',
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
      }
    });

    // Create an App Mesh
    this.mesh = new appmesh.Mesh(this, 'app-mesh', {
      meshName: 'greeting-app-mesh',
      //egressFilter: appmesh.MeshFilterType.DROP_ALL
    });

    // Add capacity to it
    this.cluster.addCapacity('greeter-capacity', {
      instanceType: new ec2.InstanceType('t3.xlarge'),
      minCapacity: 3,
      maxCapacity: 3
    });

    const nameService = this.createEc2AppMeshService("name");
    const greetingService = this.createEc2AppMeshService("greeting");
    const greeterService = this.createEc2AppMeshService("greeter", {
      GREETING_URL: 'http://greeting.internal:3000',
      NAME_URL: 'http://name.internal:3000',
      PORT: '3000'
    });

    greeterService.connectToMeshService(nameService);
    greeterService.connectToMeshService(greetingService);

    // Last but not least setup an internet facing load balancer for
    // exposing the public facing greeter service to the public.
    const externalLB = new elbv2.ApplicationLoadBalancer(this, 'external', {
      vpc: vpc,
      internetFacing: true
    });

    const externalListener = externalLB.addListener('PublicListener', { port: 80, open: true });

    externalListener.addTargets('greeter', {
      port: 80,
      targets: [greeterService.service]
    });

    new cdk.CfnOutput(this, 'ExternalDNS', {
      exportName: 'greeter-app-external',
      value: externalLB.loadBalancerDnsName
    });
  }

  private createEc2AppMeshService(name: string, env?: { [key: string]: string }): Ec2AppMeshService {
    const healthCheck = {
      command: [
        'curl localhost:3000'
      ],
      startPeriod: cdk.Duration.seconds(10),
      interval: cdk.Duration.seconds(5),
      timeout: cdk.Duration.seconds(2),
      retries: 3,
      dependsOn: [{
        containerName: 'envoy',
        condition: 'HEALTHY'
      }]
    };

    const environment = env || {
      PORT: '3000'
    };

    return new Ec2AppMeshService(this, name, {
      cluster: this.cluster,
      mesh: this.mesh,
      portNumber: 3000,
      applicationContainer: {
        image: ecs.ContainerImage.fromRegistry(`nathanpeck/${name}`),
        healthCheck: healthCheck,
        memoryLimitMiB: 128,
        logging: new ecs.AwsLogDriver({
          streamPrefix: `app-mesh-${name}`
        }),
        environment
      }
    });
  }
}

const app = new cdk.App();
new GreetingStack(app, 'greeting-app-mesh');

app.synth();