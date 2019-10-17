const cdk = require('@aws-cdk/core');
const ecs = require('@aws-cdk/aws-ecs');
const ecr = require('@aws-cdk/aws-ecr');
const ec2 = require('@aws-cdk/aws-ec2');
const appmesh = require('@aws-cdk/aws-appmesh');
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
const servicediscovery = require('@aws-cdk/aws-servicediscovery');

class Ec2AppMeshService extends cdk.Construct {
  constructor(scope, id, props) {
    super(scope, id);

    const appMeshRepository = ecr.Repository.fromRepositoryArn(this, 'app-mesh-envoy', 'arn:aws:ecr:us-east-1:111345817488:repository/aws-appmesh-envoy');
    const cluster = props.cluster;
    const mesh = props.mesh;
    const applicationContainer = props.applicationContainer;

    this.serviceName = id;
    this.portNumber = props.portNumber;

    this.taskDefinition = new ecs.Ec2TaskDefinition(this, `${this.serviceName}-task-definition`, {
      networkMode: ecs.NetworkMode.AWS_VPC,
      proxyConfiguration: new ecs.AppMeshProxyConfiguration({
        containerName: 'envoy',
        properties: {
          appPorts: [this.portNumber],
          proxyEgressPort: [15001],
          proxyIngressPort: [15000],
          ignoredUID: 1337,
          EgressIgnoredIPs: [
            '169.254.170.2',
            '169.254.169.254'
          ]
        }
      })
    });

    applicationContainer.dependsOn = [{
      containerName: 'envoy',
      condition: 'HEALTHY'
    }];

    this.applicationContainer = this.taskDefinition.addContainer('app', applicationContainer);
    this.applicationContainer.addPortMappings({
      containerPort: this.portNumber,
      hostPort: this.portNumber
    });

    this.taskDefinition.addContainer('envoy', {
      name: 'envoy',
      image: ecs.ContainerImage.fromEcrRepository(appMeshRepository, 'v1.11.1.1-prod'),
      essential: true,
      environment: {
        APPMESH_VIRTUAL_NODE_NAME: `mesh/${mesh.meshName}/virtualNode/${this.serviceName}`,
        AWS_REGION: cdk.Stack.of(this).region
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          'curl -s http://localhost:9901/server_info | grep state | grep -q LIVE'
        ],
        startPeriod: cdk.Duration.seconds(10),
        interval: cdk.Duration.seconds(5),
        timeout: cdk.Duration.seconds(2),
        retries: 3
      },
      memoryLimitMiB: 128,
      user: '1337',
      logging: new ecs.AwsLogDriver({
        streamPrefix: `${this.serviceName}-envoy`
      })
    });

    this.service = new ecs.Ec2Service(this, `${this.serviceName}-service`, {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: this.taskDefinition,
      cloudMapOptions: {
        dnsRecordType: 'A',
        dnsTtl: cdk.Duration.seconds(10),
        failureThreshold: 2,
        name: this.serviceName
      }
    });

    // Create a virtual node for the name service
    this.virtualNode = new appmesh.VirtualNode(this, `${this.serviceName}-virtual-node`, {
      mesh: mesh,
      virtualNodeName: this.serviceName,
      cloudMapService: this.service.cloudmapService,
      listener: {
        portMapping: {
          port: this.portNumber,
          protocol: appmesh.Protocol.HTTP,
        },
        healthCheck: {
          healthyThreshold: 2,
          intervalMillis: 5000, // minimum
          path: '/',
          port: this.portNumber,
          protocol: appmesh.Protocol.HTTP,
          timeoutMillis: 2000, // minimum
          unhealthyThreshold: 2
        }
      },
    });

    // Create virtual service to make the virtual node accessible
    this.virtualService = new appmesh.VirtualService(this, `${this.serviceName}-virtual-service`, {
      mesh: mesh,
      virtualNode: this.virtualNode,
      virtualServiceName: `${this.serviceName}.${cluster.defaultCloudMapNamespace.namespaceName}`
    });
  }

  // Connect this mesh enabled service to another mesh enabled service.
  // This adjusts the security groups for both services so that they
  // can talk to each other. Also adjusts the virtual node for this service
  // so that its Envoy intercepts traffic that can be handled by the other
  // service's virtual service.
  connectToMeshService(appMeshService) {
    var trafficPort = new ec2.Port({
      protocol: 'TCP',
      fromPort: appMeshService.portNumber,
      toPort: 3000
    });

    // Adjust security group to allow traffic from this app mesh enabled service
    // to the other app mesh enabled service.
    this.service.connections.allowTo(appMeshService.service, trafficPort, `Inbound traffic from the app mesh enabled ${this.serviceName}`);

    // Now adjust this app mesh service's virtual node to add a backend
    // that is the other service's virtual service
    this.virtualNode.addBackends(appMeshService.virtualService);
  }
}

class GreetingStack extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    const vpc = new ec2.Vpc(this, 'GreetingVpc', { maxAZs: 2 });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
      defaultCloudMapNamespace: {
        name: 'internal',
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
      }
    });

    // Create an App Mesh
    const mesh = new appmesh.Mesh(this, 'app-mesh', {
      name: 'greeting-app-mesh',
      //egressFilter: appmesh.MeshFilterType.DROP_ALL
    });

    // Add capacity to it
    cluster.addCapacity('greeter-capacity', {
      instanceType: new ec2.InstanceType('t3.xlarge'),
      minCapacity: 3,
      maxCapacity: 3
    });

    const healthCheck = {
      command: [
        'curl localhost:3000'
      ],
      startPeriod: cdk.Duration.seconds(10),
      interval: cdk.Duration.seconds(5),
      timeout: cdk.Duration.seconds(2),
      retries: 3
    };

    const nameService = new Ec2AppMeshService(this, 'name', {
      cluster: cluster,
      mesh: mesh,
      portNumber: 3000,
      applicationContainer: {
        image: ecs.ContainerImage.fromRegistry('nathanpeck/name'),
        healthCheck: healthCheck,
        memoryLimitMiB: 128,
        logging: new ecs.AwsLogDriver({
          streamPrefix: 'app-mesh-name'
        }),
        environment: {
          PORT: '3000'
        }
      }
    });

    const greetingService = new Ec2AppMeshService(this, 'greeting', {
      cluster: cluster,
      mesh: mesh,
      portNumber: 3000,
      applicationContainer: {
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeting'),
        healthCheck: healthCheck,
        memoryLimitMiB: 128,
        logging: new ecs.AwsLogDriver({
          streamPrefix: 'app-mesh-greeting'
        }),
        environment: {
          PORT: '3000'
        }
      }
    });

    const greeterService = new Ec2AppMeshService(this, 'greeter', {
      cluster: cluster,
      mesh: mesh,
      portNumber: 3000,
      applicationContainer: {
        image: ecs.ContainerImage.fromRegistry('nathanpeck/greeter'),
        healthCheck: healthCheck,
        memoryLimitMiB: 128,
        logging: new ecs.AwsLogDriver({
          streamPrefix: 'app-mesh-greeter'
        }),
        environment: {
          GREETING_URL: 'http://greeting.internal:3000',
          NAME_URL: 'http://name.internal:3000',
          PORT: '3000'
        }
      }
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

    this.externalDNS = new cdk.CfnOutput(this, 'ExternalDNS', {
      exportName: 'greeter-app-external',
      value: externalLB.loadBalancerDnsName
    });
  }
}

const app = new cdk.App();
const greeting = new GreetingStack(app, 'greeting-app-mesh');

app.synth();
