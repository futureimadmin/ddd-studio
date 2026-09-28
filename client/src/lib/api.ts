/**
 * Typed client for the DDD Studio API.
 *
 * Types come from the server's Zod model via type-only imports, so the two can never drift
 * and nothing from the server is bundled into the browser.
 */
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import type { DomainDesign } from '@server/ai/design-schema';
import type { DomainExportDocument } from '@server/domain/export';
import type {
  Connection,
  ConnectionInput,
  Context,
  ContextInput,
  ContextUpdate,
  DomainNode,
  DomainNodeInput,
  DomainNodeUpdate,
  GlossaryInput,
  GlossaryTerm,
  ModelValidation,
  Relationship,
  RelationshipInput,
  RelationshipUpdate,
  SchemaSnapshot,
  WorkspaceSnapshot,
} from '@server/domain/model';

export type {
  Connection,
  Context,
  DomainDesign,
  DomainNode,
  GlossaryTerm,
  Relationship,
  SchemaSnapshot,
  WorkspaceSnapshot,
};

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason, e.g. `credentials_required`. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function describe(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const { error, issues } = body as { error?: unknown; issues?: Array<{ message?: string }> };
  const head = typeof error === 'string' && error ? error : fallback;
  const detail = Array.isArray(issues)
    ? issues
        .slice(0, 3)
        .map((i) => i.message)
        .filter(Boolean)
        .join('; ')
    : '';
  // Zod errors already spell out every problem in `error`; model-rule issues add to it.
  return detail && !head.includes(detail) ? `${head}: ${detail}` : head;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the DDD Studio server. Is it running?', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const code = parsed && typeof parsed === 'object' ? (parsed as { code?: string }).code : undefined;
    throw new ApiError(describe(parsed, `Request failed (${res.status})`), res.status, code);
  }
  return parsed as T;
}

// ------------------------------------------------------------------ query keys

export const getGetWorkspaceQueryKey = () => ['workspace'] as const;
export const getListBoundedContextsQueryKey = () => ['bounded-contexts'] as const;
export const getListDomainNodesQueryKey = () => ['domain-nodes'] as const;
export const getListRelationshipsQueryKey = () => ['relationships'] as const;
export const getListGlossaryQueryKey = () => ['glossary'] as const;
export const getListSchemaConnectionsQueryKey = () => ['schema-connections'] as const;
const healthKey = ['health'] as const;
const aiStatusKey = ['ai-auth-status'] as const;

