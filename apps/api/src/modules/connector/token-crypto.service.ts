import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class TokenCryptoService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('CONNECTOR_ENCRYPTION_KEY', '');
    if (!rawKey) {
      throw new Error(
        'CONNECTOR_ENCRYPTION_KEY is required to initialize TokenCryptoService. Refusing to use ephemeral key which invalidates stored OAuth tokens.',
      );
    } else if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      this.key = Buffer.from(rawKey, 'hex');
    } else {
      // If it's a plain string, hash or pad to 32 bytes
      this.key = createHash('sha256').update(rawKey).digest();
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Format: iv_hex:authTag_hex:ciphertext_hex
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts ciphertext using AES-256-GCM and verifies authenticity.
   */
  decrypt(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  encryptJson(obj: unknown): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptJson<T>(encryptedPayload: string): T {
    const jsonStr = this.decrypt(encryptedPayload);
    return JSON.parse(jsonStr) as T;
  }
}
