import type { Pool } from 'pg';
import { AuthError } from './auth-core';

export interface OnboardingInput {
  displayName: string;
  creatorType: string;
  aliases: string[];
  workspaceName: string;
  workspaceIcon: string;
  connectorPreference: string;
}
export function validateOnboarding(value: unknown): OnboardingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'Invalid setup details.');
  const input = value as Record<string, unknown>;
  const allowed = ['displayName','creatorType','aliases','workspaceName','workspaceIcon','connectorPreference'];
  if (Object.keys(input).some(key=>!allowed.includes(key))) throw new AuthError(400, 'Unexpected setup field.');
  function text(key: string, limit: number) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new AuthError(400, `Please provide a valid ${key}.`);
    }
    return value.trim();
  }
  const displayName=text('displayName',100),workspaceName=text('workspaceName',100);
  const creatorType=text('creatorType',30),workspaceIcon=text('workspaceIcon',30),connectorPreference=text('connectorPreference',30);
  if (!['personal','learning','work','creative','exploring','podcaster','producer','creator','team'].includes(creatorType) ||
      !['mic','film','video','folder','rocket','star','music','briefcase','home','sparkles'].includes(workspaceIcon) ||
      !['gdrive','local','sample','none'].includes(connectorPreference)) throw new AuthError(400, 'Invalid setup selection.');
  if (!Array.isArray(input.aliases) || input.aliases.length < 1 || input.aliases.length > 20 ||
      input.aliases.some(alias=>typeof alias !== 'string' || !alias.trim() || alias.trim().length > 64 || /[\u0000-\u001f\u007f]/.test(alias))) {
    throw new AuthError(400, 'Provide between 1 and 20 aliases, each up to 64 characters.');
  }
  const aliases=[...new Set((input.aliases as string[]).map(alias=>alias.trim().normalize('NFKC').toLowerCase()))];
  if (aliases.some(alias=>alias.length>64)) throw new AuthError(400, 'An alias is too long.');
  return {displayName,workspaceName,creatorType,workspaceIcon,connectorPreference,aliases};
}
export function createOnboarding(pool: Pool) {
  return {
    async read(userId: string) {
      const result=await pool.query(`SELECT u.id,u.email,u.name,p.creator_type,p.aliases,p.connector_preference,
        p.onboarding_completed_at,w.id AS workspace_id,w.name AS workspace_name,w.icon AS workspace_icon
        FROM public.users u LEFT JOIN saas.user_profiles p ON p.user_id=u.id
        LEFT JOIN saas.workspaces w ON w.user_id=p.user_id AND w.id=p.first_workspace_id WHERE u.id=$1`,[userId]);
      const row=result.rows[0];
      if (!row) throw new AuthError(401,'Please sign in again.');
      return { user:{id:row.id,email:row.email,name:row.name}, completed:Boolean(row.onboarding_completed_at),
        profile:row.onboarding_completed_at ? {creatorType:row.creator_type as string,aliases:row.aliases as string[],
          connectorPreference:row.connector_preference as string,completedAt:row.onboarding_completed_at} : null,
        workspace:row.workspace_id ? {id:row.workspace_id as string,name:row.workspace_name as string,icon:row.workspace_icon as string}:null };
    },
    async save(userId: string, value: unknown) {
      const input=validateOnboarding(value), db=await pool.connect();
      try {
        await db.query('BEGIN');
        // Serialize repeat submissions and profile updates for this account.
        const user=await db.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[userId]);
        if (!user.rowCount) throw new AuthError(401,'Please sign in again.');
        const previous=await db.query('SELECT first_workspace_id FROM saas.user_profiles WHERE user_id=$1',[userId]);
        let workspaceId=previous.rows[0]?.first_workspace_id as string|undefined;
        if (workspaceId) {
          await db.query('UPDATE saas.workspaces SET name=$1,icon=$2,updated_at=now() WHERE user_id=$3 AND id=$4',
            [input.workspaceName,input.workspaceIcon,userId,workspaceId]);
        } else {
          workspaceId=(await db.query('INSERT INTO saas.workspaces(user_id,name,icon) VALUES($1,$2,$3) RETURNING id',
            [userId,input.workspaceName,input.workspaceIcon])).rows[0].id;
        }
        await db.query('UPDATE public.users SET name=$1 WHERE id=$2',[input.displayName,userId]);
        await db.query(`INSERT INTO saas.user_profiles(user_id,creator_type,aliases,first_workspace_id,connector_preference)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET creator_type=excluded.creator_type,
          aliases=excluded.aliases,connector_preference=excluded.connector_preference,updated_at=now()`,
          [userId,input.creatorType,input.aliases,workspaceId,input.connectorPreference]);
        await db.query('COMMIT');
      } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
      return this.read(userId);
    },
  };
}
