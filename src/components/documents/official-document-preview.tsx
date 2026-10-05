export function OfficialDocumentPreview({
  src,
  title,
  orientation = "portrait",
  helper,
  fit = "page",
}: {
  src: string;
  title: string;
  orientation?: "portrait" | "landscape";
  helper?: string;
  fit?: "page" | "viewport";
}) {
  const sizeClass = fit === "viewport"
    ? "h-[clamp(44rem,78vh,70rem)] w-full min-w-0"
    : orientation === "landscape"
      ? "h-[210mm] w-[297mm] min-h-[210mm] min-w-[297mm]"
      : "h-[297mm] w-[210mm] min-h-[297mm] min-w-[210mm]";

  const shellClass = fit === "viewport"
    ? "w-full overflow-hidden bg-surface-muted"
    : "max-w-full overflow-auto bg-surface-muted p-2 sm:p-4";

  return (
    <div className={shellClass}>
      <iframe
        title={title}
        src={src}
        className={"block shrink-0 border-0 bg-white shadow-[var(--shadow-sm)] " + sizeClass}
      />
      {helper ? (
        <p className="px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
