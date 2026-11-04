/** Keep framework/proxy HTML error pages out of the sign-in error message. */
export async function readAuthResponse(response: Response): Promise<{
  error?: string; isNewUser?: boolean; retryAfter?: number;
}> {
  const unavailable='Sign-in is temporarily unavailable. Please try again.';
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error(unavailable);
  let value: unknown;
  try {value=await response.json();} catch {throw new Error(unavailable);}
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error(unavailable);
  return value as {error?:string;isNewUser?:boolean;retryAfter?:number};
}
