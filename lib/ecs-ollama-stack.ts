import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class EcsOllamaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // Our VPC
    const vpc = new ec2.Vpc(this, "ollama-vpc", {
      maxAzs: 2,
      natGateways: 1
    })
    const cluster = new ecs.Cluster(this, "ecs-ollama", {
      vpc: vpc
    })

    const ecs_asg = cluster.addCapacity('MyGroupCapacity', {
      instanceType: new ec2.InstanceType("g4dn.xlarge"),
      spotInstanceDraining: true,
      allowAllOutbound: true,
      machineImage: new ecs.BottleRocketImage({
        variant: ecs.BottlerocketEcsVariant.AWS_ECS_2_NVIDIA,
      }),
    });

    // ecs_asg.addUserData('#!/bin/bash\ncurl -fsSL https://ollama.com/install.sh | sh\nsudo systemctl status ollama\nollama pull llama3');
    
    // Create Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef');

    const container = taskDefinition.addContainer('ollama', {
      memoryReservationMiB: 4096,
      image: ecs.ContainerImage.fromRegistry("ollama/ollama"),
      gpuCount: 1,
    });

    container.addPortMappings({
      containerPort: 11434,
      protocol: ecs.Protocol.TCP
    });

    // Create Service
    const service = new ecs.Ec2Service(this, "Ollama-Service", {
      cluster,
      taskDefinition,
    });

    // Create ALB
    const lb = new elbv2.ApplicationLoadBalancer(this, 'Ollama-LB', {
      vpc,
      internetFacing: true
    });
    const listener = lb.addListener('PublicListener', { port: 80, open: true });

    // Attach ALB to ECS Service
    listener.addTargets('Ollama-tg', {
      port: 11434,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: "/",
        timeout: cdk.Duration.seconds(5),
      }
    });

    // // Create a load-balanced Fargate service and make it public
    const webui = new ecs_patterns.ApplicationLoadBalancedEc2Service(this, "ollama-webui", {
      cluster: cluster, 
      cpu: 1024, // default : 256
      memoryReservationMiB: 4096,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("ghcr.io/open-webui/open-webui:main"),
        containerPort: 8080
      },
      publicLoadBalancer: true
    })

  }
}
