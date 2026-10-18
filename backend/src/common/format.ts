/** Montant lisible pour un SMS : « 1 500 000 GNF ». */
export function formatMoney(amount: bigint, currency: string): string {
  const digits = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${digits} ${currency}`;
}

/** Date lisible pour un SMS : « 25/12/2027 ». */
export function formatDayFr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
