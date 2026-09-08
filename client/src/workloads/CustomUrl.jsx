export default function CustomUrlViewer({ url }) {
  return (
    <div className="custom-iframe-wrap">
      <iframe
        src={url}
        title="Reference page — not profiled"
        className="custom-iframe"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      />
      <div className="iframe-overlay-hud">
        <span className="iframe-url-tag">
          Visual only · overlay measures this WebView, not the iframe GPU · {url.replace(/^https?:\/\//, "").slice(0, 40)}
        </span>
      </div>
    </div>
  );
}
