import { test, expect } from '@playwright/test';
import { sampleBooking, type CreateBookingResponse } from './helpers.js';

/**
 * Full CRUD lifecycle against restful-booker.
 *
 * Auth: the API issues a token via /auth used for update/delete.
 * Each test is independent; the lifecycle test creates its own data.
 */

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
    }
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

    // Authenticate for write operations
    const auth = await request.post('/auth', {
      data: { username: 'admin', password: 'password123' },
    });
    const { token } = (await auth.json()) as { token: string };
    expect(token).toBeTruthy();

    // Update
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
});
