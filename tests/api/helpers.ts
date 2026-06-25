/**
 * Types mirroring the restful-booker API contract.
 */

export interface BookingDates {
  checkin: string;
  checkout: string;
}

export interface Booking {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: BookingDates;
  additionalneeds?: string;
}

export interface CreateBookingResponse {
  bookingid: number;
  booking: Booking;
}

export function sampleBooking(): Booking {
  return {
    firstname: 'Gabriele',
    lastname: 'Scano',
    totalprice: 250,
    depositpaid: true,
    bookingdates: { checkin: '2026-07-28', checkout: '2026-08-04' },
    additionalneeds: 'Breakfast',
  };
}

/**
 * Lightweight, dependency-free contract checks.
 *
 * Returns the list of structural problems found in a value (empty = valid),
 * so specs can assert the response *shape*, not just status codes — the
 * essence of contract testing without pulling in a schema library.
 */
export function validateBooking(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return ['response is not an object'];
  }
  const b = value as Record<string, unknown>;

  const requireType = (key: string, type: 'string' | 'number' | 'boolean'): void => {
    if (typeof b[key] !== type) {
      errors.push(`"${key}" should be a ${type}, got ${typeof b[key]}`);
    }
  };

  requireType('firstname', 'string');
  requireType('lastname', 'string');
  requireType('totalprice', 'number');
  requireType('depositpaid', 'boolean');

  const dates = b.bookingdates;
  if (typeof dates !== 'object' || dates === null) {
    errors.push('"bookingdates" should be an object');
  } else {
    const d = dates as Record<string, unknown>;
    if (typeof d.checkin !== 'string') errors.push('"bookingdates.checkin" should be a string');
    if (typeof d.checkout !== 'string') errors.push('"bookingdates.checkout" should be a string');
  }

  if (b.additionalneeds !== undefined && typeof b.additionalneeds !== 'string') {
    errors.push('"additionalneeds" should be a string when present');
  }

  return errors;
}

/** Validate the wrapper returned by POST /booking. */
export function validateCreateResponse(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return ['response is not an object'];
  }
  const r = value as Record<string, unknown>;
  if (typeof r.bookingid !== 'number') errors.push('"bookingid" should be a number');
  errors.push(...validateBooking(r.booking).map((e) => `booking.${e}`));
  return errors;
}
