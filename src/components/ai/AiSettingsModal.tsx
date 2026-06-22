"use client";

import { useEffect, useState } from "react";
import { PROVIDERS } from "@/lib/ai/provider";
import {
  getAiCredentials,
  saveAiCredential,
  deleteAiCredential,
  activateAiProvider,
  fetchModels,
} from "@/lib/ai/client";
import ModelCombobox from "./ModelCombobox";

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiSettingsModal({
  isOpen,
  onClose,
}: AiSettingsModalProps) {
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  const [model, setModel] = useState(PROVIDERS[0].defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [configured, setConfigured] = useState<
    {
      provider: string;
      model: string | null;
      base_url: string | null;
      is_active?: boolean;
    }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels] = useState<
    { id: string; label: string }[]
  >([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const meta = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

  // Prefer fetched models; fall back to the curated list. Always include the
  // current value so the select doesn't render blank for a custom/saved model.
  const baseOptions = dynamicModels.length ? dynamicModels : meta.models;
  const modelOptions = baseOptions.some((m) => m.id === model)
    ? baseOptions
    : [{ id: model, label: model }, ...baseOptions];

  const loadModels = async (key?: string) => {
    setModelsLoading(true);
    setError(null);
    const { models, error: e } = await fetchModels(
      provider,
      key || apiKey.trim() || undefined,
      baseUrl.trim() || undefined,
    );
    setModelsLoading(false);
    if (e) {
      setError(e);
      return;
    }
    if (models.length) {
      setDynamicModels(models);
      if (!models.some((m) => m.id === model)) setModel(models[0].id);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setApiKey("");
    setDynamicModels([]);
    getAiCredentials().then(async (creds) => {
      setConfigured(creds);
      if (creds[0]) {
        setProvider(creds[0].provider as typeof provider);
        if (creds[0].model) setModel(creds[0].model);
        setBaseUrl(creds[0].base_url || "");
        // Auto-refresh the model list using the saved key.
        const { models } = await fetchModels(
          creds[0].provider,
          undefined,
          creds[0].base_url || undefined,
        );
        if (models.length) setDynamicModels(models);
      }
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfigured = configured.some((c) => c.provider === provider);
  const isActive = configured.some(
    (c) => c.provider === provider && c.is_active,
  );

  const handleSetActive = async () => {
    setError(null);
    const { ok, error: e } = await activateAiProvider(provider);
    if (!ok) {
      setError(e || "Failed to set active");
      return;
    }
    setConfigured(await getAiCredentials());
  };

  const handleSave = async () => {
    const key = apiKey.trim();
    // A key is only required the first time a provider is set up. When it's
    // already configured, an empty key means "update model/base URL only".
    if (!key && !isConfigured) {
      setError("Enter your API key.");
      return;
    }
    if (meta.requiresBaseUrl && !baseUrl.trim()) {
      setError("This provider needs a Base URL (e.g. https://openrouter.ai/api/v1).");
      return;
    }
    setSaving(true);
    setError(null);
    const { ok, error: saveError } = await saveAiCredential(
      provider,
      key,
      model,
      baseUrl.trim() || undefined,
    );
    setSaving(false);
    if (!ok) {
      setError(saveError || "Failed to save. Is server encryption configured?");
      return;
    }
    setApiKey("");
    setConfigured(await getAiCredentials());
  };

  const handleRemove = async () => {
    await deleteAiCredential(provider);
    setConfigured(await getAiCredentials());
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded sm text-accent">
              auto_awesome
            </span>
            AI Assistant
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-text-tertiary">
            Bring your own API key. It&apos;s encrypted before being stored and
            only ever used on the server to answer your questions.
          </p>

          {error && (
            <div className="p-3 rounded-sm bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">
              Provider
            </label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => {
                  const p =
                    PROVIDERS.find((x) => x.id === e.target.value) ||
                    PROVIDERS[0];
                  setProvider(p.id);
                  setModel(p.defaultModel);
                  const savedBase =
                    configured.find((c) => c.provider === p.id)?.base_url || "";
                  setBaseUrl(savedBase);
                  setDynamicModels([]);
                  if (configured.some((c) => c.provider === p.id)) {
                    fetchModels(p.id, undefined, savedBase || undefined).then(
                      ({ models }) => {
                        if (models.length) setDynamicModels(models);
                      },
                    );
                  }
                }}
                className="w-full appearance-none rounded-sm bg-bg-elevated border border-border pl-3 pr-9 py-2 text-sm outline-none focus:border-accent cursor-pointer"
                style={{
                  color: "var(--color-text-primary)",
                  backgroundColor: "var(--color-bg-elevated)",
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-rounded sm pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary">
                expand_more
              </span>
            </div>
            {isConfigured &&
              (isActive ? (
                <span className="flex items-center gap-1 text-[11px] text-accent">
                  <span className="material-symbols-rounded !text-[13px]">
                    check_circle
                  </span>
                  Active — used for answers
                </span>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-tertiary">
                    Configured, not active
                  </span>
                  <button
                    onClick={handleSetActive}
                    className="text-[11px] text-accent hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    Use this provider
                  </button>
                </div>
              ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-tertiary uppercase tracking-wider">
                Model
              </label>
              <button
                onClick={() => loadModels()}
                disabled={modelsLoading}
                className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
                title="Fetch available models from the provider"
              >
                <span
                  className={`material-symbols-rounded !text-[14px] ${
                    modelsLoading ? "animate-spin" : ""
                  }`}
                >
                  {modelsLoading ? "progress_activity" : "refresh"}
                </span>
                {dynamicModels.length ? "Refresh" : "Load models"}
              </button>
            </div>
            <ModelCombobox
              value={model}
              onChange={setModel}
              options={modelOptions}
              placeholder={meta.defaultModel}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">
              API Key{" "}
              {isConfigured && (
                <span className="text-accent normal-case">· configured</span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                isConfigured ? "•••••• (enter to replace)" : meta.keyHint
              }
              className="w-full rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">
              Base URL{" "}
              <span className="text-text-tertiary normal-case lowercase">
                · optional
              </span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Default — leave blank for the official API"
              className="w-full rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-tertiary">
              For OpenAI-/Anthropic-compatible gateways (OpenRouter, Azure,
              local models, proxies). Web search may not work on third-party
              endpoints.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-5 pt-0">
          {isConfigured ? (
            <button
              onClick={handleRemove}
              className="text-sm text-text-tertiary hover:text-destructive transition-colors cursor-pointer"
            >
              Remove key
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-sm bg-accent hover:bg-accent-hover text-bg-primary text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
