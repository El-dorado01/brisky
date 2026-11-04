import { CanActivate,ExecutionContext,Injectable,UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';

/** Integration-only authentication. Developer JWT endpoints retain their existing guard. */
@Injectable()
export class SaasSessionGuard implements CanActivate {
  constructor(private readonly db:DatabaseService){}
  async canActivate(context:ExecutionContext){
    const request=context.switchToHttp().getRequest();
    const header=request.headers?.authorization;
    if(typeof header!=='string'||!/^SaaS [A-Za-z0-9_-]{43}$/.test(header))throw new UnauthorizedException('SaaS session required');
    const hash=createHash('sha256').update(header.slice(5)).digest('hex');
    const found=await this.db.query('SELECT user_id FROM saas.sessions WHERE token_hash=$1 AND expires_at>now()',[hash]);
    if(!found.rowCount)throw new UnauthorizedException('SaaS session expired');
    request.user={id:found.rows[0].user_id};return true;
  }
}
