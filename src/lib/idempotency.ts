type Reservation = {
  expiresAt: number;
};

const reservations = new Map<string, Reservation>();

function cleanupExpiredReservations() {
  const now = Date.now();

  for (const [key, reservation] of reservations.entries()) {
    if (reservation.expiresAt <= now) {
      reservations.delete(key);
    }
  }
}

export function reserveIdempotencyKey(key: string, ttlMs: number): boolean {
  cleanupExpiredReservations();

  const existing = reservations.get(key);
  if (existing) {
    return false;
  }

  reservations.set(key, {
    expiresAt: Date.now() + ttlMs
  });

  return true;
}

export function releaseIdempotencyKey(key: string) {
  reservations.delete(key);
}
