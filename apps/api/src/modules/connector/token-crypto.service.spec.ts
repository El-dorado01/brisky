import { TokenCryptoService } from './token-crypto.service';

describe('TokenCryptoService', () => {
  const fakeConfig = {
    get: (key: string, def?: string) => {
      if (key === 'CONNECTOR_ENCRYPTION_KEY') {
        return '29a4c79d0aab2fb3895e5618145f5c2022bc31572a2e6eeec2eee620551e7a09';
      }
      return def;
    },
  };

  it('encrypts and decrypts string round-trip', () => {
    const service = new TokenCryptoService(fakeConfig as any);
    const secret = 'ya29.a0AfH6SMD_test_token_string_12345';

    const encrypted = service.encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('encrypts and decrypts JSON round-trip', () => {
    const service = new TokenCryptoService(fakeConfig as any);
    const tokens = {
      access_token: 'test_access',
      refresh_token: 'test_refresh',
      expiry_date: 1735689600000,
    };

    const encrypted = service.encryptJson(tokens);
    const decrypted = service.decryptJson<typeof tokens>(encrypted);

    expect(decrypted).toEqual(tokens);
  });

  it('rejects tampered ciphertext or auth tag', () => {
    const service = new TokenCryptoService(fakeConfig as any);
    const encrypted = service.encrypt('sensitive data');
    const parts = encrypted.split(':');

    // Tamper ciphertext
    const tamperedCipher = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -2) + 'ff';
    expect(() => service.decrypt(tamperedCipher)).toThrow();

    // Tamper auth tag
    const tamperedTag = parts[0] + ':' + '00'.repeat(16) + ':' + parts[2];
    expect(() => service.decrypt(tamperedTag)).toThrow();
  });
});
