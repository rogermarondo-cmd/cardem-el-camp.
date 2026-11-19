// Combine independent provider quotes without ever substituting estimated prices.
export function summarizeQuotes({ flights, stays, travelers, budget }) {
  const count = Number(travelers);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw Error('Invalid traveler count');
  const flight = flights?.offers?.find(o => Number.isFinite(Number(o.amount)) && Number(o.amount) > 0 && o.currency === 'EUR');
  const stay = stays?.offers?.find(o => Number.isFinite(Number(o.amount)) && Number(o.amount) > 0 && (stays.currency === 'EUR' || o.currency === 'EUR'));
  const flightVerified = flights?.provider === 'Duffel' && !!flight && !!flight.expiresAt && Date.parse(flight.expiresAt) > Date.now();
  const stayVerified = stays?.provider === 'Booking.com' && !!stay && typeof stay.url === 'string' && /^https:\/\/(www\.)?booking\.com\//.test(stay.url);
  const flightTotal = flightVerified ? Number(flight.amount) : null;
  const stayTotal = stayVerified ? Number(stay.amount) : null;
  const knownTotal = (flightTotal ?? 0) + (stayTotal ?? 0);
  const complete = flightTotal !== null && stayTotal !== null;
  const max = budget === null || budget === undefined || budget === '' ? null : Number(budget);
  if (max !== null && (!Number.isFinite(max) || max < 0)) throw Error('Invalid budget');
  return {
    currency: 'EUR',
    flight: flightVerified ? { amount: flightTotal, airline: flight.airline, expiresAt: flight.expiresAt } : null,
    stay: stayVerified ? { amount: stayTotal, name: stay.name, url: stay.url } : null,
    knownTotal: Math.round(knownTotal * 100) / 100,
    complete,
    perPersonKnown: Math.round(knownTotal / count * 100) / 100,
    remainingBeforeLocalCosts: max === null ? null : Math.round((max - knownTotal) * 100) / 100,
    missing: [...(flightVerified ? [] : ['flight']), ...(stayVerified ? [] : ['stay']), 'local_transport', 'meals', 'activities'],
    disclaimer: 'Només inclou tarifes verificades de vols i allotjaments disponibles. No és un pressupost complet ni una reserva.'
  };
}
