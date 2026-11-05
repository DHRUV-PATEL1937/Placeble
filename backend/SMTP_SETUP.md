# Gmail email delivery

Set these server environment variables in Coolify (never commit credentials):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-google-workspace-mailbox
SMTP_PASSWORD=your-google-app-password
EMAIL_FROM=noreply@placeble.in
APP_ORIGIN=https://your-public-frontend-domain
```

Enable Google 2-Step Verification and create an App Password. `noreply@placeble.in`
must be a real Workspace mailbox or an authorized, verified send-as alias of
SMTP_USER. Configure SPF, DKIM and DMARC for placeble.in in the Workspace admin
console/DNS. Port 587 is also supported and requires STARTTLS. TLS certificate
validation is never disabled.

Redeploy after configuration. Without credentials no email is claimed as sent;
invitation APIs report provider_not_configured. They report queued when persisted,
not delivered. The MongoDB EmailMessage outbox retries up to five times with
backoff, uses a two-minute claim lease, and marks exhausted messages failed.
Monitor failed messages in that collection. Delivery is at-least-once across a
crash after SMTP acceptance; stable Message-ID and queue keys minimize duplicates.
Payloads are AES-GCM encrypted using a key derived from JWT_REFRESH_SECRET and
cleared after delivery. Do not rotate that secret with pending messages.

Coverage: invitation/credential reissue, password reset and password change alerts,
student/recruiter email verification, student approval/rejection, company access
decisions, institution request acknowledgments, and new workflow inbox
notifications (placement drives, shortlisting, interventions and action plans).
Existing historical notifications are not backfilled. Account approval rules are
unchanged. Recovery links expire in 30 minutes; verification in 24 hours. Tokens
are hashed, single use, and consumed only by explicit POST confirmation.

Public recovery/verification routes have per-process IP limits and a durable
per-account one-minute cooldown. For multiple replicas, add shared edge rate
limiting. Gmail sending quotas still apply; large deployments should use a
transactional provider. Confirm a real test invitation and recovery email after
deploying; a successful build does not establish live delivery.

Google documentation:
- https://support.google.com/accounts/answer/185833
- https://support.google.com/mail/answer/22370
