import { Handshake, ShieldCheck, Zap } from 'lucide-react';

const HIGHLIGHTS = [
  { Icon: ShieldCheck, label: 'Secure Checkout' },
  { Icon: Zap, label: 'High Performance' },
  { Icon: Handshake, label: 'Fair for Everyone' },
];

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t pt-6 text-sm text-muted-foreground">
      {HIGHLIGHTS.map(({ Icon, label }) => (
        <span key={label} className="flex items-center gap-2">
          <Icon className="size-5" aria-hidden /> {label}
        </span>
      ))}
    </footer>
  );
}
