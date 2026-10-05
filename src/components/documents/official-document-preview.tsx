export function OfficialDocumentPreview({
  src,
  title,
  orientation = "portrait",
  helper,
}: {
  src: string;
  title: string;
  orientation?: "portrait" | "landscape";
  helper?: string;
}) {
  const sizeClass =
    orientation === "landscape"
      ? "h-[210mm] w-[297mm] min-h-[210mm] min-w-[297mm]"
      : "h-[297mm] w-[210mm] min-h-[297mm] min-w-[210mm]";

  return (
    <div className="max-w-full overflow-auto bg-surface-muted p-2 sm:p-4">
      <iframe
        title={title}
        src={src}
        className={"block shrink-0 border-0 bg-white shadow-[var(--shadow-sm)] " + sizeClass}
      />
      {helper ? (
        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
