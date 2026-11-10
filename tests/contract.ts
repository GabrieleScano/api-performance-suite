import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { parse } from 'yaml';
import { expect, type APIResponse } from '@playwright/test';

/**
 * Contract validation against openapi.yaml (unofficial, hand-written — see README).
 *
 * Response bodies are validated with ajv against the schema the contract declares
 * for (operationId, status, content type). An undocumented status code or content
 * type is itself a contract violation.
 */

const SPEC_ID = 'restful-booker.openapi';
const SPEC_PATH = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

interface MediaType { schema?: unknown }
interface ResponseObject { $ref?: string; content?: Record<string, MediaType> }
interface Operation { operationId?: string; responses?: Record<string, ResponseObject> }

export const spec = parse(readFileSync(SPEC_PATH, 'utf8')) as {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components: { responses?: Record<string, ResponseObject> };
};

// ajv-formats ships CJS; under NodeNext the callable lives on .default.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addKeyword({ keyword: 'x-apidoc-discrepancy', schemaType: 'string' });
// Top-level OpenAPI fields are not JSON Schema keywords: declare them so strict
// mode accepts the document root, while every real schema stays strictly checked.
ajv.addVocabulary([
  'openapi', 'info', 'jsonSchemaDialect', 'servers', 'paths',
  'webhooks', 'components', 'security', 'tags', 'externalDocs',
]);
// Register the whole document so internal "#/components/..." refs resolve.
// Only the schema fragments we point at are ever compiled.
ajv.addSchema(spec as object, `${SPEC_ID}.doc`, undefined, false);

/** RFC 6901 pointer segment, then URI-fragment encoded. */
const seg = (s: string): string => encodeURIComponent(s.replace(/~/g, '~0').replace(/\//g, '~1'));

interface Located { path: string; method: string; op: Operation }

const operations = new Map<string, Located>();
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (op?.operationId) operations.set(op.operationId, { path, method, op });
  }
}

export const operationIds = [...operations.keys()];

const cache = new Map<string, ValidateFunction>();

function resolveResponse(r: ResponseObject): { obj: ResponseObject; pointer: string } | undefined {
  if (!r.$ref) return undefined;
  const name = r.$ref.replace('#/components/responses/', '');
  const obj = spec.components.responses?.[name];
  return obj ? { obj, pointer: `/components/responses/${seg(name)}` } : undefined;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`);
}

/**
 * Validate a response body against the contract.
 * Returns a list of violations (empty = the response honours the contract).
 */
export function validateResponse(
  operationId: string,
  status: number,
  body: unknown,
  contentType = 'application/json',
): string[] {
  const located = operations.get(operationId);
  if (!located) throw new Error(`Unknown operationId "${operationId}" — not in openapi.yaml`);
  const { path, method, op } = located;

  const declared = op.responses?.[String(status)];
  if (!declared) {
    const documented = Object.keys(op.responses ?? {}).join(', ');
    return [`status ${status} is not documented for ${operationId} (documented: ${documented})`];
  }

  let pointer = `/paths/${seg(path)}/${method}/responses/${status}`;
  let response = declared;
  const ref = resolveResponse(declared);
  if (ref) ({ obj: response, pointer } = ref);

  const media = contentType.split(';')[0]!.trim().toLowerCase();
  if (!response.content?.[media]) {
    const documented = Object.keys(response.content ?? {}).join(', ') || 'none';
    return [`content type "${media}" is not documented for ${operationId} ${status} (documented: ${documented})`];
  }

  const key = `${SPEC_ID}.doc#${pointer}/content/${seg(media)}/schema`;
  let validate = cache.get(key);
  if (!validate) {
    validate = ajv.getSchema(key);
    if (!validate) throw new Error(`Could not compile schema at ${key}`);
    cache.set(key, validate);
  }
  return validate(body) ? [] : formatErrors(validate.errors);
}

/** Validate a named component schema (used for request payloads). */
export function validateSchema(name: string, value: unknown): string[] {
  const validate = ajv.getSchema(`${SPEC_ID}.doc#/components/schemas/${seg(name)}`);
  if (!validate) throw new Error(`Unknown schema "${name}"`);
  return validate(value) ? [] : formatErrors(validate.errors);
}

/**
 * Assert that a live response matches the contract for `operationId`
 * (status documented, content type documented, body valid). Returns the
 * parsed body for further assertions.
 */
export async function expectContract<T = unknown>(response: APIResponse, operationId: string): Promise<T> {
  const contentType = response.headers()['content-type'] ?? '';
  const body: unknown = contentType.includes('json') ? await response.json() : await response.text();
  const violations = validateResponse(operationId, response.status(), body, contentType);
  expect(violations, `${operationId} → ${response.status()} should honour openapi.yaml`).toEqual([]);
  return body as T;
}
