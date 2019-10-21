import appmesh = require('@aws-cdk/aws-appmesh');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import servicediscovery = require('@aws-cdk/aws-servicediscovery');
import cdk = require('@aws-cdk/core');

/**
 * Properties to create an Ec2AppMeshService
 */
export interface Ec2AppMeshServiceProps {
  /**
   * Cluster of the service
   */
  readonly cluster: ecs.Cluster;

  /**
   * AppMesh mesh of the service
   */
  readonly mesh: appmesh.Mesh;

  /**
   * Port number of the application
   */
  readonly portNumber: number;

  /**
   * Container definition for the application container.
   */
  readonly applicationContainer: ecs.ContainerDefinitionOptions;
}

/**
 * An EC2 service running on an ECS cluster with AppMesh service
 */
export class Ec2AppMeshService extends cdk.Construct {
  /**
   * Name of the ECS service
   */
  public readonly serviceName: string;

  /**
   * Port number for the application container
   */
  public readonly portNumber: number;

  /**
   * Task definition of the ECS service
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * Container definition for the application container
   */
  public readonly applicationContainer: ecs.ContainerDefinition;

  /**
   * The ECS service
   */
  public readonly service: ecs.Ec2Service;

  /**
   * Virtual node of the mesh
   */
  public readonly virtualNode: appmesh.VirtualNode;

  /**
   * Virtual service of the mesh
   */
  public readonly virtualService: appmesh.VirtualService;

  /**
   * Construct a new EC2 service with AppMesh service mesh.
   */
  constructor(scope: cdk.Construct, id: string, props: Ec2AppMeshServiceProps) {
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
          proxyEgressPort: 15001,
          proxyIngressPort: 15000,
          ignoredUID: 1337,
          egressIgnoredIPs: [
            '169.254.170.2',
            '169.254.169.254'
          ]
        }
      })
    });

    this.applicationContainer = this.taskDefinition.addContainer('app', applicationContainer);
    this.applicationContainer.addPortMappings({
      containerPort: this.portNumber,
      hostPort: this.portNumber
    });

    this.taskDefinition.addContainer('envoy', {
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
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(10),
        failureThreshold: 2,
        name: this.serviceName
      }
    });

    // Create a virtual node for the name service
    this.virtualNode = new appmesh.VirtualNode(this, `${this.serviceName}-virtual-node`, {
      mesh: mesh,
      virtualNodeName: this.serviceName,
      cloudMapService: this.service.cloudMapService,
      listener: {
        portMapping: {
          port: this.portNumber,
          protocol: appmesh.Protocol.HTTP,
        },
        healthCheck: {
          healthyThreshold: 2,
          interval: cdk.Duration.millis(5000), // minimum
          path: '/',
          port: this.portNumber,
          protocol: appmesh.Protocol.HTTP,
          timeout: cdk.Duration.millis(2000), // minimum
          unhealthyThreshold: 2
        }
      },
    });

    // Create virtual service to make the virtual node accessible
    this.virtualService = new appmesh.VirtualService(this, `${this.serviceName}-virtual-service`, {
      mesh: mesh,
      virtualNode: this.virtualNode,
      virtualServiceName: `${this.serviceName}.${cluster.defaultCloudMapNamespace!.namespaceName}`
    });
  }

  // Connect this mesh enabled service to another mesh enabled service.
  // This adjusts the security groups for both services so that they
  // can talk to each other. Also adjusts the virtual node for this service
  // so that its Envoy intercepts traffic that can be handled by the other
  // service's virtual service.
  connectToMeshService(appMeshService: Ec2AppMeshService) {
    let trafficPort = ec2.Port.tcp(appMeshService.portNumber);

    // Adjust security group to allow traffic from this app mesh enabled service
    // to the other app mesh enabled service.
    this.service.connections.allowTo(appMeshService.service, trafficPort, `Inbound traffic from the app mesh enabled ${this.serviceName}`);

    // Now adjust this app mesh service's virtual node to add a backend
    // that is the other service's virtual service
    this.virtualNode.addBackends(appMeshService.virtualService);
  }
}