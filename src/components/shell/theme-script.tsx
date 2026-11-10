export const THEME_STORAGE_KEY = 'theme';

// Runs while the page is still loading, before anything is painted, so a
// saved light theme never flashes dark first.
const SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/** Applies the saved theme. Render it inside <head>. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
