import { builtinParts, type Part, type PartsById, type Setup, type SetupDoc, type SetupMeta } from '@viz/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check that the app is still running.', 0);
  }
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? `The server answered ${res.status}.`, res.status, data);
  return data as T;
}

export interface ServerInfo {
  name: string;
  port: number | null;
  lanUrls: string[];
}

export interface SaveBody {
  doc: SetupDoc;
  baseVersion: number;
  force?: boolean;
  thumb?: string;
}

export const api = {
  info: () => request<ServerInfo>('GET', '/api/info'),

  listParts: () => request<Part[]>('GET', '/api/parts'),
  createPart: (part: Omit<Part, 'id'>) => request<Part>('POST', '/api/parts', part),
  updatePart: (part: Part) => request<Part>('PUT', `/api/parts/${part.id}`, part),
  deletePart: (id: string) => request<{ ok: true }>('DELETE', `/api/parts/${id}`),

  async uploadFile(data: Blob | ArrayBuffer, ext: 'glb' | 'png' | 'jpg'): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`/api/files?ext=${ext}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: data });
    } catch {
      throw new ApiError('Could not reach the server. Check that the app is still running.', 0);
    }
    const body = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(body?.error ?? `The upload failed (${res.status}).`, res.status);
    return body.file as string;
  },

  listSetups: () => request<SetupMeta[]>('GET', '/api/setups'),
  createSetup: (name: string) => request<Setup>('POST', '/api/setups', { name }),
  getSetup: (id: string) => request<Setup>('GET', `/api/setups/${id}`),
  saveSetup: (id: string, body: SaveBody, keepalive = false) => request<SetupMeta>('PUT', `/api/setups/${id}`, body, { keepalive }),
  duplicateSetup: (id: string) => request<Setup>('POST', `/api/setups/${id}/duplicate`),
  deleteSetup: (id: string) => request<{ ok: true }>('DELETE', `/api/setups/${id}`),
  getShared: (token: string) => request<Setup>('GET', `/api/share/${token}`),
};

export const fileUrl = (name: string): string => `/files/${name}`;

/** Bundled parts plus the ones uploaded to this server. */
export async function loadAllParts(): Promise<Part[]> {
  const uploaded = await api.listParts();
  return [...uploaded, ...builtinParts()];
}

export const byId = (parts: Part[]): PartsById => Object.fromEntries(parts.map((p) => [p.id, p]));
