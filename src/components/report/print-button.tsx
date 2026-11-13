'use client';

/** Opens the browser's print dialog, where "Save as PDF" makes the file. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cursor-pointer rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
    >
      Export PDF
    </button>
  );
}
