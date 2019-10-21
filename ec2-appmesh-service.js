"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const appmesh = require("@aws-cdk/aws-appmesh");
const ec2 = require("@aws-cdk/aws-ec2");
const ecr = require("@aws-cdk/aws-ecr");
const ecs = require("@aws-cdk/aws-ecs");
const servicediscovery = require("@aws-cdk/aws-servicediscovery");
const cdk = require("@aws-cdk/core");
/**
 * An EC2 service running on an ECS cluster with AppMesh service
 */
class Ec2AppMeshService extends cdk.Construct {
    /**
     * Construct a new EC2 service with AppMesh service mesh.
     */
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
                    interval: cdk.Duration.millis(5000),
                    path: '/',
                    port: this.portNumber,
                    protocol: appmesh.Protocol.HTTP,
                    timeout: cdk.Duration.millis(2000),
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
        let trafficPort = ec2.Port.tcp(appMeshService.portNumber);
        // Adjust security group to allow traffic from this app mesh enabled service
        // to the other app mesh enabled service.
        this.service.connections.allowTo(appMeshService.service, trafficPort, `Inbound traffic from the app mesh enabled ${this.serviceName}`);
        // Now adjust this app mesh service's virtual node to add a backend
        // that is the other service's virtual service
        this.virtualNode.addBackends(appMeshService.virtualService);
    }
}
exports.Ec2AppMeshService = Ec2AppMeshService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWMyLWFwcG1lc2gtc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjMi1hcHBtZXNoLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxnREFBaUQ7QUFDakQsd0NBQXlDO0FBQ3pDLHdDQUF5QztBQUN6Qyx3Q0FBeUM7QUFDekMsa0VBQW1FO0FBQ25FLHFDQUFzQztBQTJCdEM7O0dBRUc7QUFDSCxNQUFhLGlCQUFrQixTQUFRLEdBQUcsQ0FBQyxTQUFTO0lBb0NsRDs7T0FFRztJQUNILFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBNkI7UUFDekUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFLGlFQUFpRSxDQUFDLENBQUM7UUFDdEosTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUM5QixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3hCLE1BQU0sb0JBQW9CLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixDQUFDO1FBRXhELElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUVuQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLGtCQUFrQixFQUFFO1lBQzNGLFdBQVcsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLE9BQU87WUFDcEMsa0JBQWtCLEVBQUUsSUFBSSxHQUFHLENBQUMseUJBQXlCLENBQUM7Z0JBQ3BELGFBQWEsRUFBRSxPQUFPO2dCQUN0QixVQUFVLEVBQUU7b0JBQ1YsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUs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Q29udGVudCI6WyJpbXBvcnQgYXBwbWVzaCA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1hcHBtZXNoJyk7XG5pbXBvcnQgZWMyID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWVjMicpO1xuaW1wb3J0IGVjciA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1lY3InKTtcbmltcG9ydCBlY3MgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtZWNzJyk7XG5pbXBvcnQgc2VydmljZWRpc2NvdmVyeSA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1zZXJ2aWNlZGlzY292ZXJ5Jyk7XG5pbXBvcnQgY2RrID0gcmVxdWlyZSgnQGF3cy1jZGsvY29yZScpO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgdG8gY3JlYXRlIGFuIEVjMkFwcE1lc2hTZXJ2aWNlXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWMyQXBwTWVzaFNlcnZpY2VQcm9wcyB7XG4gIC8qKlxuICAgKiBDbHVzdGVyIG9mIHRoZSBzZXJ2aWNlXG4gICAqL1xuICByZWFkb25seSBjbHVzdGVyOiBlY3MuQ2x1c3RlcjtcblxuICAvKipcbiAgICogQXBwTWVzaCBtZXNoIG9mIHRoZSBzZXJ2aWNlXG4gICAqL1xuICByZWFkb25seSBtZXNoOiBhcHBtZXNoLk1lc2g7XG5cbiAgLyoqXG4gICAqIFBvcnQgbnVtYmVyIG9mIHRoZSBhcHBsaWNhdGlvblxuICAgKi9cbiAgcmVhZG9ubHkgcG9ydE51bWJlcjogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBDb250YWluZXIgZGVmaW5pdGlvbiBmb3IgdGhlIGFwcGxpY2F0aW9uIGNvbnRhaW5lci5cbiAgICovXG4gIHJlYWRvbmx5IGFwcGxpY2F0aW9uQ29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM7XG59XG5cbi8qKlxuICogQW4gRUMyIHNlcnZpY2UgcnVubmluZyBvbiBhbiBFQ1MgY2x1c3RlciB3aXRoIEFwcE1lc2ggc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgRWMyQXBwTWVzaFNlcnZpY2UgZXh0ZW5kcyBjZGsuQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIE5hbWUgb2YgdGhlIEVDUyBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZU5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogUG9ydCBudW1iZXIgZm9yIHRoZSBhcHBsaWNhdGlvbiBjb250YWluZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBwb3J0TnVtYmVyOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFRhc2sgZGVmaW5pdGlvbiBvZiB0aGUgRUNTIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBDb250YWluZXIgZGVmaW5pdGlvbiBmb3IgdGhlIGFwcGxpY2F0aW9uIGNvbnRhaW5lclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFwcGxpY2F0aW9uQ29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbjtcblxuICAvKipcbiAgICogVGhlIEVDUyBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZTogZWNzLkVjMlNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIFZpcnR1YWwgbm9kZSBvZiB0aGUgbWVzaFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHZpcnR1YWxOb2RlOiBhcHBtZXNoLlZpcnR1YWxOb2RlO1xuXG4gIC8qKlxuICAgKiBWaXJ0dWFsIHNlcnZpY2Ugb2YgdGhlIG1lc2hcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB2aXJ0dWFsU2VydmljZTogYXBwbWVzaC5WaXJ0dWFsU2VydmljZTtcblxuICAvKipcbiAgICogQ29uc3RydWN0IGEgbmV3IEVDMiBzZXJ2aWNlIHdpdGggQXBwTWVzaCBzZXJ2aWNlIG1lc2guXG4gICAqL1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVjMkFwcE1lc2hTZXJ2aWNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgYXBwTWVzaFJlcG9zaXRvcnkgPSBlY3IuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeUFybih0aGlzLCAnYXBwLW1lc2gtZW52b3knLCAnYXJuOmF3czplY3I6dXMtZWFzdC0xOjExMTM0NTgxNzQ4ODpyZXBvc2l0b3J5L2F3cy1hcHBtZXNoLWVudm95Jyk7XG4gICAgY29uc3QgY2x1c3RlciA9IHByb3BzLmNsdXN0ZXI7XG4gICAgY29uc3QgbWVzaCA9IHByb3BzLm1lc2g7XG4gICAgY29uc3QgYXBwbGljYXRpb25Db250YWluZXIgPSBwcm9wcy5hcHBsaWNhdGlvbkNvbnRhaW5lcjtcblxuICAgIHRoaXMuc2VydmljZU5hbWUgPSBpZDtcbiAgICB0aGlzLnBvcnROdW1iZXIgPSBwcm9wcy5wb3J0TnVtYmVyO1xuXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRWMyVGFza0RlZmluaXRpb24odGhpcywgYCR7dGhpcy5zZXJ2aWNlTmFtZX0tdGFzay1kZWZpbml0aW9uYCwge1xuICAgICAgbmV0d29ya01vZGU6IGVjcy5OZXR3b3JrTW9kZS5BV1NfVlBDLFxuICAgICAgcHJveHlDb25maWd1cmF0aW9uOiBuZXcgZWNzLkFwcE1lc2hQcm94eUNvbmZpZ3VyYXRpb24oe1xuICAgICAgICBjb250YWluZXJOYW1lOiAnZW52b3knLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgYXBwUG9ydHM6IFt0aGlzLnBvcnROdW1iZXJdLFxuICAgICAgICAgIHByb3h5RWdyZXNzUG9ydDogMTUwMDEsXG4gICAgICAgICAgcHJveHlJbmdyZXNzUG9ydDogMTUwMDAsXG4gICAgICAgICAgaWdub3JlZFVJRDogMTMzNyxcbiAgICAgICAgICBlZ3Jlc3NJZ25vcmVkSVBzOiBbXG4gICAgICAgICAgICAnMTY5LjI1NC4xNzAuMicsXG4gICAgICAgICAgICAnMTY5LjI1NC4xNjkuMjU0J1xuICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIHRoaXMuYXBwbGljYXRpb25Db250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignYXBwJywgYXBwbGljYXRpb25Db250YWluZXIpO1xuICAgIHRoaXMuYXBwbGljYXRpb25Db250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IHRoaXMucG9ydE51bWJlcixcbiAgICAgIGhvc3RQb3J0OiB0aGlzLnBvcnROdW1iZXJcbiAgICB9KTtcblxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdlbnZveScsIHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbUVjclJlcG9zaXRvcnkoYXBwTWVzaFJlcG9zaXRvcnksICd2MS4xMS4xLjEtcHJvZCcpLFxuICAgICAgZXNzZW50aWFsOiB0cnVlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQTUVTSF9WSVJUVUFMX05PREVfTkFNRTogYG1lc2gvJHttZXNoLm1lc2hOYW1lfS92aXJ0dWFsTm9kZS8ke3RoaXMuc2VydmljZU5hbWV9YCxcbiAgICAgICAgQVdTX1JFR0lPTjogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvblxuICAgICAgfSxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAnQ01ELVNIRUxMJyxcbiAgICAgICAgICAnY3VybCAtcyBodHRwOi8vbG9jYWxob3N0Ojk5MDEvc2VydmVyX2luZm8gfCBncmVwIHN0YXRlIHwgZ3JlcCAtcSBMSVZFJ1xuICAgICAgICBdLFxuICAgICAgICBzdGFydFBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDIpLFxuICAgICAgICByZXRyaWVzOiAzXG4gICAgICB9LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDEyOCxcbiAgICAgIHVzZXI6ICcxMzM3JyxcbiAgICAgIGxvZ2dpbmc6IG5ldyBlY3MuQXdzTG9nRHJpdmVyKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiBgJHt0aGlzLnNlcnZpY2VOYW1lfS1lbnZveWBcbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzLkVjMlNlcnZpY2UodGhpcywgYCR7dGhpcy5zZXJ2aWNlTmFtZX0tc2VydmljZWAsIHtcbiAgICAgIGNsdXN0ZXI6IGNsdXN0ZXIsXG4gICAgICBkZXNpcmVkQ291bnQ6IDIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGNsb3VkTWFwT3B0aW9uczoge1xuICAgICAgICBkbnNSZWNvcmRUeXBlOiBzZXJ2aWNlZGlzY292ZXJ5LkRuc1JlY29yZFR5cGUuQSxcbiAgICAgICAgZG5zVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICAgIGZhaWx1cmVUaHJlc2hvbGQ6IDIsXG4gICAgICAgIG5hbWU6IHRoaXMuc2VydmljZU5hbWVcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhIHZpcnR1YWwgbm9kZSBmb3IgdGhlIG5hbWUgc2VydmljZVxuICAgIHRoaXMudmlydHVhbE5vZGUgPSBuZXcgYXBwbWVzaC5WaXJ0dWFsTm9kZSh0aGlzLCBgJHt0aGlzLnNlcnZpY2VOYW1lfS12aXJ0dWFsLW5vZGVgLCB7XG4gICAgICBtZXNoOiBtZXNoLFxuICAgICAgdmlydHVhbE5vZGVOYW1lOiB0aGlzLnNlcnZpY2VOYW1lLFxuICAgICAgY2xvdWRNYXBTZXJ2aWNlOiB0aGlzLnNlcnZpY2UuY2xvdWRNYXBTZXJ2aWNlLFxuICAgICAgbGlzdGVuZXI6IHtcbiAgICAgICAgcG9ydE1hcHBpbmc6IHtcbiAgICAgICAgICBwb3J0OiB0aGlzLnBvcnROdW1iZXIsXG4gICAgICAgICAgcHJvdG9jb2w6IGFwcG1lc2guUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgfSxcbiAgICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgICBoZWFsdGh5VGhyZXNob2xkOiAyLFxuICAgICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24ubWlsbGlzKDUwMDApLCAvLyBtaW5pbXVtXG4gICAgICAgICAgcGF0aDogJy8nLFxuICAgICAgICAgIHBvcnQ6IHRoaXMucG9ydE51bWJlcixcbiAgICAgICAgICBwcm90b2NvbDogYXBwbWVzaC5Qcm90b2NvbC5IVFRQLFxuICAgICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taWxsaXMoMjAwMCksIC8vIG1pbmltdW1cbiAgICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGQ6IDJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB2aXJ0dWFsIHNlcnZpY2UgdG8gbWFrZSB0aGUgdmlydHVhbCBub2RlIGFjY2Vzc2libGVcbiAgICB0aGlzLnZpcnR1YWxTZXJ2aWNlID0gbmV3IGFwcG1lc2guVmlydHVhbFNlcnZpY2UodGhpcywgYCR7dGhpcy5zZXJ2aWNlTmFtZX0tdmlydHVhbC1zZXJ2aWNlYCwge1xuICAgICAgbWVzaDogbWVzaCxcbiAgICAgIHZpcnR1YWxOb2RlOiB0aGlzLnZpcnR1YWxOb2RlLFxuICAgICAgdmlydHVhbFNlcnZpY2VOYW1lOiBgJHt0aGlzLnNlcnZpY2VOYW1lfS4ke2NsdXN0ZXIuZGVmYXVsdENsb3VkTWFwTmFtZXNwYWNlIS5uYW1lc3BhY2VOYW1lfWBcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbm5lY3QgdGhpcyBtZXNoIGVuYWJsZWQgc2VydmljZSB0byBhbm90aGVyIG1lc2ggZW5hYmxlZCBzZXJ2aWNlLlxuICAvLyBUaGlzIGFkanVzdHMgdGhlIHNlY3VyaXR5IGdyb3VwcyBmb3IgYm90aCBzZXJ2aWNlcyBzbyB0aGF0IHRoZXlcbiAgLy8gY2FuIHRhbGsgdG8gZWFjaCBvdGhlci4gQWxzbyBhZGp1c3RzIHRoZSB2aXJ0dWFsIG5vZGUgZm9yIHRoaXMgc2VydmljZVxuICAvLyBzbyB0aGF0IGl0cyBFbnZveSBpbnRlcmNlcHRzIHRyYWZmaWMgdGhhdCBjYW4gYmUgaGFuZGxlZCBieSB0aGUgb3RoZXJcbiAgLy8gc2VydmljZSdzIHZpcnR1YWwgc2VydmljZS5cbiAgY29ubmVjdFRvTWVzaFNlcnZpY2UoYXBwTWVzaFNlcnZpY2U6IEVjMkFwcE1lc2hTZXJ2aWNlKSB7XG4gICAgbGV0IHRyYWZmaWNQb3J0ID0gZWMyLlBvcnQudGNwKGFwcE1lc2hTZXJ2aWNlLnBvcnROdW1iZXIpO1xuXG4gICAgLy8gQWRqdXN0IHNlY3VyaXR5IGdyb3VwIHRvIGFsbG93IHRyYWZmaWMgZnJvbSB0aGlzIGFwcCBtZXNoIGVuYWJsZWQgc2VydmljZVxuICAgIC8vIHRvIHRoZSBvdGhlciBhcHAgbWVzaCBlbmFibGVkIHNlcnZpY2UuXG4gICAgdGhpcy5zZXJ2aWNlLmNvbm5lY3Rpb25zLmFsbG93VG8oYXBwTWVzaFNlcnZpY2Uuc2VydmljZSwgdHJhZmZpY1BvcnQsIGBJbmJvdW5kIHRyYWZmaWMgZnJvbSB0aGUgYXBwIG1lc2ggZW5hYmxlZCAke3RoaXMuc2VydmljZU5hbWV9YCk7XG5cbiAgICAvLyBOb3cgYWRqdXN0IHRoaXMgYXBwIG1lc2ggc2VydmljZSdzIHZpcnR1YWwgbm9kZSB0byBhZGQgYSBiYWNrZW5kXG4gICAgLy8gdGhhdCBpcyB0aGUgb3RoZXIgc2VydmljZSdzIHZpcnR1YWwgc2VydmljZVxuICAgIHRoaXMudmlydHVhbE5vZGUuYWRkQmFja2VuZHMoYXBwTWVzaFNlcnZpY2UudmlydHVhbFNlcnZpY2UpO1xuICB9XG59Il19