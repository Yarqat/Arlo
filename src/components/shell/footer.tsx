import { YarqatMark } from "./brand";

/** App footer — credits Yarqat and links to the site. */
export function Footer() {
  return (
    <footer className="mx-auto mt-10 w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row">
        <a
          href="https://yarqat.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 transition-colors hover:text-foreground"
        >
          <span className="text-muted-2">Built by</span>
          <YarqatMark className="size-5 rounded-md" />
          <span className="font-semibold text-foreground">Yarqat</span>
          <span className="text-muted-2 group-hover:text-foreground">· yarqat.com</span>
        </a>
        <p className="text-xs text-muted-2">© {new Date().getFullYear()} Yarqat · Arlo</p>
      </div>
    </footer>
  );
}
