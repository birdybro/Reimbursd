// SPDX-License-Identifier: GPL-3.0-only
import {
  CalendarDays,
  CircleAlert,
  FileText,
  LoaderCircle,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatMinorUnits,
  getPurchaseDate,
  supportedCurrencyCodes,
  type Receipt,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';
import appIcon from '../../mobile/assets/icon.png';
import { ApiRequestError, ReimbursdWebApi, type WebApi } from './api-client.js';
import { createHostedReceiptInput, formatDraftTotal, type ReceiptDraft } from './receipt-draft.js';

const developmentOwnerId = '00000000-0000-4000-8000-000000000001';

type ReceiptState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly message: string; readonly status: 'error' }
  | { readonly receipts: readonly Receipt[]; readonly status: 'ready' };

export interface AppProps {
  readonly api?: WebApi;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

export function App({
  api: suppliedApi,
  idFactory = () => crypto.randomUUID(),
  now = () => new Date(),
}: AppProps) {
  const api = useMemo(
    () =>
      suppliedApi ??
      new ReimbursdWebApi({
        basePath: import.meta.env.VITE_REIMBURSD_API_BASE_PATH ?? '/api',
      }),
    [suppliedApi],
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [identity, setIdentity] = useState(developmentOwnerId);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState>({ status: 'idle' });
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const signOut = (message: string | null = null) => {
    setAccessToken(null);
    setReceiptState({ status: 'idle' });
    setSearch('');
    setShowCreate(false);
    setIdentityError(message);
  };

  const loadReceipts = async (token: string) => {
    setReceiptState({ status: 'loading' });

    try {
      const receipts = await api.listReceipts(token);
      setReceiptState({ receipts, status: 'ready' });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        signOut('Development access expired.');
        return;
      }

      setReceiptState({ message: 'Receipts could not be loaded.', status: 'error' });
    }
  };

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthenticating(true);
    setIdentityError(null);

    try {
      const session = await api.createDevelopmentSession(identity.trim());
      setAccessToken(session.accessToken);
      await loadReceipts(session.accessToken);
    } catch {
      setIdentityError('Development access could not be created.');
    } finally {
      setAuthenticating(false);
    }
  };

  const createReceipt = async (draft: ReceiptDraft) => {
    if (!accessToken) {
      throw new Error('Development access is unavailable.');
    }

    const timestamp = now();
    const input = createHostedReceiptInput(draft, {
      idFactory,
      now: () => timestamp,
      timezoneOffsetMinutes: timestamp.getTimezoneOffset(),
    });

    try {
      const created = await api.createReceipt(accessToken, input);
      setReceiptState((current) => ({
        receipts:
          current.status === 'ready'
            ? sortReceipts([created, ...current.receipts.filter(({ id }) => id !== created.id)])
            : [created],
        status: 'ready',
      }));
      setShowCreate(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        signOut('Development access expired.');
      }

      throw error;
    }
  };

