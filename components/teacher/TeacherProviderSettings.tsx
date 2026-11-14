'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Trash2 } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { modelsForTeacherProvider, selectTeacherModel } from '@/lib/teacher/provider-defaults';

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

const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:hover:text-white';

const selectTriggerClass =
  'mt-2 !h-12 w-full rounded-xl border-slate-300 bg-white px-3 text-base text-slate-950 shadow-none hover:bg-slate-50 focus-visible:border-violet-500 focus-visible:ring-violet-500/30 data-[size=default]:!h-12 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-50 dark:hover:bg-slate-800';

const selectMenuClass =
  'border-slate-200 bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

const selectItemClass =
  'text-slate-950 focus:bg-violet-600 focus:!text-white data-[highlighted]:bg-violet-600 data-[highlighted]:!text-white dark:text-slate-50';

export function TeacherProviderSettings() {
  const [data, setData] = useState<ProviderResponse | null>(null);
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  const load = async (preserveSelection = false) => {
    const response = await fetch('/api/teacher/providers', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load provider settings');
    const next = (await response.json()) as ProviderResponse;
    setData(next);
    if (preserveSelection) return;
    const selected = next.preference.providerId || next.providers[0]?.id || '';
    const selectedProvider = next.providers.find((provider) => provider.id === selected);
    setProviderId(selected);
    setModelId(
      selectTeacherModel(
        selected,
        selectedProvider?.models ?? [],
        next.preference.providerId === selected ? next.preference.modelId : null,
      ),
    );
  };

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : 'Could not load settings'),
    );
  }, []);

  const models = useMemo(
    () => (data ? modelsForTeacherProvider(data.providers, providerId) : []),
    [data, providerId],
  );
  const provider = useMemo(
    () => data?.providers.find((item) => item.id === providerId),
    [data, providerId],
  );
  const credentials = new Map(data?.credentials.map((item) => [item.providerId, item]));
  const modelIsValid = models.some((model) => model.id === modelId);

  const openProviderForm = (nextProviderId: string) => {
    if (!data) return;
    const next = data.providers.find((item) => item.id === nextProviderId);
    if (!next) return;
    const savedModel = data.preference.providerId === next.id ? data.preference.modelId : null;
    setProviderId(next.id);
    setModelId(selectTeacherModel(next.id, next.models, savedModel));
    setApiKey('');
    setMessage(null);
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ block: 'nearest' });
      apiKeyRef.current?.focus();
    }, 0);
  };

  if (!data) {
    return (
      <div className="flex min-h-48 items-center justify-center text-slate-700 dark:text-slate-200">
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
      if (result.persisted) await load(true);
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
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save credential');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)] lg:items-start">
      <section className="space-y-4">
        {data.providers.map((item) => {
          const credential = credentials.get(item.id);
          const preferred = data.preference.providerId === item.id;
          const active = providerId === item.id;
          return (
            <article
              key={item.id}
              className={cn(
                'scheme-light rounded-2xl border bg-white p-5 text-slate-950 shadow-sm dark:scheme-dark dark:bg-slate-900 dark:text-slate-50',
                active
                  ? 'border-violet-500 ring-2 ring-violet-500/70 dark:border-violet-400 dark:ring-violet-400/70'
                  : 'border-slate-200 dark:border-slate-800',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                    {item.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {credential?.configured
                      ? `API key: ••••••••••${credential.maskedSuffix}`
                      : 'Not configured'}
                  </p>
                  {credential?.configured ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-4" /> Configured ·{' '}
                      {credential.verificationStatus}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      secondaryButtonClass,
                      active &&
                        'border-violet-600 bg-violet-600 text-white hover:border-violet-700 hover:bg-violet-700 hover:text-white dark:border-violet-500 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400 dark:hover:text-slate-950',
                    )}
                    aria-controls="teacher-provider-form"
                    aria-pressed={active}
                    onClick={() => openProviderForm(item.id)}
                  >
                    {credential?.configured ? 'Replace Key' : 'Add API Key'}
                  </button>
                  {credential?.configured ? (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      aria-label={`Test ${item.name} connection`}
                      disabled={busy}
                      onClick={() => void testConnection(item.id, false)}
                    >
                      Test connection
                    </button>
                  ) : null}
                  {credential?.configured ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      aria-label={`Remove ${item.name} credential`}
                      onClick={async () => {
                        if (!window.confirm(`Remove the saved ${item.name} key?`)) return;
                        await fetch('/api/teacher/providers', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ providerId: item.id }),
                        });
                        await load(providerId !== item.id);
                      }}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  ) : null}
                </div>
              </div>
              {preferred ? (
                <p className="mt-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
                  Default provider
                </p>
              ) : null}
            </article>
          );
        })}
      </section>

      <section
        ref={formRef}
        id="teacher-provider-form"
        aria-labelledby="teacher-provider-form-title"
        className="scheme-light h-fit rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-sm lg:sticky lg:top-24 dark:scheme-dark dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
      >
        <div className="flex items-center gap-3">
          <KeyRound className="size-6 text-violet-600 dark:text-violet-300" />
          <h2
            id="teacher-provider-form-title"
            className="text-xl font-bold text-slate-950 dark:text-slate-50"
          >
            {provider ? `Add or replace a ${provider.name} key` : 'Add or replace a key'}
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          The key is sent once to the server, encrypted, and never returned to this browser.
        </p>
        <label htmlFor="teacher-provider-select" className="mt-5 block text-sm font-semibold">
          Provider
        </label>
        <Select
          value={providerId || undefined}
          onValueChange={(next) => {
            const nextProvider = data.providers.find((item) => item.id === next);
            setProviderId(next);
            setModelId(
              selectTeacherModel(
                next,
                nextProvider?.models ?? [],
                data.preference.providerId === next ? data.preference.modelId : null,
              ),
            );
          }}
        >
          <SelectTrigger id="teacher-provider-select" className={selectTriggerClass}>
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent position="popper" className={selectMenuClass}>
            {data.providers.map((item) => (
              <SelectItem key={item.id} value={item.id} className={selectItemClass}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor="teacher-model-select" className="mt-4 block text-sm font-semibold">
          Model
        </label>
        <Select
          key={providerId}
          value={modelIsValid ? modelId : undefined}
          onValueChange={setModelId}
          disabled={models.length === 0}
        >
          <SelectTrigger id="teacher-model-select" className={selectTriggerClass}>
            <SelectValue
              placeholder={models.length === 0 ? 'No models for this provider' : 'Choose a model'}
            />
          </SelectTrigger>
          <SelectContent position="popper" className={selectMenuClass}>
            {models.map((model) => (
              <SelectItem
                key={`${providerId}:${model.id}`}
                value={model.id}
                className={selectItemClass}
              >
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {provider
            ? `${models.length} ${models.length === 1 ? 'model' : 'models'} for ${provider.name}`
            : 'Choose a provider to see its models'}
        </p>
        <label htmlFor="teacher-api-key" className="mt-4 block text-sm font-semibold">
          API key
        </label>
        <input
          ref={apiKeyRef}
          id="teacher-api-key"
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 placeholder:text-slate-400 focus-visible:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste your key"
        />
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Test connection sends a short request with this key. After you save, only the last four
          characters and the connection status come back to this browser.
        </p>
        {message ? (
          <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-100" role="status">
            {message}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className={cn(secondaryButtonClass, 'min-h-12')}
            disabled={
              busy ||
              !(
                (apiKey.trim().length >= 8 && modelIsValid) ||
                credentials.get(providerId)?.configured
              )
            }
            onClick={() => void testConnection()}
          >
            {busy ? 'Checking…' : 'Test connection'}
          </button>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-600 px-5 font-semibold text-white hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || apiKey.trim().length < 8 || !modelIsValid}
            onClick={() => void save()}
          >
            {busy ? 'Saving securely…' : 'Save securely'}
          </button>
        </div>
      </section>
    </div>
  );
}
