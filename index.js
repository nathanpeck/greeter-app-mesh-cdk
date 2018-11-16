const cdk = require('@aws-cdk/cdk');
const ecs = require('@aws-cdk/aws-ecs');
const ec2 = require('@aws-cdk/aws-ec2');
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');

class GreetingStack extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    const vpc = new ec2.VpcNetwork(this, 'GreetingVpc', { maxAZs: 2 });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // Add capacity to it
    cluster.addDefaultAutoScalingGroupCapacity({
      instanceType: new ec2.InstanceType('t3.xlarge'),
      instanceCount: 3
    });

    // Name service
    const nameTaskDefinition = new ecs.Ec2TaskDefinition(this, 'name-task-definition', {});

    const nameContainer = nameTaskDefinition.addContainer('name', {
      image: ecs.DockerHub.image('nathanpeck/name'),
      memoryLimitMiB: 128
    });

    nameContainer.addPortMappings({
      containerPort: 3000
    });

    const nameService = new ecs.Ec2Service(this, 'name-service', {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: nameTaskDefinition
    });

    // Greeting service
    const greetingTaskDefinition = new ecs.Ec2TaskDefinition(this, 'greeting-task-definition', {});

    const greetingContainer = greetingTaskDefinition.addContainer('greeting', {
      image: ecs.DockerHub.image('nathanpeck/greeting'),
      memoryLimitMiB: 128
    });

    greetingContainer.addPortMappings({
      containerPort: 3000
    });

    const greetingService = new ecs.Ec2Service(this, 'greeting-service', {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: greetingTaskDefinition
    });

    // Internal load balancer for the backend services
    const internalLB = new elbv2.ApplicationLoadBalancer(this, 'internal', {
      vpc: vpc,
      internetFacing: false
    });

    const internalListener = internalLB.addListener('PublicListener', { port: 80, open: true });

    internalListener.addTargetGroups('default', {
      targetGroups: [new elbv2.ApplicationTargetGroup(this, 'default', {
        vpc: vpc,
        protocol: 'HTTP',
        port: 80
      })]
    });

    internalListener.addTargets('name', {
      port: 80,
      pathPattern: '/name*',
      priority: 1,
      targets: [nameService]
    });

    internalListener.addTargets('greeting', {
      port: 80,
      pathPattern: '/greeting*',
      priority: 2,
      targets: [greetingService]
    });

    // Greeter service
    const greeterTaskDefinition = new ecs.Ec2TaskDefinition(this, 'greeter-task-definition', {});

    const greeterContainer = greeterTaskDefinition.addContainer('greeter', {
      image: ecs.DockerHub.image('nathanpeck/greeter'),
      memoryLimitMiB: 128,
      environment: {
        GREETING_URL: 'http://' + internalLB.dnsName + '/greeting',
        NAME_URL: 'http://' + internalLB.dnsName + '/name'
      }
    });

    greeterContainer.addPortMappings({
      containerPort: 3000
    });

    const greeterService = new ecs.Ec2Service(this, 'greeter-service', {
      cluster: cluster,
      desiredCount: 2,
      taskDefinition: greeterTaskDefinition
    });

     // Internet facing load balancer for the frontend services
    const externalLB = new elbv2.ApplicationLoadBalancer(this, 'external', {
      vpc: vpc,
      internetFacing: true
    });

    const externalListener = externalLB.addListener('PublicListener', { port: 80, open: true });

    externalListener.addTargets('greeter', {
      port: 80,
      targets: [greeterService]
    });

    new cdk.Output(this, 'InternalDNS', { value: internalLB.dnsName });
    new cdk.Output(this, 'ExternalDNS', { value: externalLB.dnsName });
  }
}

class GreetingApp extends cdk.App {
  constructor(argv) {
    super(argv);
    new GreetingStack(this, 'greeting-stack');
  }
}

new GreetingApp().run();