  if (!accessToken) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="brand-lockup">
            <img alt="" className="brand-mark brand-mark-large" src={appIcon} />
            <div>
              <h1 id="auth-title">Reimbursd</h1>
              <p>Self-hosted web</p>
            </div>
          </div>
          <div className="development-notice">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Development authentication</span>
          </div>
          <form className="auth-form" onSubmit={submitIdentity}>
            <label htmlFor="development-identity">Development identity</label>
            <input
              autoComplete="off"
              id="development-identity"
              maxLength={36}
              onChange={(event) => setIdentity(event.target.value)}
              required
              spellCheck={false}
              type="text"
              value={identity}
            />
            {identityError ? (
              <p className="inline-error" role="alert">
                <CircleAlert aria-hidden="true" size={17} />
                {identityError}
              </p>
            ) : null}
            <button className="primary-button full-width" disabled={authenticating} type="submit">
              {authenticating ? (
                <LoaderCircle aria-hidden="true" className="spin" size={18} />
              ) : (
                <ShieldCheck aria-hidden="true" size={18} />
              )}
              {authenticating ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-footer">Scan it. Verify it. Own your data.</p>
        </section>
      </main>
    );
  }

  const receipts = receiptState.status === 'ready' ? receiptState.receipts : [];
  const normalizedSearch = search.trim().toLocaleLowerCase('en-US');
  const filteredReceipts = receipts.filter(
    ({ merchantName, notes }) =>
      normalizedSearch.length === 0 ||
      merchantName.toLocaleLowerCase('en-US').includes(normalizedSearch) ||
      notes.toLocaleLowerCase('en-US').includes(normalizedSearch),
  );
  const currencies = new Set(receipts.map(({ currencyCode }) => currencyCode)).size;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="compact-brand">
          <img alt="" className="brand-mark" src={appIcon} />
          <strong>Reimbursd</strong>
          <span>Hosted workspace</span>
        </div>
        <div className="topbar-actions">
          <span className="environment-status">
            <span aria-hidden="true" className="status-dot" />
            Development
          </span>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={() => signOut()}
            title="Sign out"
            type="button"
          >
            <LogOut aria-hidden="true" size={19} />
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Primary navigation">
        <button aria-current="page" className="nav-item" type="button">
          <ReceiptText aria-hidden="true" size={19} />
          Receipts
        </button>
        <div className="sidebar-identity">
          <span>Identity</span>
          <code>{shortIdentity(identity)}</code>
        </div>
      </aside>

      <main className="workspace">
        <section className="workspace-heading">
          <div>
            <p className="section-kicker">Expense ledger</p>
            <h1>Receipts</h1>
          </div>
          <button className="primary-button" onClick={() => setShowCreate(true)} type="button">
            <Plus aria-hidden="true" size={18} />
            New expense
          </button>
        </section>

        <section className="summary-band" aria-label="Receipt summary">
          <Summary label="Active receipts" value={receipts.length.toString()} />
          <Summary label="Currencies" value={currencies.toString()} />
          <Summary
            label="Latest purchase"
            value={receipts[0] ? formatPurchaseDate(receipts[0].purchasedAt) : '—'}
          />
        </section>

        <section className="ledger" aria-labelledby="ledger-title">
          <div className="ledger-toolbar">
            <div>
              <h2 id="ledger-title">All receipts</h2>
              <p>{filteredReceipts.length} shown</p>
            </div>
            <label className="search-field">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Search receipts</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search merchant or notes"
                type="search"
                value={search}
              />
            </label>
          </div>

          {receiptState.status === 'loading' ? <LoadingState /> : null}
          {receiptState.status === 'error' ? (
            <ErrorState
              message={receiptState.message}
              onRetry={() => void loadReceipts(accessToken)}
            />
          ) : null}
          {receiptState.status === 'ready' && filteredReceipts.length === 0 ? (
            <EmptyState
              hasSearch={normalizedSearch.length > 0}
              onCreate={() => setShowCreate(true)}
            />
          ) : null}
          {receiptState.status === 'ready' && filteredReceipts.length > 0 ? (
            <ReceiptLedger receipts={filteredReceipts} />
          ) : null}
        </section>
      </main>

      {showCreate ? (
        <CreateReceiptDialog
          now={now}
          onClose={() => setShowCreate(false)}
          onSubmit={createReceipt}
        />
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="ledger-state" role="status">
      <LoaderCircle aria-hidden="true" className="spin" size={24} />
      <span>Loading receipts…</span>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="ledger-state ledger-error" role="alert">
      <CircleAlert aria-hidden="true" size={24} />
      <span>{message}</span>
      <button className="secondary-button" onClick={onRetry} type="button">
        <RefreshCw aria-hidden="true" size={17} />
        Retry
      </button>
    </div>
  );
}

function EmptyState({
  hasSearch,
  onCreate,
}: {
  readonly hasSearch: boolean;
  readonly onCreate: () => void;
}) {
  return (
    <div className="empty-state">
      <FileText aria-hidden="true" size={32} />
      <h3>{hasSearch ? 'No matching receipts' : 'No hosted receipts'}</h3>
      {!hasSearch ? (
        <button className="secondary-button" onClick={onCreate} type="button">
          <Plus aria-hidden="true" size={17} />
          New expense
        </button>
      ) : null}
    </div>
  );
}

