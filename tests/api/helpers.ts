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
