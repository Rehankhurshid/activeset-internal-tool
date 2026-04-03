export function isCronAuthorized(request: Pick<Request, 'headers'>): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return true;

  const authorization = request.headers.get('authorization');
  if (authorization === `Bearer ${expectedSecret}`) {
    return true;
  }

  return request.headers.get('x-cron-secret') === expectedSecret;
}

export function getCronSecretHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return {};

  return {
    Authorization: `Bearer ${secret}`,
    'x-cron-secret': secret,
  };
}
