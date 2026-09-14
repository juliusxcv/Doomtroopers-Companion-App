// A plain https://youtube.com/watch link rather than an <iframe> embed or a
// custom youtube:// scheme — this is the URL Android/iOS already recognize
// as a YouTube universal/app link, so tapping it opens the native app
// directly when installed and falls back to the browser otherwise, with no
// extra plumbing needed. Also keeps the trailer to one compact row instead
// of a full-width video player taking over the screen.
export function VideoLink({ videoId, label }: { videoId: string; label: string }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase transition hover:bg-phosphor/20"
    >
      <span aria-hidden="true">▶</span>
      Watch {label}
    </a>
  )
}
