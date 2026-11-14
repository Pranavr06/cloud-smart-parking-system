# Existing EC2 Docker deployment

This deployment reuses the existing Sentinel EC2 host and adds a separate parking app container plus a Caddy HTTPS proxy. It does not create another EC2 instance. The current preview is `https://smartpark.54.79.97.73.nip.io`; the bare IP redirects there. This IP-mapped hostname is temporary. For a branded hostname, point a domain you control at the EC2 public IP, update the hostname and redirect in `Caddyfile`, then recreate Caddy so it can obtain a certificate for the new name.

## Runtime

- `smart-parking-app`: Node.js API and static frontend, non-root container, port 5000 on the private Docker network only.
- `smart-parking-caddy`: reverse proxy on ports 80/443. HTTP redirects to HTTPS. Caddy stores the IP and hostname certificates in a persistent volume and renews them automatically.
- `smart-parking-data`: persistent Docker volume for local parking data and bcrypt password hashes. Data is stored on the EC2 host, not DynamoDB.
- `smart-parking-caddy-data`: persistent Caddy certificate state.

The public security group permits TCP 80 and 443 for the website. SSH remains restricted to the existing operator IP rule. The Sentinel app continues on port 3000.

## Authentication and storage mode

This host uses `AUTH_MODE=local` and `DB_MODE=local` because the AWS organization policy blocks DynamoDB and Fargate provisioning. Local passwords are bcrypt-hashed. Sessions use a random, host-only secret and an HTTP-only, Secure, SameSite cookie. Signup/login endpoints require HTTPS. The local database is persistent across container restarts but is single-host storage; run only one app replica and keep host backups.

The admin page is gated by `LOCAL_ADMIN_EMAILS`. Set it to a comma-separated list of exact staff email addresses in `/home/ubuntu/smart-parking/.env.ec2` (for example, `LOCAL_ADMIN_EMAILS=manager@example.com,staff@example.com`), then recreate the app container. The login page's **Facility staff** choice only selects the sign-in flow; the server still checks this allowlist before serving the console. Add each staff address to the allowlist before they sign in.

## Operations

On the EC2 host:

```bash
cd /home/ubuntu/smart-parking
docker compose -p smart-parking -f docker-compose.ec2.yml ps
docker compose -p smart-parking -f docker-compose.ec2.yml logs --tail 100 app caddy
docker compose -p smart-parking -f docker-compose.ec2.yml restart app
```

The seed data is sample facility data. To update it, run the seed script from inside the app container and restart the app to reload its in-memory cache:

```bash
docker exec smart-parking-app node backend/scripts/seedData.js
docker restart smart-parking-app
```

## Migration to Fargate

When the account's organization policy permits CloudFormation, ECR, ECS, and DynamoDB, use [the Fargate deployment guide](fargate-deployment.md) for managed persistence and Cognito authentication. The [EC2-independent CloudFormation template](fargate-app.yml) remains ready for that migration.
