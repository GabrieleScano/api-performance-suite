import { test, expect, type APIRequestContext } from '@playwright/test';
import { sampleBooking, type Booking, type CreateBookingResponse } from './helpers.js';
import { expectContract } from '../contract.js';

/**
 * Functional API tests against restful-booker.
 *
 * Every response is checked against openapi.yaml (status, content type and
 * body schema) via expectContract, on top of the behavioural assertions.
 *
 * Auth: the API issues a token via /auth used for update/delete.
 * Each test is independent and creates its own data where needed.
 */

/** Obtain an auth token for write operations. */
async function getToken(request: APIRequestContext): Promise<string> {
  const auth = await request.post('/auth', {
    data: { username: 'admin', password: 'password123' },
  });
  const { token } = await expectContract<{ token?: string }>(auth, 'createToken');
  expect(token, 'auth should return a token for valid credentials').toBeTruthy();
  return token!;
}

/** Create a booking and return its id. */
async function createBooking(request: APIRequestContext): Promise<number> {
  const created = await request.post('/booking', { data: sampleBooking() });
  expect(created.status()).toBe(200);
  const { bookingid } = await expectContract<CreateBookingResponse>(created, 'createBooking');
  return bookingid;
}

test.describe('Health and contract', () => {
  test('ping endpoint responds healthy', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.status()).toBe(201);
    await expectContract(response, 'healthCheck');
  });

  test('listing bookings returns an array of ids', async ({ request }) => {
    const response = await request.get('/booking');
    expect(response.ok()).toBeTruthy();
    const body = await expectContract<Array<{ bookingid: number }>>(response, 'getBookingIds');
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('a created booking matches the contract', async ({ request }) => {
    const created = await request.post('/booking', { data: sampleBooking() });
    expect(created.status()).toBe(200);
    const body = await expectContract<CreateBookingResponse>(created, 'createBooking');
    expect(body.booking).toEqual(sampleBooking());
  });
});

test.describe('Booking lifecycle', () => {
  test('creates, reads, updates and deletes a booking', async ({ request }) => {
    // Create
    const created = await request.post('/booking', { data: sampleBooking() });
    expect(created.status()).toBe(200);
    const { bookingid, booking } = await expectContract<CreateBookingResponse>(created, 'createBooking');
    expect(bookingid).toBeGreaterThan(0);
    expect(booking.firstname).toBe('Gabriele');

    // Read
    const read = await request.get(`/booking/${bookingid}`);
    expect(read.ok()).toBeTruthy();
    const fetched = await expectContract<Booking>(read, 'getBooking');
    expect(fetched.lastname).toBe('Scano');

    const token = await getToken(request);

    // Update (full replace)
    const updated = await request.put(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
      data: { ...sampleBooking(), totalprice: 500 },
    });
    expect(updated.ok()).toBeTruthy();
    const updatedBody = await expectContract<Booking>(updated, 'updateBooking');
    expect(updatedBody.totalprice).toBe(500);

    // Delete
    const deleted = await request.delete(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
    });
    expect(deleted.status()).toBe(201);
    await expectContract(deleted, 'deleteBooking');

    // Confirm it is gone
    const readDeleted = await request.get(`/booking/${bookingid}`);
    expect(readDeleted.status()).toBe(404);
    await expectContract(readDeleted, 'getBooking');
  });

  test('partial update changes only the targeted field', async ({ request }) => {
    const bookingid = await createBooking(request);
    const token = await getToken(request);

    const patched = await request.patch(`/booking/${bookingid}`, {
      headers: { Cookie: `token=${token}` },
      data: { firstname: 'Patched' },
    });
    expect(patched.ok()).toBeTruthy();
    const body = await expectContract<Booking>(patched, 'partialUpdateBooking');
    expect(body.firstname).toBe('Patched');
    // Untouched fields are preserved.
    expect(body.lastname).toBe('Scano');
    expect(body.totalprice).toBe(250);
  });

  test('bookings can be filtered by name', async ({ request }) => {
    const booking = sampleBooking();
    const bookingid = await createBooking(request);

    const response = await request.get('/booking', {
      params: { firstname: booking.firstname, lastname: booking.lastname },
    });
    expect(response.ok()).toBeTruthy();
    const body = await expectContract<Array<{ bookingid: number }>>(response, 'getBookingIds');
    expect(body.map((b) => b.bookingid)).toContain(bookingid);
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
    const body = await expectContract<{ token?: string; reason?: string }>(response, 'createToken');
    expect(body.token).toBeUndefined();
    expect(body.reason).toBe('Bad credentials');
  });
});

test.describe('Negative cases', () => {
  test('returns 404 for a non-existent booking', async ({ request }) => {
    const response = await request.get('/booking/99999999');
    expect(response.status()).toBe(404);
    await expectContract(response, 'getBooking');
  });

  test('rejects update without a valid token', async ({ request }) => {
    const bookingid = await createBooking(request);
    const response = await request.put(`/booking/${bookingid}`, { data: sampleBooking() });
    expect(response.status()).toBe(403);
    await expectContract(response, 'updateBooking');
  });

  test('rejects delete without a valid token', async ({ request }) => {
    const bookingid = await createBooking(request);
    const response = await request.delete(`/booking/${bookingid}`);
    expect(response.status()).toBe(403);
    await expectContract(response, 'deleteBooking');
  });
});
