# Deploy with Docker and Amazon ECS Fargate

This runs the Node API and static site in a Linux container on ECS Fargate. There are no EC2 instances to patch or SSH into. It creates DynamoDB tables, a Cognito user pool, a Secrets Manager key for detection publishers, scoped IAM roles, CloudWatch logs, and an application load balancer. The default region is `us-east-1`.

## What you need

- AWS CLI v2 with a signed-in identity that can create ECR, CloudFormation, IAM roles, VPC/ALB, ECS, Cognito, DynamoDB, Secrets Manager, and CloudWatch resources.
- Docker Engine with Compose.
- A domain is optional for the temporary HTTP URL. For HTTPS, request or import an ACM certificate in the same region as the load balancer, validate it through DNS, then set `CERTIFICATE_ARN` before deployment. A public IP alone cannot receive a publicly trusted TLS certificate.

The deployment uses a public load balancer and gives Fargate tasks public egress so they can reach DynamoDB, Cognito, and Secrets Manager without NAT gateways. Tasks accept inbound port 5000 only from the load balancer security group. No SSH port or EC2 instance is created. The URL is the load balancer DNS name, not a fixed public IP. Review AWS pricing for the load balancer, Fargate, public IPv4 addresses, DynamoDB, logs, and email delivery before leaving the stack running.

## Local container

From the repository root:

```bash
docker compose up --build
```

Open `http://localhost:5000`. Local accounts are stored in a Docker volume and are for development only. Set `LOCAL_ADMIN_EMAILS` in the shell before `docker compose up` if your local account needs the admin page. The production image rejects local authentication.

The optional CCTV worker image uses `opencv-python-headless`, NumPy, and Requests. It contains no PyTorch, CUDA, GPU runtime, or GUI packages. Run it only where a camera or video input is available; it is separate from the web task.

## Deploy

First sign in to AWS in your own terminal and choose the account/profile you intend to use. Do not paste credentials into chat or commit them. Then run from the repository root:

```bash
aws sso login --profile YOUR_PROFILE
AWS_PROFILE=YOUR_PROFILE AWS_REGION=us-east-1 ./aws/deploy-fargate.sh
```

If using a domain and validated ACM certificate in `us-east-1`:

```bash
AWS_PROFILE=YOUR_PROFILE AWS_REGION=us-east-1 CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID ./aws/deploy-fargate.sh
```

The script builds an `linux/amd64` image, pushes it to a private ECR repository, and deploys `aws/fargate-app.yml`. The stack creates unique table names prefixed with the stack name and enables point-in-time recovery. It creates a random 64-character detection key in Secrets Manager; the ECS task receives it without placing it in the image or source. The deployment outputs the load balancer URL, Cognito pool/client IDs, and secret ARN.

The first stack deployment may take several minutes. Check progress with:

```bash
aws cloudformation describe-stacks --stack-name smart-parking --region us-east-1
aws ecs list-tasks --cluster smart-parking-cluster --region us-east-1
```

## First admin and demo parking bays

Create a driver account using the website signup flow. To grant it admin access, use the Cognito user pool ID from stack outputs and the email address used to sign up:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id USER_POOL_ID \
  --username driver@example.com \
  --group-name parking-admin \
  --region us-east-1
```

Sign out and back in after changing groups so the new access token includes the admin role. Run the seed script once with an AWS identity that can write to the stack's ParkingSlots table, using the table name from stack outputs:

```bash
cd backend
DB_MODE=aws AWS_REGION=us-east-1 DYNAMODB_TABLE_PARKING_SLOTS=smart-parking-ParkingSlots \
  AWS_PROFILE=YOUR_PROFILE node scripts/seedData.js
```

The seeded records are demo data and overwrite matching slot records.

For a trusted sensor or detector, retrieve the generated key from Secrets Manager and configure it in that publisher's secret store as `DETECTION_API_KEY`. Do not place it in browser code or a public repository:

```bash
aws secretsmanager get-secret-value --secret-id SECRET_ARN --query SecretString --output text --region us-east-1
```

## HTTPS and domain

Without a domain and validated certificate, the load balancer URL is HTTP for initial review only. Production signup, email confirmation, and login endpoints reject HTTP so passwords and session cookies are not exposed. Once a domain is available, create a DNS alias to the load balancer and provide its validated ACM certificate ARN on deployment. The template enables HTTPS and redirects HTTP to HTTPS; then account and booking flows work. A public IP alone cannot receive a normally trusted public TLS certificate.

## Remove the demo

The stack retains its DynamoDB tables when deleted, and those tables continue to incur storage charges. Decide whether to keep or delete them before cleanup. ECR images and CloudWatch logs may also need separate cleanup.
