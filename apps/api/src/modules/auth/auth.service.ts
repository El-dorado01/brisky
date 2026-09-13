import { BadRequestException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private defaultUserId = '';

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'brisky-development-secret-key-32-chars-long';
  }

  async onModuleInit() {
    await this.seedDefaultUser();
  }

  getDefaultUserId(): string {
    return this.defaultUserId;
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const computed = scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    if (computed.length !== stored.length) return false;
    return timingSafeEqual(computed, stored);
  }

  createToken(user: { id: string; email: string }): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      iat: now,
      exp: now + 60 * 60 * 24 * 7, // 7 days
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');

    return `${header}.${encodedPayload}.${signature}`;
  }

  verifyToken(token: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid token format');
    const [header, payload, signature] = parts;

    const expectedSig = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new UnauthorizedException('Invalid token signature');
    }

    try {
      const decoded: JwtPayload = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token expired');
      }
      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }
  }

  async register(email: string, password: string, name = ''): Promise<{ token: string; user: AuthUser }> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (existing.rows.length > 0) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const passwordHash = this.hashPassword(password);
    const res = await this.db.query<AuthUser>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [normalized, passwordHash, name],
    );
    const user = res.rows[0];
    const token = this.createToken(user);
    return { token, user };
  }

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const normalized = email.trim().toLowerCase();
    const res = await this.db.query<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      created_at: string;
    }>('SELECT id, email, password_hash, name, created_at FROM users WHERE email = $1', [
      normalized,
    ]);

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const row = res.rows[0];
    const match = this.verifyPassword(password, row.password_hash);
    if (!match) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      created_at: row.created_at,
    };
    const token = this.createToken(user);
    return { token, user };
  }

  async getMe(userId: string): Promise<AuthUser | null> {
    const res = await this.db.query<AuthUser>(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [userId],
    );
    return res.rows[0] || null;
  }

  private async seedDefaultUser() {
    try {
      const defaultEmail = 'demo@brisky.local';
      const existing = await this.db.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [defaultEmail],
      );
      if (existing.rows.length > 0) {
        this.defaultUserId = existing.rows[0].id;
        this.logger.log(`Default user loaded (${this.defaultUserId})`);
        return;
      }

      const passwordHash = this.hashPassword('demopassword123');
      const res = await this.db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [defaultEmail, passwordHash, 'Demo Creator'],
      );
      this.defaultUserId = res.rows[0].id;
      this.logger.log(`Seeded default demo user (${defaultEmail} / ${this.defaultUserId})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not seed default user: ${message}`);
    }
  }
}
