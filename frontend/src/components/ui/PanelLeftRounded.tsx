import * as React from 'react';

interface PanelLeftRoundedProps extends React.SVGProps<SVGSVGElement> {}

/**
 * Split-pane sidebar icon with rounded edges — a PanelLeft-style glyph
 * (left panel + divider) drawn with curved corners instead of the sharp
 * rect used by the lucide equivalent.
 */
export const PanelLeftRounded: React.FC<PanelLeftRoundedProps> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);
