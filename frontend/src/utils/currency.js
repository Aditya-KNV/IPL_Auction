export const normalizeCroreAmount = (amount) => Number(Number(amount || 0).toFixed(2));

export const formatCroreAmount = (amount) =>
  normalizeCroreAmount(amount).toFixed(2).replace(/\.?0+$/, '');