function ReceiptLedger({ receipts }: { readonly receipts: readonly Receipt[] }) {
  return (
    <div className="receipt-table" role="table" aria-label="Hosted receipts">
      <div className="receipt-row receipt-header" role="row">
        <span role="columnheader">Merchant</span>
        <span role="columnheader">Purchase date</span>
        <span role="columnheader">Currency</span>
        <span role="columnheader">Total</span>
      </div>
      {receipts.map((receipt) => (
        <div className="receipt-row" key={receipt.id} role="row">
          <div className="merchant-cell" role="cell">
            <span className="merchant-icon" aria-hidden="true">
              <ReceiptText size={17} />
            </span>
            <div>
              <strong>{receipt.merchantName}</strong>
              <span>{receipt.notes || 'Manual expense'}</span>
            </div>
          </div>
          <span className="date-cell" role="cell">
            <CalendarDays aria-hidden="true" size={16} />
            {formatPurchaseDate(receipt.purchasedAt)}
          </span>
          <span className="currency-cell" role="cell">
            {receipt.currencyCode}
          </span>
          <strong className="amount-cell" role="cell">
            {formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function CreateReceiptDialog({
  now,
  onClose,
  onSubmit,
}: {
  readonly now: () => Date;
  readonly onClose: () => void;
  readonly onSubmit: (draft: ReceiptDraft) => Promise<void>;
}) {
  const merchantInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ReceiptDraft>(() => ({
    currencyCode: 'USD',
    merchantName: '',
    notes: '',
    purchaseDate: localDate(now()),
    subtotal: '',
    tax: '',
    tip: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    merchantInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const update = <Key extends keyof ReceiptDraft>(key: Key, value: ReceiptDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSubmit(draft);
    } catch {
      setError('Expense could not be saved. Check each value and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="create-title"
        aria-modal="true"
        className="modal-panel"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="section-kicker">Manual entry</p>
            <h2 id="create-title">New expense</h2>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <form className="expense-form" onSubmit={submit}>
          <label className="field field-wide">
            <span>Merchant</span>
            <input
              maxLength={200}
              onChange={(event) => update('merchantName', event.target.value)}
              ref={merchantInput}
              required
              type="text"
              value={draft.merchantName}
            />
          </label>
          <label className="field">
            <span>Purchase date</span>
            <input
              onChange={(event) => update('purchaseDate', event.target.value)}
              required
              type="date"
              value={draft.purchaseDate}
            />
          </label>
          <label className="field">
            <span>Currency</span>
            <select
              onChange={(event) =>
                update('currencyCode', event.target.value as SupportedCurrencyCode)
              }
              value={draft.currencyCode}
            >
              {supportedCurrencyCodes.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Subtotal</span>
            <input
              inputMode="decimal"
              onChange={(event) => update('subtotal', event.target.value)}
              placeholder="0.00"
              required
              type="text"
              value={draft.subtotal}
            />
          </label>
          <label className="field">
            <span>Tax</span>
            <input
              inputMode="decimal"
              onChange={(event) => update('tax', event.target.value)}
              placeholder="0.00"
              type="text"
              value={draft.tax}
            />
          </label>
          <label className="field">
            <span>Tip</span>
            <input
              inputMode="decimal"
              onChange={(event) => update('tip', event.target.value)}
              placeholder="0.00"
              type="text"
              value={draft.tip}
            />
          </label>
          <div className="total-field" aria-live="polite">
            <span>Total</span>
            <strong>{formatDraftTotal(draft)}</strong>
          </div>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea
              maxLength={2_000}
              onChange={(event) => update('notes', event.target.value)}
              rows={3}
              value={draft.notes}
            />
          </label>
          {error ? (
            <p className="inline-error field-wide" role="alert">
              <CircleAlert aria-hidden="true" size={17} />
              {error}
            </p>
          ) : null}
          <div className="form-actions field-wide">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? (
                <LoaderCircle aria-hidden="true" className="spin" size={18} />
              ) : (
                <Plus aria-hidden="true" size={18} />
              )}
              {saving ? 'Saving…' : 'Save expense'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function sortReceipts(receipts: readonly Receipt[]): readonly Receipt[] {
  return [...receipts].sort(
    (left, right) =>
      right.purchasedAt.localeCompare(left.purchasedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}

function formatPurchaseDate(value: string): string {
  const date = getPurchaseDate(value);
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function localDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shortIdentity(identity: string): string {
  return identity.length > 13 ? `${identity.slice(0, 8)}…${identity.slice(-4)}` : identity;
}
