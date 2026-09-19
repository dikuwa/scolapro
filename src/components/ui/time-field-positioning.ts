export type TimePanelViewport = {
  width: number;
  height: number;
  left: number;
  top: number;
};

export type TimePanelAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TimePanelSize = {
  width: number;
  height: number;
};

const VIEWPORT_MARGIN = 16;
const PANEL_GAP = 4;

export function resolveTimePanelPlacement(
  anchor: TimePanelAnchor,
  panel: TimePanelSize,
  viewport: TimePanelViewport,
) {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const minLeft = viewport.left + VIEWPORT_MARGIN;
  const maxLeft = Math.max(
    minLeft,
    viewportRight - VIEWPORT_MARGIN - panel.width,
  );
  const left = Math.min(
    Math.max(anchor.right - panel.width, minLeft),
    maxLeft,
  );

  const below = anchor.bottom + PANEL_GAP;
  const above = anchor.top - PANEL_GAP - panel.height;
  const top =
    below + panel.height <= viewportBottom - VIEWPORT_MARGIN
      ? below
      : Math.max(viewport.top + VIEWPORT_MARGIN, above);

  return {
    left,
    top,
    maxWidth: Math.max(0, viewport.width - VIEWPORT_MARGIN * 2),
    maxHeight: Math.max(0, viewport.height - VIEWPORT_MARGIN * 2),
  };
}
