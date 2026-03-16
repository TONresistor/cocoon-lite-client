// --- Auth token ---

const params = new URLSearchParams(window.location.search);
const AUTH_TOKEN = params.get('token') || '';
// Clean URL without token
if (AUTH_TOKEN) {
  window.history.replaceState({}, '', window.location.pathname);
}

// --- Types ---

export interface SetupStatus {
  hasWallet: boolean;
  hasConfig: boolean;
  ownerAddress?: string;
  nodeAddress?: string;
}

export interface GeneratedWallet {
  mnemonic: string[];
  ownerAddress: string;
  nodeAddress: string;
}

export interface ImportedWallet {
  ownerAddress: string;
  nodeAddress: string;
}

export interface WriteConfigResult {
  ok: true;
  httpPort: number;
}

export interface BalanceResult {
  nano: string;
  ton: string;
}

export interface TransferResult {
  seqno: number;
  status: 'sent' | 'confirmed' | 'timeout';
}

export interface ClientStatus {
  running: boolean;
  pid?: number;
  httpPort?: number;
  uptime?: number;
}

export interface ClientStartResult {
  status: 'starting';
  httpPort: number;
}

export interface WalletBalanceInfo {
  address: string;
  balance: { nano: string; ton: string } | null;
}

export interface WalletInfo {
  owner: WalletBalanceInfo;
  cocoon: WalletBalanceInfo;
}

export interface TransactionResult {
  status: 'sent' | 'confirmed' | 'error';
  seqno?: number;
  message?: string;
}

export interface UnstakeResult {
  status: 'closing' | 'closed' | 'transferred' | 'error';
  step: 1 | 2 | 3;
  message?: string;
}

export interface JsonStats {
  status: {
    wallet_balance: number;
    ton_last_synced_at: number;
    enabled: boolean;
    git_commit?: string;
    git_commit_data?: string;
  };
  stats: Record<string, number[]>;
  wallet: {
    address: string;
    balance: number;
    seqno: number;
    pending_transactions_cnt: number;
    active_transactions_cnt: number;
  };
  localconf: {
    root_address: string;
    owner_address: string;
  };
  proxy_connections: Array<{
    address: string;
    is_ready: boolean;
    proxy_sc_address: string;
  }>;
  proxies: Array<{
    proxy_sc_address: string;
    sc_address: string;
    state: number;
    tokens_payed: number;
    tokens_charged: number;
    tokens_used_proxy_committed_to_blockchain: number;
    tokens_used_proxy_committed_to_db: number;
    tokens_used_proxy_max: number;
  }>;
  root_contract_config: {
    registered_proxies: Array<{
      seqno: number;
      address_for_clients: string;
      address_for_workers: string;
    }>;
    price_per_token: number;
    version: number;
    proxy_min_stake: number;
    client_min_stake: number;
    [key: string]: unknown;
  };
}

export interface Model {
  id: string;
  owned_by: string;
}

export interface ModelsResponse {
  data: Model[];
}

// --- Fetch helper ---

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers, ...rest } = options ?? {};
  const res = await fetch(url, {
    cache: 'no-store',
    ...rest,
    headers: {
      ...(headers as Record<string, string> | undefined),
      ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, text);
  }
  return res.json();
}

/** Wrapper that forwards TanStack Query's abort signal. */
function queryFn<T>(url: string) {
  return ({ signal }: { signal: AbortSignal }) => request<T>(url, { signal });
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// --- Setup API ---

export const setupApi = {
  getStatus: queryFn<SetupStatus>('/api/setup/status'),
  generateWallet: () => post<GeneratedWallet>('/api/setup/generate-wallet'),
  importWallet: (walletJson: object) =>
    post<ImportedWallet>('/api/setup/import-wallet', { walletJson }),
  writeConfig: (instance: number, apiKey?: string) =>
    post<WriteConfigResult>('/api/setup/write-config', { instance, apiKey }),
  getBalance: (address: string) =>
    request<BalanceResult>(`/api/setup/balance/${encodeURIComponent(address)}`),
  transfer: (to: string, amount: string) =>
    post<TransferResult>('/api/setup/transfer', { to, amount }),
};

// --- Client API ---

export const clientApi = {
  getStatus: queryFn<ClientStatus>('/api/client/status'),
  start: (opts?: { routerPolicy?: 'any' | 'tdx'; verbosity?: string }) =>
    post<ClientStartResult>('/api/client/start', opts),
  stop: () => post<{ status: 'stopping' }>('/api/client/stop'),
};

// --- Proxy API ---

export const proxyApi = {
  getJsonStats: queryFn<JsonStats>('/api/jsonstats'),
  getModels: queryFn<ModelsResponse>('/api/v1/models'),
  chatCompletions: (
    body: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      temperature?: number;
    },
    signal?: AbortSignal,
  ) =>
    fetch('/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    }),
};

// --- Wallet API ---

export const walletApi = {
  getInfo: queryFn<WalletInfo>('/api/wallet/info'),
  withdraw: (amount: string) =>
    post<TransactionResult>('/api/wallet/withdraw', { amount }),
  unstake: () => post<UnstakeResult>('/api/wallet/unstake'),
  cashout: (amount: string, destination: string) =>
    post<TransactionResult>('/api/wallet/cashout', { amount, destination }),
};
