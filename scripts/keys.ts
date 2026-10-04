import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
const vapid = webpush.generateVAPIDKeys();
console.log(`CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nVAPID_PUBLIC_KEY=${vapid.publicKey}\nVAPID_PRIVATE_KEY=${vapid.privateKey}`);
