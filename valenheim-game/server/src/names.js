// Prüfung von Spielernamen: Länge, erlaubte Zeichen, reservierte und beleidigende Namen.
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'server', 'valenheim', 'buergermeister',
  'bürgermeister', 'praesident', 'präsident', 'regierung', 'support', 'staff', 'official', 'offiziell'];

// Kurze Grundliste (deutsch/englisch). Wird gegen den Namen ohne Sonderzeichen/Ziffern-Tricks geprüft.
const BAD = ['fick', 'fuck', 'hure', 'nutte', 'wichser', 'fotze', 'schlampe', 'hurensohn', 'bastard', 'arsch',
  'nazi', 'hitler', 'siegheil', 'nigg', 'neger', 'kanake', 'spast', 'behindert', 'schwuchtel', 'missgeburt',
  'penis', 'vagina', 'porn', 'sex', 'cunt', 'bitch', 'whore', 'slut', 'cock', 'pussy', 'rape', 'vergewalt',
  'kys', 'isis', 'terror'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

export function normalize(name) {
  return name.toLowerCase().replace(/[013457 8@$]/g, (c) => LEET[c] ?? c).replace(/[^a-zäöüß]/g, '');
}

// Gibt null zurück, wenn der Name gültig ist, sonst eine deutsche Fehlermeldung.
export function checkName(raw) {
  if (typeof raw !== 'string') return 'Bitte gib einen Namen ein.';
  const name = raw.trim();
  if (name.length < 3) return 'Der Name muss mindestens 3 Zeichen lang sein.';
  if (name.length > 16) return 'Der Name darf höchstens 16 Zeichen lang sein.';
  if (!/^[A-Za-z0-9ÄÖÜäöüß_.\-]+$/.test(name)) return 'Erlaubt sind Buchstaben, Ziffern sowie _ . -';
  if (!/[A-Za-zÄÖÜäöüß]/.test(name)) return 'Der Name muss mindestens einen Buchstaben enthalten.';
  const n = normalize(name);
  if (RESERVED.includes(name.toLowerCase()) || RESERVED.includes(n)) return 'Dieser Name ist reserviert.';
  if (BAD.some((b) => n.includes(b))) return 'Dieser Name ist nicht erlaubt.';
  return null;
}
