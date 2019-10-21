"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const appmesh = require("@aws-cdk/aws-appmesh");
const ec2 = require("@aws-cdk/aws-ec2");
const ecs = require("@aws-cdk/aws-ecs");
const elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
const servicediscovery = require("@aws-cdk/aws-servicediscovery");
const cdk = require("@aws-cdk/core");
const ec2_appmesh_service_1 = require("./ec2-appmesh-service");
class GreetingStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    createEc2AppMeshService(name, env) {
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
        return new ec2_appmesh_service_1.Ec2AppMeshService(this, name, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGdEQUFpRDtBQUNqRCx3Q0FBeUM7QUFDekMsd0NBQXlDO0FBQ3pDLDZEQUE4RDtBQUM5RCxrRUFBbUU7QUFDbkUscUNBQXNDO0FBQ3RDLCtEQUEwRDtBQUUxRCxNQUFNLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUduQyxZQUFZLEtBQW9CLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFNUQsd0JBQXdCO1FBQ3hCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDOUMsR0FBRyxFQUFFLEdBQUc7WUFDUix3QkFBd0IsRUFBRTtnQkFDeEIsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsV0FBVzthQUNqRDtTQUNGLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzdDLFFBQVEsRUFBRSxtQkFBbUI7U0FFOUIsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFO1lBQzNDLFlBQVksRUFBRSxJQUFJLEdBQUcsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO1lBQy9DLFdBQVcsRUFBRSxDQUFDO1lBQ2QsV0FBVyxFQUFFLENBQUM7U0FDZixD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ZXNDb250ZW50IjpbImltcG9ydCBhcHBtZXNoID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWFwcG1lc2gnKTtcbmltcG9ydCBlYzIgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtZWMyJyk7XG5pbXBvcnQgZWNzID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWVjcycpO1xuaW1wb3J0IGVsYnYyID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInKTtcbmltcG9ydCBzZXJ2aWNlZGlzY292ZXJ5ID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLXNlcnZpY2VkaXNjb3ZlcnknKTtcbmltcG9ydCBjZGsgPSByZXF1aXJlKCdAYXdzLWNkay9jb3JlJyk7XG5pbXBvcnQgeyBFYzJBcHBNZXNoU2VydmljZSB9IGZyb20gJy4vZWMyLWFwcG1lc2gtc2VydmljZSc7XG5cbmNsYXNzIEdyZWV0aW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwcml2YXRlIHJlYWRvbmx5IGNsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuICBwcml2YXRlIHJlYWRvbmx5IG1lc2g6IGFwcG1lc2guTWVzaDtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdHcmVldGluZ1ZwYycsIHsgbWF4QXpzOiAyIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFuIEVDUyBjbHVzdGVyXG4gICAgdGhpcy5jbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdDbHVzdGVyJywge1xuICAgICAgdnBjOiB2cGMsXG4gICAgICBkZWZhdWx0Q2xvdWRNYXBOYW1lc3BhY2U6IHtcbiAgICAgICAgbmFtZTogJ2ludGVybmFsJyxcbiAgICAgICAgdHlwZTogc2VydmljZWRpc2NvdmVyeS5OYW1lc3BhY2VUeXBlLkROU19QUklWQVRFLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFuIEFwcCBNZXNoXG4gICAgdGhpcy5tZXNoID0gbmV3IGFwcG1lc2guTWVzaCh0aGlzLCAnYXBwLW1lc2gnLCB7XG4gICAgICBtZXNoTmFtZTogJ2dyZWV0aW5nLWFwcC1tZXNoJyxcbiAgICAgIC8vZWdyZXNzRmlsdGVyOiBhcHBtZXNoLk1lc2hGaWx0ZXJUeXBlLkRST1BfQUxMXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgY2FwYWNpdHkgdG8gaXRcbiAgICB0aGlzLmNsdXN0ZXIuYWRkQ2FwYWNpdHkoJ2dyZWV0ZXItY2FwYWNpdHknLCB7XG4gICAgICBpbnN0YW5jZVR5cGU6IG5ldyBlYzIuSW5zdGFuY2VUeXBlKCd0My54bGFyZ2UnKSxcbiAgICAgIG1pbkNhcGFjaXR5OiAzLFxuICAgICAgbWF4Q2FwYWNpdHk6IDNcbiAgICB9KTtcblxuICAgIGNvbnN0IG5hbWVTZXJ2aWNlID0gdGhpcy5jcmVhdGVFYzJBcHBNZXNoU2VydmljZShcIm5hbWVcIik7XG4gICAgY29uc3QgZ3JlZXRpbmdTZXJ2aWNlID0gdGhpcy5jcmVhdGVFYzJBcHBNZXNoU2VydmljZShcImdyZWV0aW5nXCIpO1xuICAgIGNvbnN0IGdyZWV0ZXJTZXJ2aWNlID0gdGhpcy5jcmVhdGVFYzJBcHBNZXNoU2VydmljZShcImdyZWV0ZXJcIiwge1xuICAgICAgR1JFRVRJTkdfVVJMOiAnaHR0cDovL2dyZWV0aW5nLmludGVybmFsOjMwMDAnLFxuICAgICAgTkFNRV9VUkw6ICdodHRwOi8vbmFtZS5pbnRlcm5hbDozMDAwJyxcbiAgICAgIFBPUlQ6ICczMDAwJ1xuICAgIH0pO1xuXG4gICAgZ3JlZXRlclNlcnZpY2UuY29ubmVjdFRvTWVzaFNlcnZpY2UobmFtZVNlcnZpY2UpO1xuICAgIGdyZWV0ZXJTZXJ2aWNlLmNvbm5lY3RUb01lc2hTZXJ2aWNlKGdyZWV0aW5nU2VydmljZSk7XG5cbiAgICAvLyBMYXN0IGJ1dCBub3QgbGVhc3Qgc2V0dXAgYW4gaW50ZXJuZXQgZmFjaW5nIGxvYWQgYmFsYW5jZXIgZm9yXG4gICAgLy8gZXhwb3NpbmcgdGhlIHB1YmxpYyBmYWNpbmcgZ3JlZXRlciBzZXJ2aWNlIHRvIHRoZSBwdWJsaWMuXG4gICAgY29uc3QgZXh0ZXJuYWxMQiA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcih0aGlzLCAnZXh0ZXJuYWwnLCB7XG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiB0cnVlXG4gICAgfSk7XG5cbiAgICBjb25zdCBleHRlcm5hbExpc3RlbmVyID0gZXh0ZXJuYWxMQi5hZGRMaXN0ZW5lcignUHVibGljTGlzdGVuZXInLCB7IHBvcnQ6IDgwLCBvcGVuOiB0cnVlIH0pO1xuXG4gICAgZXh0ZXJuYWxMaXN0ZW5lci5hZGRUYXJnZXRzKCdncmVldGVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICB0YXJnZXRzOiBbZ3JlZXRlclNlcnZpY2Uuc2VydmljZV1cbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFeHRlcm5hbEROUycsIHtcbiAgICAgIGV4cG9ydE5hbWU6ICdncmVldGVyLWFwcC1leHRlcm5hbCcsXG4gICAgICB2YWx1ZTogZXh0ZXJuYWxMQi5sb2FkQmFsYW5jZXJEbnNOYW1lXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUVjMkFwcE1lc2hTZXJ2aWNlKG5hbWU6IHN0cmluZywgZW52PzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSk6IEVjMkFwcE1lc2hTZXJ2aWNlIHtcbiAgICBjb25zdCBoZWFsdGhDaGVjayA9IHtcbiAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgJ2N1cmwgbG9jYWxob3N0OjMwMDAnXG4gICAgICBdLFxuICAgICAgc3RhcnRQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDIpLFxuICAgICAgcmV0cmllczogMyxcbiAgICAgIGRlcGVuZHNPbjogW3tcbiAgICAgICAgY29udGFpbmVyTmFtZTogJ2Vudm95JyxcbiAgICAgICAgY29uZGl0aW9uOiAnSEVBTFRIWSdcbiAgICAgIH1dXG4gICAgfTtcblxuICAgIGNvbnN0IGVudmlyb25tZW50ID0gZW52IHx8IHtcbiAgICAgIFBPUlQ6ICczMDAwJ1xuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IEVjMkFwcE1lc2hTZXJ2aWNlKHRoaXMsIG5hbWUsIHtcbiAgICAgIGNsdXN0ZXI6IHRoaXMuY2x1c3RlcixcbiAgICAgIG1lc2g6IHRoaXMubWVzaCxcbiAgICAgIHBvcnROdW1iZXI6IDMwMDAsXG4gICAgICBhcHBsaWNhdGlvbkNvbnRhaW5lcjoge1xuICAgICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShgbmF0aGFucGVjay8ke25hbWV9YCksXG4gICAgICAgIGhlYWx0aENoZWNrOiBoZWFsdGhDaGVjayxcbiAgICAgICAgbWVtb3J5TGltaXRNaUI6IDEyOCxcbiAgICAgICAgbG9nZ2luZzogbmV3IGVjcy5Bd3NMb2dEcml2ZXIoe1xuICAgICAgICAgIHN0cmVhbVByZWZpeDogYGFwcC1tZXNoLSR7bmFtZX1gXG4gICAgICAgIH0pLFxuICAgICAgICBlbnZpcm9ubWVudFxuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5uZXcgR3JlZXRpbmdTdGFjayhhcHAsICdncmVldGluZy1hcHAtbWVzaCcpO1xuXG5hcHAuc3ludGgoKTsiXX0=