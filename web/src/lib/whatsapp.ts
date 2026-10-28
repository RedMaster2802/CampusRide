// web/src/lib/whatsapp.ts
// WhatsApp link builders

export function chatLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!/^[0-9]{10}$/.test(digits)) return '#';
  return `https://wa.me/91${digits}`;
}

export function shareAppLink(): string {
  const text = `Pool cabs with GatePool: ${window.location.origin}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}