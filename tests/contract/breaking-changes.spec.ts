import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { operationIds, validateResponse, validateSchema } from '../contract.js';
import { sampleBooking } from '../api/helpers.js';

/**
 * Proves the contract has teeth: it must accept a known-good response and
 * reject realistic breaking changes a provider could ship.
 *
 * These run offline against fixtures — no network, fully deterministic.
 */

const goodBooking = () => ({
  firstname: 'Gabriele',
  lastname: 'Scano',
  totalprice: 250,
  depositpaid: true,
  bookingdates: { checkin: '2026-07-28', checkout: '2026-08-04' },
  additionalneeds: 'Breakfast',
});

type Mutation = {
  name: string;
  operationId: string;
  status: number;
  body: unknown;
  contentType?: string;
  /** Substring expected in at least one violation message. */
  expect: string;
};

const omit = <T extends object>(o: T, k: keyof T) => {
  const copy = { ...o };
  delete copy[k];
  return copy;
};

const breakingChanges: Mutation[] = [
  {
    name: 'required field removed',
    operationId: 'getBooking', status: 200,
    body: omit(goodBooking(), 'lastname'),
    expect: "required property 'lastname'",
  },
  {
    name: 'field renamed (camelCase)',
    operationId: 'getBooking', status: 200,
    body: (({ firstname, ...rest }) => ({ ...rest, firstName: firstname }))(goodBooking()),
    expect: "required property 'firstname'",
  },
  {
    name: 'price serialised as a string',
    operationId: 'getBooking', status: 200,
    body: { ...goodBooking(), totalprice: '250' },
    expect: '/totalprice must be integer',
  },
  {
    name: 'boolean serialised as a string',
    operationId: 'getBooking', status: 200,
    body: { ...goodBooking(), depositpaid: 'true' },
    expect: '/depositpaid must be boolean',
  },
  {
    name: 'date format changed to DD/MM/YYYY',
    operationId: 'getBooking', status: 200,
    body: { ...goodBooking(), bookingdates: { checkin: '28/07/2026', checkout: '04/08/2026' } },
    expect: '/bookingdates/checkin must match format "date"',
  },
  {
    name: 'nested object flattened',
    operationId: 'getBooking', status: 200,
    body: { ...omit(goodBooking(), 'bookingdates'), checkin: '2026-07-28', checkout: '2026-08-04' },
    expect: "required property 'bookingdates'",
  },
  {
    name: 'create response drops the id wrapper',
    operationId: 'createBooking', status: 200,
    body: goodBooking(),
    expect: "required property 'bookingid'",
  },
  {
    name: 'booking id becomes a UUID string',
    operationId: 'createBooking', status: 200,
    body: { bookingid: '7f1c9a2e-0000-4000-8000-000000000000', booking: goodBooking() },
    expect: '/bookingid must be integer',
  },
  {
    name: 'list endpoint returns bare ids instead of objects',
    operationId: 'getBookingIds', status: 200,
    body: [1, 2, 3],
    expect: '/0 must be object',
  },
  {
    name: 'auth returns an empty token',
    operationId: 'createToken', status: 200,
    body: { token: '' },
    expect: 'must match exactly one schema in oneOf',
  },
  {
    name: 'delete status code changed to 200',
    operationId: 'deleteBooking', status: 200,
    body: 'OK', contentType: 'text/plain',
    expect: 'status 200 is not documented for deleteBooking',
  },
  {
    name: 'not-found switches to a JSON error body',
    operationId: 'getBooking', status: 404,
    body: { error: 'not found' }, contentType: 'application/json',
    expect: 'content type "application/json" is not documented',
  },
  {
    name: 'unauthorised write answers 401 instead of 403',
    operationId: 'updateBooking', status: 401,
    body: 'Unauthorized', contentType: 'text/plain',
    expect: 'status 401 is not documented',
  },
];

test.describe('Contract baseline', () => {
  test('a known-good booking honours the contract', () => {
    expect(validateResponse('getBooking', 200, goodBooking())).toEqual([]);
  });

  test('additionalneeds is optional (observed behaviour, unlike the apidoc)', () => {
    expect(validateResponse('getBooking', 200, omit(goodBooking(), 'additionalneeds'))).toEqual([]);
  });

  test('additive, non-breaking fields are tolerated', () => {
    expect(validateResponse('getBooking', 200, { ...goodBooking(), loyaltyTier: 'gold' })).toEqual([]);
  });

  test('the request payload used by the suite is itself contract-valid', () => {
    expect(validateSchema('Booking', sampleBooking())).toEqual([]);
  });
});

test.describe('Contract rejects breaking changes', () => {
  for (const m of breakingChanges) {
    test(m.name, () => {
      const violations = validateResponse(m.operationId, m.status, m.body, m.contentType);
      expect(violations.length, `"${m.name}" should be flagged`).toBeGreaterThan(0);
      expect(violations.join('\n')).toContain(m.expect);
    });
  }
});

test('every documented operation is exercised by the live API suite', () => {
  const suite = readFileSync(new URL('../api/booking.spec.ts', import.meta.url), 'utf8');
  const uncovered = operationIds.filter((id) => !suite.includes(`'${id}'`));
  expect(uncovered, 'operations in openapi.yaml with no live contract check').toEqual([]);
});