/** Refresh everything derived from the model (after any create / update / delete / AI apply). */
export function invalidateModel(queryClient: QueryClient) {
  for (const queryKey of [
    getGetWorkspaceQueryKey(),
    getListBoundedContextsQueryKey(),
    getListDomainNodesQueryKey(),
    getListRelationshipsQueryKey(),
    getListGlossaryQueryKey(),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

// ------------------------------------------------------------------ queries

export const useGetWorkspace = () =>
  useQuery({ queryKey: getGetWorkspaceQueryKey(), queryFn: () => request<WorkspaceSnapshot>('GET', '/workspace') });
export const useListBoundedContexts = () =>
  useQuery({ queryKey: getListBoundedContextsQueryKey(), queryFn: () => request<Context[]>('GET', '/bounded-contexts') });
export const useListDomainNodes = () =>
  useQuery({ queryKey: getListDomainNodesQueryKey(), queryFn: () => request<DomainNode[]>('GET', '/domain-nodes') });
export const useListRelationships = () =>
  useQuery({ queryKey: getListRelationshipsQueryKey(), queryFn: () => request<Relationship[]>('GET', '/relationships') });
export const useListGlossary = () =>
  useQuery({ queryKey: getListGlossaryQueryKey(), queryFn: () => request<GlossaryTerm[]>('GET', '/glossary') });
export const useListSchemaConnections = () =>
  useQuery({ queryKey: getListSchemaConnectionsQueryKey(), queryFn: () => request<Connection[]>('GET', '/schema-connections') });

/** Server reachability, polled — drives the "API online" indicator. */
export const useHealth = () =>
  useQuery({
    queryKey: healthKey,
    queryFn: () => request<{ status: string; persistence: { file: string } }>('GET', '/healthz'),
    refetchInterval: 15_000,
    retry: false,
  });

export type AiAuthStatus = {
  ok: boolean;
  mode: 'vertex-adc' | 'offline';
  project: string | null;
  location: string | null;
  reason: string | null;
};
export const useAiAuthStatus = (enabled: boolean) =>
  useQuery({
    queryKey: aiStatusKey,
    queryFn: () => request<AiAuthStatus>('GET', '/ai/auth-status'),
    enabled,
    staleTime: 0,
    retry: false,
  });

// ------------------------------------------------------------------ mutations

export const useUpdateWorkspace = () =>
  useMutation({ mutationFn: (v: { data: { projectName: string } }) => request<WorkspaceSnapshot>('PATCH', '/workspace', v.data) });
export const useResetWorkspace = () =>
  useMutation({ mutationFn: (v: { data: { seedSample: boolean } }) => request<WorkspaceSnapshot>('POST', '/workspace/reset', v.data) });

export const useCreateBoundedContext = () =>
  useMutation({ mutationFn: (v: { data: ContextInput }) => request<Context>('POST', '/bounded-contexts', v.data) });
export const useUpdateBoundedContext = () =>
  useMutation({ mutationFn: (v: { id: string; data: ContextUpdate }) => request<Context>('PATCH', `/bounded-contexts/${v.id}`, v.data) });
export const useDeleteBoundedContext = () =>
  useMutation({ mutationFn: (v: { id: string }) => request<void>('DELETE', `/bounded-contexts/${v.id}`) });

export const useCreateDomainNode = () =>
  useMutation({ mutationFn: (v: { data: DomainNodeInput }) => request<DomainNode>('POST', '/domain-nodes', v.data) });
export const useUpdateDomainNode = () =>
  useMutation({ mutationFn: (v: { id: string; data: DomainNodeUpdate }) => request<DomainNode>('PATCH', `/domain-nodes/${v.id}`, v.data) });
export const useDeleteDomainNode = () =>
  useMutation({ mutationFn: (v: { id: string }) => request<void>('DELETE', `/domain-nodes/${v.id}`) });

export const useCreateRelationship = () =>
  useMutation({ mutationFn: (v: { data: RelationshipInput }) => request<Relationship>('POST', '/relationships', v.data) });
export const useUpdateRelationship = () =>
  useMutation({ mutationFn: (v: { id: string; data: RelationshipUpdate }) => request<Relationship>('PATCH', `/relationships/${v.id}`, v.data) });
export const useDeleteRelationship = () =>
  useMutation({ mutationFn: (v: { id: string }) => request<void>('DELETE', `/relationships/${v.id}`) });

/** Save element / context positions after a drag, a tidy-up, or first placement. */
export const saveLayout = (body: { nodes: Array<{ id: string; x: number; y: number }>; contexts: Array<{ id: string; x: number; y: number }> }) =>
  request<{ updated: number }>('PUT', '/workspace/layout', body);

export const useCreateGlossaryTerm = () =>
  useMutation({ mutationFn: (v: { data: GlossaryInput }) => request<GlossaryTerm>('POST', '/glossary', v.data) });
export const useDeleteGlossaryTerm = () =>
  useMutation({ mutationFn: (v: { id: string }) => request<void>('DELETE', `/glossary/${v.id}`) });

export const useCreateSchemaConnection = () =>
  useMutation({ mutationFn: (v: { data: ConnectionInput }) => request<Connection>('POST', '/schema-connections', v.data) });
export const useDeleteSchemaConnection = () =>
  useMutation({ mutationFn: (v: { id: string }) => request<void>('DELETE', `/schema-connections/${v.id}`) });
export const useIntrospectSchemaConnection = () =>
  useMutation({
    mutationFn: (v: { id: string; data?: { password?: string; username?: string } }) =>
      request<SchemaSnapshot>('POST', `/schema-connections/${v.id}/introspect`, v.data ?? {}),
    // The connections page handles `credentials_required` itself by asking for the password.
    meta: { silentCodes: ['credentials_required'] },
  });
export type ImportResult = { created: number; reused: number; relationships: number; skippedTables: string[] };
export const useImportSchema = () =>
  useMutation({
    mutationFn: (v: { id: string; data: { contextId: string; tables?: string[] } }) =>
      request<ImportResult>('POST', `/schema-connections/${v.id}/import`, v.data),
  });
export const getConnectionSnapshot = (id: string) => request<SchemaSnapshot | null>('GET', `/schema-connections/${id}/snapshot`);

// ------------------------------------------------------------------ AI + export (plain calls)

export type DesignerInfo = { id: 'gemini-adk' | 'mock'; name: string; description: string };
export type GenerateDomainResult = {
  source: 'gemini-adk' | 'mock';
  designer: DesignerInfo;
  model: string | null;
  /** Present when the offline sketch ran instead of Gemini. */
  fallbackReason: string | null;
  dropped: string[];
  design: DomainDesign;
  applied: boolean;
};
export const generateDomain = (prompt: string, apply: boolean) =>
  request<GenerateDomainResult>('POST', '/ai/generate-domain', { prompt, apply, mode: 'merge' });
/** Apply the design the user previewed — no second model call. */
export const applyDomain = (design: DomainDesign) =>
  request<{ dropped: string[] }>('POST', '/ai/apply-domain', { design, mode: 'merge' });

export type CodegenOptions = {
  stack: string;
  packageName?: string;
  scope: 'full' | 'commands' | 'events' | 'read-models' | 'sagas';
  includeTests: boolean;
};
export type GenerateCodeResult = {
  source: 'gemini-adk' | 'mock';
  generator: DesignerInfo;
  model: string | null;
  fallbackReason: string | null;
  codegen: {
    stack: string;
    packageName: string;
    summary: string;
    files: Array<{ path: string; language: string; description: string; content: string }>;
  };
};
export const generateCode = (options: CodegenOptions) => request<GenerateCodeResult>('POST', '/ai/generate-code', options);

export const fetchExport = () => request<DomainExportDocument>('GET', '/workspace/export');

/** Save JSON to disk through the browser. */
export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
