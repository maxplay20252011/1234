/**
 * Iconos en SVG.
 *
 * No se usan caracteres Unicode como flechas: ◀ y ▶ tienen forma de emoji por
 * defecto en la mayoria de los sistemas y salen de color, mientras que ▲ y ▼
 * salen como texto. Queda inconsistente y no hay forma confiable de forzarlo
 * desde CSS. Con SVG el dibujo es el mismo en todos lados y hereda el color.
 */

type IconProps = { className?: string };

const base = 'size-6 fill-current';

export function ChevronUp({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 7 4 17h16z" />
    </svg>
  );
}

export function ChevronDown({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 17 4 7h16z" />
    </svg>
  );
}

export function ChevronLeft({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 12 17 4v16z" />
    </svg>
  );
}

export function ChevronRight({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M17 12 7 20V4z" />
    </svg>
  );
}

export function SpeakerOn({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7 1 1 0 0 0 1.4 1.4 7 7 0 0 0 0-9.8 1 1 0 1 0-1.4 1.4Z" />
    </svg>
  );
}

export function SpeakerMuted({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.3 9.3a1 1 0 0 1 1.4 0l1.3 1.3 1.3-1.3a1 1 0 1 1 1.4 1.4L20.4 12l1.3 1.3a1 1 0 0 1-1.4 1.4L19 13.4l-1.3 1.3a1 1 0 0 1-1.4-1.4l1.3-1.3-1.3-1.3a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

export function Power({ className = base }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3v9" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}
