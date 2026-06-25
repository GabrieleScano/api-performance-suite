import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  sampleBooking,
  validateBooking,
  validateCreateResponse,
  type CreateBookingResponse,
} from './helpers.js';

/**
 * Functional API tests against restful-booker.
 *
 * Auth: the API issues a token via /auth used for update/delete.
 * Each test is independent and creates its own data where needed.
 */

/** Obtain an auth token for write operations. */
async function getToken(request: APIRequestContext): Promise<string> {
  const auth = await request.post('/auth', {
    data: { username: 'admin', password: 'password123' },
  });
  const { token } = (await auth.json()) as { token: string };
  expect(token, 'auth should return a token for valid credentials').toBeTruthy();
  return token;
}

/** Create a booking and return its id. */
async function createBooking(request: APIRequestContext): Promise<number> {
  const created = await request.post('/booking', { data: sampleBooking() });
  expect(created.status()).toBe(200);
  const { bookingid } = (await created.json()) as CreateBookingResponse;
  return bookingid;
}

test.describe('Health and contract', () => {
  test('ping endpoint responds healthy', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.status()).toBe(201);
  });

  test('listing bookings returns an array of ids', async ({ request }) => {
    const response = await request.get('/booking');
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as Array<{ bookingid: number }>;
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('bookingid');
      expect(typeof body[0]?.bookingid).toBe('number');
    }
  });

  test('a created booking matches the documented schema', async ({ request }) => {
    const created = await request.post('/booking', { data: sampleBooking() });
    expect(created.status()).toBe(200);
    const body = await created.json();
    expect(validateCreateResponse(body), 'create response should match the contract').toEqual([]);
  });
});

test.describe('Booking lifecycle', () => {
  test('creates, reads, updates and deletes a booking', async ({ request }) => {
    // Create
    const created = await request.post('/booking', { data: sampleBooking() });
    expect(created.status()).toBe(200);
    const { bookingid, booking } = (await created.json()) as CreateBookingResponse;
    expect(bookingid).toBeGreaterThan(0);
    expect(booking.firstname).toBe('Gabriele');

    // Read
    const read = await request.get(`/booking/${bookingid}`);
    expect(read.ok()).toBeTruthy();
    const fetched = await read.json();
    expect(fetched.lastname).toBe('Scano');
    expect(validateBooking(fetched), 'fetched booking should match the contract').toEqual([]);

    const token = await getToken(request);

    // Update (full replace)
    const updated = await request.put(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
      data: { ...sampleBooking(), totalprice: 500 },
    });
    expect(updated.ok()).toBeTruthy();
    const updatedBody = await updated.json();
    expect(updatedBody.totalprice).toBe(500);

    // Delete
    const deleted = await request.delete(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
    });
    expect(deleted.status()).toBe(201);

    // Confirm it is gone
    const readDeleted = await request.get(`/booking/${bookingid}`);
    expect(readDeleted.status()).toBe(404);
  });

  test('partial update changes only the targeted field', async ({ request }) => {
    const bookingid = await createBooking(request);
    const token = await getToken(request);

    const patched = await request.patch(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
      data: { firstname: 'Patched' },
    });
    expect(patched.ok()).toBeTruthy();
    const body = await patched.json();
    expect(body.firstname).toBe('Patched');
    // Untouched fields are preserved.
    expect(body.lastname).toBe('Scano');
    expect(body.totalprice).toBe(250);
  });

  test('bookings can be filtered by name', async ({ request }) => {
    const booking = sampleBooking();
    await createBooking(request);

    const response = await request.get(
      `/booking?firstname=${booking.firstname}&lastname=${booking.lastname}`,
    );
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as Array<{ bookingid: number }>;
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });
});

test.describe('Authentication', () => {
  test('valid credentials return a token', async ({ request }) => {
    const token = await getToken(request);
    expect(token.length).toBeGreaterThan(0);
  });

  test('invalid credentials do not return a token', async ({ request }) => {
    const response = await request.post('/auth', {
      data: { username: 'admin', password: 'wrong-password' },
    });
    // restful-booker answers 200 with a reason instead of a token.
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { token?: string; reason?: string };
    expect(body.token).toBeUndefined();
    expect(body.reason).toBe('Bad credentials');
  });
});

test.describe('Negative cases', () => {
  test('returns 404 for a non-existent booking', async ({ request }) => {
    const response = await request.get('/booking/99999999');
    expect(response.status()).toBe(404);
  });

  test('rejects update without a valid token', async ({ request }) => {
    const response = await request.put('/booking/1', { data: sampleBooking() });
    expect(response.status()).toBe(403);
  });

  test('rejects delete without a valid token', async ({ request }) => {
    const bookingid = await createBooking(request);
    const response = await request.delete(`/booking/${bookingid}`);
    expect(response.status()).toBe(403);
  });
});
