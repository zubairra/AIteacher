/** A configuration problem the teacher can act on. Never includes a secret. */
export class ProviderSetupError extends Error {
  readonly errorCode = 'AI_PROVIDER_SETUP_REQUIRED' as const;
  readonly status = 400;

  constructor(message = 'Add an API key in Settings, or set OPENROUTER_API_KEY on the server.') {
    super(message);
    this.name = 'ProviderSetupError';
  }
}
