export function extractEftaId(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const match = value.toUpperCase().match(/EFTA\d{8}/);
  return match ? match[0] : null;
}
