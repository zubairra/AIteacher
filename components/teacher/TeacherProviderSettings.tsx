'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Trash2 } from 'lucide-react';

interface ProviderCatalogItem {
  id: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

interface CredentialMetadata {
  providerId: string;
  configured: boolean;
  maskedSuffix?: string;
  verificationStatus?: 'verified' | 'unverified';
  updatedAt?: string;
}

interface ProviderResponse {
  providers: ProviderCatalogItem[];
  credentials: CredentialMetadata[];
  preference: { providerId: string | null; modelId: string | null };
}

export function TeacherProviderSettings() {
  const [data, setData] = useState<ProviderResponse | null>(null);
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch('/api/teacher/providers', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load provider settings');
    const next = (await response.json()) as ProviderResponse;
    setData(next);
    const selected = next.preference.providerId || next.providers[0]?.id || '';
    setProviderId(selected);
    setModelId(
      next.preference.modelId ||
        next.providers.find((provider) => provider.id === selected)?.models[0]?.id ||
        '',
    );
  };

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : 'Could not load settings'),
    );
  }, []);

  const provider = useMemo(
    () => data?.providers.find((item) => item.id === providerId),
    [data, providerId],
  );
  const credentials = new Map(data?.credentials.map((item) => [item.providerId, item]));

  if (!data) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-7 animate-spin" aria-label="Loading provider settings" />
      </div>
    );
  }

  const testConnection = async (targetProviderId = providerId, includeTypedKey = true) => {
    setBusy(true);
    setMessage(null);
    try {
      const typedKey = includeTypedKey ? apiKey.trim() : '';
      const response = await fetch('/api/teacher/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: targetProviderId,
          ...(targetProviderId === providerId && modelId ? { modelId } : {}),
          ...(typedKey.length >= 8 ? { apiKey: typedKey } : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        ok?: boolean;
        maskedSuffix?: string;
        persisted?: boolean;
      };
      if (!response.ok && !result.message)
        throw new Error(result.error || 'Could not test the connection');
      const suffix = result.maskedSuffix ? ` Key ending ${result.maskedSuffix}.` : '';
      setMessage(`${result.message || result.error || 'Connection check finished.'}${suffix}`);
      if (result.persisted) await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not test the connection');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/teacher/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, modelId, apiKey }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save credential');
      setApiKey('');
      setMessage('Credential encrypted and saved. Connection status: unverified.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save credential');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
      <section className="space-y-4">
        {data.providers.map((item) => {
          const credential = credentials.get(item.id);
          const preferred = data.preference.providerId === item.id;
          return (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{item.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {credential?.configured
                      ? `API key: ••••••••••${credential.maskedSuffix}`
                      : 'Not configured'}
                  </p>
                  {credential?.configured ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="size-4" /> Configured ·{' '}
                      {credential.verificationStatus}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold"
                    onClick={() => {
                      setProviderId(item.id);
                      setModelId(
                        (preferred ? data.preference.modelId : null) || item.models[0]?.id || '',
                      );
                      setApiKey('');
                    }}
                  >
                    {credential?.configured ? 'Replace Key' : 'Add API Key'}
                  </button>
                  {credential?.configured ? (
                    <button
                      className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold"
                      aria-label={`Test ${item.name} connection`}
                      disabled={busy}
                      onClick={() => void testConnection(item.id, false)}
                    >
                      Test connection
                    </button>
                  ) : null}
                  {credential?.configured ? (
                    <button
                      className="min-h-11 rounded-xl border border-red-200 px-3 text-red-700"
                      aria-label={`Remove ${item.name} credential`}
                      onClick={async () => {
                        if (!window.confirm(`Remove the saved ${item.name} key?`)) return;
                        await fetch('/api/teacher/providers', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ providerId: item.id }),
                        });
                        await load();
                      }}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  ) : null}
                </div>
              </div>
              {preferred ? (
                <p className="mt-3 text-sm font-semibold text-violet-700">Default provider</p>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <KeyRound className="size-6 text-violet-600" />
          <h2 className="text-xl font-bold">Add or replace a key</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          The key is sent once to the server, encrypted, and never returned to this browser.
        </p>
        <label className="mt-5 block text-sm font-semibold">
          Provider
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3"
            value={providerId}
            onChange={(event) => {
              const next = event.target.value;
              setProviderId(next);
              setModelId(data.providers.find((item) => item.id === next)?.models[0]?.id || '');
            }}
          >
            {data.providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Model
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          >
            {provider?.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-sm font-semibold">
          API key
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste your key"
          />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Test connection sends a short request with this key. After you save, only the last four
          characters and the connection status come back to this browser.
        </p>
        {message ? (
          <p className="mt-4 text-sm font-medium" role="status">
            {message}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold text-slate-900 disabled:opacity-50"
            disabled={
              busy ||
              !((apiKey.trim().length >= 8 && !!modelId) || credentials.get(providerId)?.configured)
            }
            onClick={() => void testConnection()}
          >
            {busy ? 'Checking…' : 'Test connection'}
          </button>
          <button
            className="min-h-12 rounded-xl bg-violet-600 px-5 font-semibold text-white disabled:opacity-50"
            disabled={busy || apiKey.trim().length < 8 || !modelId}
            onClick={() => void save()}
          >
            {busy ? 'Saving securely…' : 'Save securely'}
          </button>
        </div>
      </section>
    </div>
  );
}
